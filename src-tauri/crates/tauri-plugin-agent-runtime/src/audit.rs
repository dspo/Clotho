use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime};

use crate::models::NativeToolAuditEntry;
use crate::runtime_plugin_metadata;

const AUDIT_FILENAME: &str = "tool-audit.jsonl";

pub fn audit_log_path<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    resolve_audit_log_path(app).and_then(|path| path.to_str().map(str::to_string))
}

pub fn read_recent_tool_audits<R: Runtime>(
    app: &AppHandle<R>,
    limit: usize,
) -> Vec<NativeToolAuditEntry> {
    let Some(path) = resolve_audit_log_path(app) else {
        return Vec::new();
    };
    let Ok(contents) = fs::read_to_string(path) else {
        return Vec::new();
    };

    let limit = limit.max(1);
    contents
        .lines()
        .rev()
        .filter_map(|line| serde_json::from_str::<NativeToolAuditEntry>(line).ok())
        .take(limit)
        .collect()
}

fn resolve_audit_log_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    let app_data_dir = app.path().app_data_dir().ok()?;
    let metadata = runtime_plugin_metadata(app);
    Some(
        app_data_dir
            .join(metadata.audit_directory)
            .join(AUDIT_FILENAME),
    )
}
