use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Runtime};

use crate::audit;
use crate::models::{
    RuntimeCatalog, RuntimeCatalogIntegration, RuntimeCatalogSkill, RuntimeCatalogTool,
};
use crate::native_tools;

pub fn runtime_catalog<R: Runtime>(app: &AppHandle<R>) -> RuntimeCatalog {
    RuntimeCatalog {
        tools: native_tools::specs()
            .into_iter()
            .map(|tool| RuntimeCatalogTool {
                name: tool.name,
                description: tool.description,
            })
            .collect(),
        tool_audit_log_path: audit::audit_log_path(app),
        tool_audits: audit::read_recent_native_tool_audits(app, 20),
        skills: discover_repo_skills(),
        integrations: discover_integrations(),
    }
}

fn discover_repo_skills() -> Vec<RuntimeCatalogSkill> {
    let skills_dir = current_repo_root()
        .map(|root| root.join(".agents").join("skills"))
        .unwrap_or_else(|| PathBuf::from(".agents/skills"));
    let Ok(entries) = fs::read_dir(&skills_dir) else {
        return Vec::new();
    };

    let mut skills = entries
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let path = entry.path();
            let metadata = entry.metadata().ok()?;
            if !metadata.is_dir() {
                return None;
            }
            let name = path.file_name()?.to_str()?.to_string();
            if name.starts_with('_') {
                return None;
            }

            let skill_file = path.join("SKILL.md");
            if !skill_file.exists() {
                return None;
            }

            let contents = fs::read_to_string(&skill_file).ok();
            let description = contents
                .as_deref()
                .and_then(parse_frontmatter_description)
                .or_else(|| contents.as_deref().and_then(parse_body_description));

            Some(RuntimeCatalogSkill {
                name,
                description,
                path: skill_file.display().to_string(),
            })
        })
        .collect::<Vec<_>>();
    skills.sort_by(|left, right| left.name.cmp(&right.name));
    skills
}

fn discover_integrations() -> Vec<RuntimeCatalogIntegration> {
    Vec::new()
}

fn current_repo_root() -> Option<PathBuf> {
    let cwd = std::env::current_dir().ok()?;
    if cwd.join(".git").exists() {
        return Some(cwd);
    }

    cwd.ancestors()
        .find(|ancestor| ancestor.join(".git").exists())
        .map(Path::to_path_buf)
}

fn parse_frontmatter_description(contents: &str) -> Option<String> {
    let mut lines = contents.lines();
    if lines.next()?.trim() != "---" {
        return None;
    }

    for line in lines {
        let trimmed = line.trim();
        if trimmed == "---" {
            break;
        }
        if let Some(value) = trimmed.strip_prefix("description:") {
            let description = value.trim().trim_matches('"').trim_matches('\'');
            if !description.is_empty() {
                return Some(description.to_string());
            }
        }
    }

    None
}

fn parse_body_description(contents: &str) -> Option<String> {
    contents
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with('#'))
        .map(str::to_string)
}
