use std::ops::Range;

use chrono::Utc;
use clotho_adapter::{
    ProposalActionType, ProposalArtifactType, ProposalPayload, PROPOSAL_SCHEMA_VERSION,
};
use serde_json::{json, Map, Value};
use uuid::Uuid;

pub struct ExtractedProposal {
    pub proposal: ProposalPayload,
    pub source_message_id: String,
    pub consume_source_message: bool,
}

const WRITE_INTENT_KEYWORDS: &[&str] = &[
    "create task",
    "update task",
    "reschedule",
    "replan",
    "reprioritize",
    "decompose",
    "split into tasks",
    "draft proposal",
    "apply proposal",
    "create dependency",
    "delete dependency",
    "add tag",
    "remove tag",
    "创建任务",
    "新建任务",
    "更新任务",
    "修改任务",
    "调整任务",
    "重排",
    "排期",
    "重新排期",
    "重新安排",
    "安排今天",
    "安排本周",
    "拆解任务",
    "分解任务",
    "补全任务",
    "添加依赖",
    "删除依赖",
    "加标签",
    "移除标签",
];

const PLAN_PROPOSAL_HINT_KEYWORDS: &[&str] = &[
    "what should i do today",
    "what should i work on today",
    "what should i focus on today",
    "what should i do this week",
    "what should i work on this week",
    "what should i focus on this week",
    "how should i prioritize",
    "how should i replan",
    "how should i schedule",
    "plan my day",
    "plan my week",
    "今天做什么",
    "今天该做什么",
    "今天应该做什么",
    "今天先做什么",
    "本周做什么",
    "本周该做什么",
    "本周应该做什么",
    "如何安排今天",
    "如何安排本周",
    "怎么安排今天",
    "怎么安排本周",
    "如何规划今天",
    "如何规划本周",
];

pub fn extract_proposal_from_message(
    source_message_id: &str,
    text: &str,
    thread_id: &str,
    turn_id: &str,
) -> Option<ExtractedProposal> {
    if let Some(inner) = unwrap_single_code_fence(text) {
        if let Some(candidate) = parse_candidate(inner) {
            if let Some(proposal) = canonicalize(candidate.value, thread_id, turn_id) {
                return Some(ExtractedProposal {
                    proposal,
                    source_message_id: source_message_id.to_string(),
                    consume_source_message: true,
                });
            }
        }
    }

    let candidate = parse_candidate(text)?;
    let proposal = canonicalize(candidate.value, thread_id, turn_id)?;
    let consume_source_message = text[..candidate.span.start].trim().is_empty()
        && text[candidate.span.end..].trim().is_empty();

    Some(ExtractedProposal {
        proposal,
        source_message_id: source_message_id.to_string(),
        consume_source_message,
    })
}

pub fn extract_proposal_from_structured_output(
    source_message_id: &str,
    text: &str,
    thread_id: &str,
    turn_id: &str,
) -> Option<ExtractedProposal> {
    let value = serde_json::from_str::<Value>(text.trim()).ok()?;
    let proposal = canonicalize(value, thread_id, turn_id)?;
    Some(ExtractedProposal {
        proposal,
        source_message_id: source_message_id.to_string(),
        consume_source_message: true,
    })
}

pub fn canonicalize_candidate(
    value: Value,
    thread_id: &str,
    turn_id: &str,
) -> Option<ProposalPayload> {
    canonicalize(value, thread_id, turn_id)
}

pub fn should_request_structured_proposal(text: &str, mode: &str) -> bool {
    let normalized = text.to_lowercase();
    if WRITE_INTENT_KEYWORDS
        .iter()
        .any(|keyword| normalized.contains(keyword))
    {
        return true;
    }

    mode.eq_ignore_ascii_case("plan")
        && PLAN_PROPOSAL_HINT_KEYWORDS
            .iter()
            .any(|keyword| normalized.contains(keyword))
}

