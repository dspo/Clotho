use std::ops::Range;

use chrono::Utc;
use clotho_domain::{
    ProposalAction, ProposalActionType, ProposalArtifact, ProposalArtifactType, ProposalPayload,
    PROPOSAL_SCHEMA_VERSION,
};
use serde_json::{Map, Value};
use uuid::Uuid;

pub struct ExtractedProposal {
    pub proposal: ProposalPayload,
}

pub fn extract_proposal_from_message(
    text: &str,
    thread_id: &str,
    turn_id: &str,
) -> Option<ExtractedProposal> {
    if let Some(inner) = unwrap_single_code_fence(text) {
        if let Some(candidate) = parse_candidate(inner) {
            if let Some(proposal) = canonicalize(candidate.value, thread_id, turn_id) {
                return Some(ExtractedProposal { proposal });
            }
        }
    }

    let candidate = parse_candidate(text)?;
    let proposal = canonicalize(candidate.value, thread_id, turn_id)?;
    let _consume_source_message =
        text[..candidate.span.start].trim().is_empty() && text[candidate.span.end..].trim().is_empty();

    Some(ExtractedProposal { proposal })
}

struct JsonCandidate {
    value: Value,
    span: Range<usize>,
}

fn parse_candidate(input: &str) -> Option<JsonCandidate> {
    for (offset, _) in input.match_indices('{') {
        let substring = &input[offset..];
        let mut stream = serde_json::Deserializer::from_str(substring).into_iter::<Value>();
        if let Some(Ok(value)) = stream.next() {
            return Some(JsonCandidate {
                value,
                span: offset..offset + stream.byte_offset(),
            });
        }
    }
    None
}

fn unwrap_single_code_fence(text: &str) -> Option<&str> {
    let trimmed = text.trim();
    let body = trimmed.strip_prefix("```")?;
    let newline = body.find('\n')?;
    let rest = &body[newline + 1..];
    let end = rest.rfind("```")?;
    if rest[end + 3..].trim().is_empty() {
        Some(rest[..end].trim())
    } else {
        None
    }
}

fn canonicalize(value: Value, thread_id: &str, turn_id: &str) -> Option<ProposalPayload> {
    let mut object = value.as_object()?.clone();
    canonicalize_top_level(&mut object, thread_id, turn_id)?;

    let actions = object
        .remove("actions")
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default();
    let canonical_actions = actions
        .into_iter()
        .map(canonicalize_action)
        .collect::<Option<Vec<_>>>()?;
    object.insert("actions".to_string(), serde_json::to_value(canonical_actions).ok()?);

    let artifacts = object
        .remove("artifacts")
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default();
    let canonical_artifacts = artifacts
        .into_iter()
        .map(canonicalize_artifact)
        .collect::<Option<Vec<_>>>()?;
    object.insert(
        "artifacts".to_string(),
        serde_json::to_value(canonical_artifacts).ok()?,
    );

    serde_json::from_value(Value::Object(object)).ok()
}

fn canonicalize_top_level(
    object: &mut Map<String, Value>,
    thread_id: &str,
    turn_id: &str,
) -> Option<()> {
    set_default_string(object, &["schemaVersion", "schema_version"], PROPOSAL_SCHEMA_VERSION);
    set_default_string(object, &["proposalId", "proposal_id"], &Uuid::new_v4().to_string());
    set_default_string(object, &["threadId", "thread_id"], thread_id);
    set_default_string(object, &["turnId", "turn_id"], turn_id);
    set_default_string(object, &["generatedAt", "generated_at"], &Utc::now().to_rfc3339());

    require_string(object, &["summary"])?;
    require_string(object, &["intent"])?;
    normalize_optional_string(object, &["reasoningSummary", "reasoning_summary"]);
    normalize_string_array(object, &["warnings"]);
    normalize_bool(object, &["requiresConfirmation", "requires_confirmation"], true);
    Some(())
}

