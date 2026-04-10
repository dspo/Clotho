use std::sync::Arc;

use tauri_plugin_agent_runtime::{
    ActionPolicy, AgentDefinition, AgentRuntime, AutomationHooks, Builder, OutputContract,
    PermissionSet, ProviderRegistration, ResourceBinding, RuntimeConfig, SoulDefinition,
    ToolBinding, UiMetadata,
};

use super::host_tools::ClothoToolProvider;

pub const CLOTHO_AGENT_ID: &str = "clotho-assistant";

const ASSISTANT_INSTRUCTIONS: &str = "Help the user inspect the current Clotho workspace, reason about projects, tasks, dependencies, and schedules, and prepare safe proposal-shaped changes when mutation is needed. Prefer grounded answers based on available tools and never imply that a write has happened unless the host explicitly confirms it.";
const DEFAULT_MODE_GUIDANCE: &str = "Default mode: answer directly when the request is straightforward, but keep any workspace mutation proposal-only.";
const PLAN_MODE_GUIDANCE: &str = "Plan mode: emphasize analysis, prioritization, and sequencing. Prefer conservative proposals and keep requires_confirmation=true when key details are missing.";
const FOLLOW_UP_TURN_GUIDANCE: &str = "Follow the global SOUL and assistant policy that were already established earlier in this thread; only restate mode-specific guidance that has changed for this turn.";
const PROPOSAL_GUIDANCE: &str = "When you need to propose workspace changes, return only one JSON object. Use schema_version `clotho.assistant.proposal.v1alpha1`. Include proposal_id, thread_id, turn_id, generated_at, summary, intent, reasoning_summary, warnings, requires_confirmation, actions, and artifacts. Valid action_type values: create_task, update_task, reschedule_task, batch_update_tasks, create_dependency, delete_dependency, add_task_tag, remove_task_tag. Valid artifact_type values: routing_decision, execution_plan, analysis_report, schedule_report, task_brief, validator_notice. Encode before_json, after_json, and content_json as nested JSON objects, not strings.";
const AUTOMATION_GUIDANCE: &str = "Automation context: produce a conservative scheduling proposal JSON object only. Do not claim that changes were applied. If information is missing, keep requires_confirmation=true and record the gaps in warnings or artifacts.";

pub fn build_agent_runtime() -> AgentRuntime {
    Builder::new()
        .register_agent(clotho_assistant_agent())
        .register_provider(
            ProviderRegistration {
                id: "clotho-host-tools".to_string(),
                kind: "host-tools".to_string(),
            },
            Arc::new(ClothoToolProvider),
        )
        .set_config(RuntimeConfig {
            default_permission: PermissionSet::ReadOnly,
            provider_adapters: vec!["codex-compatible".to_string()],
            audit_enabled: true,
        })
        .build()
        .expect("Clotho runtime definitions should be valid")
}

pub fn compose_user_turn_text(text: &str, mode: &str, include_global_soul: bool) -> String {
    let trimmed = text.trim();
    let mode_guidance = if mode.eq_ignore_ascii_case("plan") {
        PLAN_MODE_GUIDANCE
    } else {
        DEFAULT_MODE_GUIDANCE
    };

    if include_global_soul {
        format!(
            "Global app SOUL:\n{}\n\nAssistant policy:\n- {}\n- {}\n- {}\n\nUser request:\n{}",
            include_str!("SOUL.md").trim(),
            ASSISTANT_INSTRUCTIONS,
            mode_guidance,
            PROPOSAL_GUIDANCE,
            trimmed,
        )
    } else {
        format!(
            "Thread reminder:\n- {}\n- {}\n- {}\n\nUser request:\n{}",
            FOLLOW_UP_TURN_GUIDANCE, mode_guidance, PROPOSAL_GUIDANCE, trimmed,
        )
    }
}

pub fn compose_daily_scheduler_turn_text(now: &str) -> String {
    compose_user_turn_text(
        &format!(
            "现在的本地时间是 {now}。\n请为今天的自动排期生成 proposal。\n重点关注 overdue、dueToday、in_progress、unscheduled 任务；如果信息不足，请保持 requires_confirmation=true，并明确写出缺口。"
        ),
        "plan",
        true,
    ) + &format!("\n\n{}", AUTOMATION_GUIDANCE)
}

fn clotho_assistant_agent() -> AgentDefinition {
    AgentDefinition {
        id: CLOTHO_AGENT_ID.to_string(),
        name: Some("Clotho Assistant".to_string()),
        description: Some(
            "Single Clotho workspace assistant for interactive and automation-driven proposal drafting."
                .to_string(),
        ),
        soul: Some(
            SoulDefinition::sourced("src-tauri/src/assistant/SOUL.md", include_str!("SOUL.md"))
                .with_summary("Global app boundary for the single Clotho assistant."),
        ),
        instructions: Some(ASSISTANT_INSTRUCTIONS.to_string()),
        model_profile: None,
        tool_bindings: vec![
            read_only_tool("get_project"),
            read_only_tool("list_projects"),
            read_only_tool("get_task"),
            read_only_tool("list_tasks"),
            read_only_tool("search_tasks"),
            read_only_tool("list_dependencies"),
            read_only_tool("get_schedule_stats"),
            read_only_tool("simulate_proposal"),
        ],
        skill_bindings: Vec::new(),
        resource_bindings: vec![
            resource("projects", true),
            resource("tasks", true),
            resource("dependencies", true),
            resource("schedule-stats", true),
        ],
        action_policy: ActionPolicy::ProposalOnly,
        output_contract: OutputContract::FreeformText,
        automation_hooks: AutomationHooks {
            enabled: true,
            trigger_kind: Some("daily-scheduler".to_string()),
            audit_channel: Some("sqlite".to_string()),
        },
        ui_metadata: UiMetadata {
            title: Some("Clotho Assistant".to_string()),
            icon: Some("bot".to_string()),
            tags: vec!["interactive".to_string(), "automation".to_string()],
        },
    }
}

fn read_only_tool(tool_id: &str) -> ToolBinding {
    ToolBinding {
        tool_id: tool_id.to_string(),
        permission: PermissionSet::ReadOnly,
    }
}

fn resource(resource_id: &str, required: bool) -> ResourceBinding {
    ResourceBinding {
        resource_id: resource_id.to_string(),
        required,
    }
}

#[cfg(test)]
mod tests {
    use super::{compose_user_turn_text, PLAN_MODE_GUIDANCE};

    #[test]
    fn initial_turn_includes_global_soul() {
        let text = compose_user_turn_text("hello", "default", true);
        assert!(text.contains("Global app SOUL:"));
        assert!(text.contains("Assistant policy:"));
        assert!(text.contains("User request:\nhello"));
    }

    #[test]
    fn follow_up_turn_uses_compact_thread_reminder() {
        let text = compose_user_turn_text("hello again", "plan", false);
        assert!(text.contains("Thread reminder:"));
        assert!(text.contains(PLAN_MODE_GUIDANCE));
        assert!(!text.contains("Global app SOUL:"));
    }
}