pub fn proposal_output_instruction() -> &'static str {
    "Return only one JSON object that matches the output schema. Produce a canonical Clotho proposal in snake_case. Use only allowed action_type and artifact_type values. Do not wrap the JSON in markdown. For before_json, after_json, and content_json, encode the nested object itself as a compact JSON string such as {\"due_date\":\"2026-04-05\"}; if it would be empty, use {} as the JSON string. If information is incomplete, keep actions conservative, put missing context into warnings or artifacts, and keep requires_confirmation=true."
}

pub fn proposal_output_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "schema_version": { "type": ["string", "null"] },
            "proposal_id": { "type": ["string", "null"] },
            "thread_id": { "type": ["string", "null"] },
            "turn_id": { "type": ["string", "null"] },
            "generated_at": { "type": ["string", "null"] },
            "summary": { "type": "string" },
            "intent": { "type": "string" },
            "reasoning_summary": { "type": ["string", "null"] },
            "warnings": {
                "type": "array",
                "items": { "type": "string" }
            },
            "requires_confirmation": { "type": "boolean" },
            "actions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "action_id": { "type": ["string", "null"] },
                        "action_type": {
                            "type": "string",
                            "enum": [
                                "create_task",
                                "update_task",
                                "reschedule_task",
                                "batch_update_tasks",
                                "create_dependency",
                                "delete_dependency",
                                "add_task_tag",
                                "remove_task_tag"
                            ]
                        },
                        "target_type": { "type": ["string", "null"] },
                        "target_id": { "type": ["string", "null"] },
                        "title": { "type": "string" },
                        "summary": { "type": "string" },
                        "before_json": { "type": ["string", "null"] },
                        "after_json": { "type": "string" }
                    },
                    "required": [
                        "action_id",
                        "action_type",
                        "target_type",
                        "target_id",
                        "title",
                        "summary",
                        "before_json",
                        "after_json"
                    ],
                    "additionalProperties": false
                }
            },
            "artifacts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "artifact_id": { "type": ["string", "null"] },
                        "artifact_type": {
                            "type": "string",
                            "enum": [
                                "routing_decision",
                                "execution_plan",
                                "analysis_report",
                                "schedule_report",
                                "task_brief",
                                "validator_notice"
                            ]
                        },
                        "title": { "type": "string" },
                        "content_json": { "type": "string" }
                    },
                    "required": ["artifact_id", "artifact_type", "title", "content_json"],
                    "additionalProperties": false
                }
            }
        },
        "required": [
            "schema_version",
            "proposal_id",
            "thread_id",
            "turn_id",
            "generated_at",
            "summary",
            "intent",
            "reasoning_summary",
            "warnings",
            "requires_confirmation",
            "actions",
            "artifacts"
        ],
        "additionalProperties": false
    })
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
        .get_mut("actions")
        .and_then(Value::as_array_mut)
        .cloned()
        .unwrap_or_default();
    let canonical_actions = actions
        .into_iter()
        .map(canonicalize_action)
        .collect::<Option<Vec<_>>>()?;
    object.insert("actions".to_string(), Value::Array(canonical_actions));

    let artifacts = object
        .get_mut("artifacts")
        .and_then(Value::as_array_mut)
        .cloned()
        .unwrap_or_default();
    let canonical_artifacts = artifacts
        .into_iter()
        .map(canonicalize_artifact)
        .collect::<Option<Vec<_>>>()?;
    object.insert("artifacts".to_string(), Value::Array(canonical_artifacts));

    serde_json::from_value(Value::Object(object)).ok()
}