fn canonicalize_action(value: Value) -> Option<ProposalAction> {
    let mut object = value.as_object()?.clone();
    let action_type = take_string(&mut object, &["actionType", "action_type"])?;
    let action_type: ProposalActionType =
        serde_json::from_value(Value::String(action_type)).ok()?;
    let target_type = take_string(&mut object, &["targetType", "target_type"])
        .unwrap_or_else(|| action_type.default_target_type().to_string());
    let target_id = take_optional_string(&mut object, &["targetId", "target_id"]);
    let title = take_string(&mut object, &["title"])?;
    let summary = take_string(&mut object, &["summary"])?;
    let before_json = take_nested_json(&mut object, &["beforeJson", "before_json"]);
    let after_json = take_nested_json(&mut object, &["afterJson", "after_json"]).unwrap_or(Value::Object(Map::new()));
    let action_id = take_string(&mut object, &["actionId", "action_id"])
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    Some(ProposalAction {
        action_id,
        action_type,
        target_type,
        target_id,
        title,
        summary,
        before_json,
        after_json,
    })
}

fn canonicalize_artifact(value: Value) -> Option<ProposalArtifact> {
    let mut object = value.as_object()?.clone();
    let artifact_type = take_string(&mut object, &["artifactType", "artifact_type"])?;
    let artifact_type: ProposalArtifactType =
        serde_json::from_value(Value::String(artifact_type)).ok()?;
    let title = take_string(&mut object, &["title"])?;
    let content_json =
        take_nested_json(&mut object, &["contentJson", "content_json"]).unwrap_or(Value::Object(Map::new()));
    let artifact_id = take_string(&mut object, &["artifactId", "artifact_id"])
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    Some(ProposalArtifact {
        artifact_id,
        artifact_type,
        title,
        content_json,
    })
}

fn set_default_string(object: &mut Map<String, Value>, keys: &[&str], default: &str) {
    if let Some(existing) = take_string(object, keys) {
        object.insert(keys[0].to_string(), Value::String(existing));
    } else {
        object.insert(keys[0].to_string(), Value::String(default.to_string()));
    }
}

fn require_string(object: &mut Map<String, Value>, keys: &[&str]) -> Option<()> {
    let value = take_string(object, keys)?;
    object.insert(keys[0].to_string(), Value::String(value));
    Some(())
}

fn normalize_optional_string(object: &mut Map<String, Value>, keys: &[&str]) {
    let value = take_optional_string(object, keys);
    object.insert(
        keys[0].to_string(),
        value.map(Value::String).unwrap_or(Value::Null),
    );
}

fn normalize_string_array(object: &mut Map<String, Value>, keys: &[&str]) {
    let value = take_value(object, keys)
        .and_then(|value| value.as_array().cloned())
        .map(|items| {
            items.into_iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .map(Value::String)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    object.insert(keys[0].to_string(), Value::Array(value));
}

fn normalize_bool(object: &mut Map<String, Value>, keys: &[&str], default: bool) {
    let value = take_value(object, keys)
        .and_then(|value| value.as_bool())
        .unwrap_or(default);
    object.insert(keys[0].to_string(), Value::Bool(value));
}

fn take_value(object: &mut Map<String, Value>, keys: &[&str]) -> Option<Value> {
    for key in keys {
        if let Some(value) = object.remove(*key) {
            return Some(value);
        }
    }
    None
}

fn take_string(object: &mut Map<String, Value>, keys: &[&str]) -> Option<String> {
    take_value(object, keys)?
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn take_optional_string(object: &mut Map<String, Value>, keys: &[&str]) -> Option<String> {
    take_value(object, keys).and_then(|value| match value {
        Value::Null => None,
        Value::String(value) => {
            let trimmed = value.trim();
            (!trimmed.is_empty()).then(|| trimmed.to_string())
        }
        _ => None,
    })
}

fn take_nested_json(object: &mut Map<String, Value>, keys: &[&str]) -> Option<Value> {
    let value = take_value(object, keys)?;
    match value {
        Value::Null => None,
        Value::String(text) => serde_json::from_str::<Value>(&text).ok(),
        other => Some(other),
    }
}
