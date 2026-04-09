use tauri::{AppHandle, Runtime};

use crate::audit;
use crate::models::{
    RuntimeCatalog, RuntimeCatalogIntegration, RuntimeCatalogSkill, RuntimeCatalogTool,
};
use crate::session::AssistantRuntimeState;

pub fn runtime_catalog<R: Runtime>(
    app: &AppHandle<R>,
    state: &AssistantRuntimeState,
) -> RuntimeCatalog {
    let (tools, skills, integrations) = state
        .agent_runtime()
        .map(|runtime| {
            let mut tools = runtime
                .list_tools()
                .iter()
                .map(|tool| RuntimeCatalogTool {
                    name: tool.id.clone(),
                    description: tool.description.clone(),
                })
                .collect::<Vec<_>>();
            tools.sort_by(|left, right| left.name.cmp(&right.name));

            let mut skills = runtime
                .list_skill_catalogs()
                .iter()
                .map(|catalog| RuntimeCatalogSkill {
                    name: catalog.id.clone(),
                    description: catalog.description.clone(),
                    path: catalog.root_path.clone(),
                })
                .collect::<Vec<_>>();
            skills.sort_by(|left, right| left.name.cmp(&right.name));

            let mut integrations = runtime
                .list_provider_registrations()
                .iter()
                .map(|provider| RuntimeCatalogIntegration {
                    name: provider.id.clone(),
                    kind: provider.kind.clone(),
                    status: "registered".to_string(),
                    detail: Some("tool provider".to_string()),
                })
                .chain(runtime.list_integrations().iter().map(|integration| {
                    RuntimeCatalogIntegration {
                        name: integration.id.clone(),
                        kind: integration.kind.clone(),
                        status: "registered".to_string(),
                        detail: integration
                            .config
                            .as_ref()
                            .map(serde_json::Value::to_string),
                    }
                }))
                .collect::<Vec<_>>();
            integrations.sort_by(|left, right| left.name.cmp(&right.name));

            (tools, skills, integrations)
        })
        .unwrap_or_default();

    RuntimeCatalog {
        tools,
        tool_audit_log_path: audit::audit_log_path(app),
        tool_audits: audit::read_recent_tool_audits(app, 20),
        skills,
        integrations,
    }
}