fn canonicalize_top_level(
    object: &mut Map<String, Value>,
    thread_id: &str,
    turn_id: &str,
) -> Option<()> {
    if let Some(schema_version) = object.get("schema_version").and_then(Value::as_str) {
        if schema_version != PROPOSAL_SCHEMA_VERSION {
            return None;
        }
    }

    let summary = object
        .get("summary")
        .and_then(Value::as_str)
        .map(str::trim)?
        .to_string();
    let intent = object
        .get("intent")
        .and_then(Value::as_str)
        .map(str::trim)?
        .to_string();
    if summary.is_empty() || intent.is_empty() {
        return None;
    }

    object.insert(
        "schema_version".to_string(),
        Value::String(PROPOSAL_SCHEMA_VERSION.to_string()),
    );
    object.insert(
        "proposal_id".to_string(),
        Value::String(
            object
                .get("proposal_id")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| format!("prop_{}", Uuid::new_v4().simple())),
        ),
    );
    object.insert(
        "thread_id".to_string(),
        Value::String(thread_id.to_string()),
    );
    object.insert("turn_id".to_string(), Value::String(turn_id.to_string()));
    object.insert("summary".to_string(), Value::String(summary));
    object.insert("intent".to_string(), Value::String(intent));

    let generated_at = object
        .get("generated_at")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| Utc::now().to_rfc3339());
    object.insert("generated_at".to_string(), Value::String(generated_at));

    if !matches!(
        object.get("reasoning_summary"),
        Some(Value::String(_)) | Some(Value::Null)
    ) {
        object.insert("reasoning_summary".to_string(), Value::Null);
    }
    if !matches!(object.get("warnings"), Some(Value::Array(_))) {
        object.insert("warnings".to_string(), Value::Array(Vec::new()));
    }
    if !matches!(object.get("actions"), Some(Value::Array(_))) {
        object.insert("actions".to_string(), Value::Array(Vec::new()));
    }
    if !matches!(object.get("artifacts"), Some(Value::Array(_))) {
        object.insert("artifacts".to_string(), Value::Array(Vec::new()));
    }
    if !matches!(object.get("requires_confirmation"), Some(Value::Bool(_))) {
        object.insert("requires_confirmation".to_string(), Value::Bool(true));
    }

    Some(())
}

fn canonicalize_action(value: Value) -> Option<Value> {
    let mut object = value.as_object()?.clone();
    let action_type = parse_action_type(object.get("action_type")?.as_str()?)?;
    let title = object
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| action_type.as_str().to_string());
    let summary = object
        .get("summary")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| title.clone());

    object.insert(
        "action_id".to_string(),
        Value::String(
            object
                .get("action_id")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| format!("act_{}", Uuid::new_v4().simple())),
        ),
    );
    object.insert(
        "action_type".to_string(),
        Value::String(action_type.as_str().to_string()),
    );
    object.insert(
        "target_type".to_string(),
        Value::String(
            object
                .get("target_type")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| action_type.default_target_type().to_string()),
        ),
    );
    if !matches!(
        object.get("target_id"),
        Some(Value::String(_)) | Some(Value::Null)
    ) {
        object.insert("target_id".to_string(), Value::Null);
    }
    if let Some(before_json) = parse_nullable_embedded_object(object.get("before_json")) {
        object.insert("before_json".to_string(), before_json);
    } else {
        object.insert("before_json".to_string(), Value::Null);
    }
    if let Some(after_json) = parse_embedded_object(object.get("after_json")) {
        object.insert("after_json".to_string(), after_json);
    } else {
        object.insert("after_json".to_string(), json!({}));
    }
    object.insert("title".to_string(), Value::String(title));
    object.insert("summary".to_string(), Value::String(summary));

    Some(Value::Object(object))
}

fn canonicalize_artifact(value: Value) -> Option<Value> {
    let mut object = value.as_object()?.clone();
    let artifact_type = parse_artifact_type(object.get("artifact_type")?.as_str()?)?;
    let title = object
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("{artifact_type:?}"));

    object.insert(
        "artifact_id".to_string(),
        Value::String(
            object
                .get("artifact_id")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| format!("art_{}", Uuid::new_v4().simple())),
        ),
    );
    object.insert(
        "artifact_type".to_string(),
        Value::String(artifact_type_as_str(artifact_type).to_string()),
    );
    object.insert("title".to_string(), Value::String(title));
    if let Some(content_json) = parse_embedded_object(object.get("content_json")) {
        object.insert("content_json".to_string(), content_json);
    } else {
        object.insert("content_json".to_string(), json!({}));
    }

    Some(Value::Object(object))
}

fn parse_embedded_object(value: Option<&Value>) -> Option<Value> {
    match value? {
        Value::Object(object) => Some(Value::Object(object.clone())),
        Value::String(text) => {
            let parsed = serde_json::from_str::<Value>(text.trim()).ok()?;
            match parsed {
                Value::Object(_) => Some(parsed),
                _ => None,
            }
        }
        _ => None,
    }
}

fn parse_nullable_embedded_object(value: Option<&Value>) -> Option<Value> {
    match value {
        Some(Value::Null) => Some(Value::Null),
        Some(_) => parse_embedded_object(value),
        None => None,
    }
}

fn parse_action_type(value: &str) -> Option<ProposalActionType> {
    match value {
        "create_task" => Some(ProposalActionType::CreateTask),
        "update_task" => Some(ProposalActionType::UpdateTask),
        "reschedule_task" => Some(ProposalActionType::RescheduleTask),
        "batch_update_tasks" => Some(ProposalActionType::BatchUpdateTasks),
        "create_dependency" => Some(ProposalActionType::CreateDependency),
        "delete_dependency" => Some(ProposalActionType::DeleteDependency),
        "add_task_tag" => Some(ProposalActionType::AddTaskTag),
        "remove_task_tag" => Some(ProposalActionType::RemoveTaskTag),
        _ => None,
    }
}

fn parse_artifact_type(value: &str) -> Option<ProposalArtifactType> {
    match value {
        "routing_decision" => Some(ProposalArtifactType::RoutingDecision),
        "execution_plan" => Some(ProposalArtifactType::ExecutionPlan),
        "analysis_report" => Some(ProposalArtifactType::AnalysisReport),
        "schedule_report" => Some(ProposalArtifactType::ScheduleReport),
        "task_brief" => Some(ProposalArtifactType::TaskBrief),
        "validator_notice" => Some(ProposalArtifactType::ValidatorNotice),
        _ => None,
    }
}

fn artifact_type_as_str(value: ProposalArtifactType) -> &'static str {
    match value {
        ProposalArtifactType::RoutingDecision => "routing_decision",
        ProposalArtifactType::ExecutionPlan => "execution_plan",
        ProposalArtifactType::AnalysisReport => "analysis_report",
        ProposalArtifactType::ScheduleReport => "schedule_report",
        ProposalArtifactType::TaskBrief => "task_brief",
        ProposalArtifactType::ValidatorNotice => "validator_notice",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_only_today_query_does_not_force_structured_proposal() {
        assert!(!should_request_structured_proposal(
            "今天有哪些任务？",
            "plan"
        ));
    }

    #[test]
    fn planning_query_still_requests_structured_proposal() {
        assert!(should_request_structured_proposal(
            "今天应该做什么？",
            "plan"
        ));
    }

    #[test]
    fn canonicalize_parses_stringified_nested_json() {
        let proposal = canonicalize_candidate(
            json!({
                "schema_version": null,
                "proposal_id": null,
                "thread_id": null,
                "turn_id": null,
                "generated_at": null,
                "summary": "reprioritize today",
                "intent": "daily scheduling",
                "reasoning_summary": null,
                "warnings": [],
                "requires_confirmation": true,
                "actions": [
                    {
                        "action_id": null,
                        "action_type": "update_task",
                        "target_type": null,
                        "target_id": "task_1",
                        "title": "Move due date",
                        "summary": "Move the task to tomorrow",
                        "before_json": "{\"due_date\":\"2026-04-02\"}",
                        "after_json": "{\"due_date\":\"2026-04-03\"}"
                    }
                ],
                "artifacts": [
                    {
                        "artifact_id": null,
                        "artifact_type": "schedule_report",
                        "title": "daily report",
                        "content_json": "{\"overdue\":1}"
                    }
                ]
            }),
            "thread_1",
            "turn_1",
        )
        .expect("proposal should canonicalize");

        assert_eq!(proposal.thread_id, "thread_1");
        assert_eq!(proposal.turn_id, "turn_1");
        assert_eq!(proposal.actions.len(), 1);
        assert_eq!(proposal.actions[0].after_json["due_date"], "2026-04-03");
        assert_eq!(
            proposal.actions[0].before_json.as_ref().unwrap()["due_date"],
            "2026-04-02"
        );
        assert_eq!(proposal.artifacts[0].content_json["overdue"], 1);
    }
}
