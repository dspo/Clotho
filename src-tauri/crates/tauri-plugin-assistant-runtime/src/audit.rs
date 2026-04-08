use std::fs::{self, OpenOptions};
use std::io::{Error as IoError, Write};
use std::path::PathBuf;

use tauri::{AppHandle, Manager, Runtime};

use crate::models::NativeToolAuditEntry;

const AUDIT_DIRECTORY: &str = "assistant-runtime";
const AUDIT_FILENAME: &str = "native-tool-audit.jsonl";

pub fn audit_log_path<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    resolve_audit_log_path(app)
        .and_then(|path| path.to_str().map(str::to_string))
}

pub fn append_native_tool_audit<R: Runtime>(
    app: &AppHandle<R>,
    entry: &NativeToolAuditEntry,
) -> std::io::Result<()> {
    let path = resolve_audit_log_path(app).ok_or_else(|| {
        IoError::other("failed to resolve app data dir for native tool audit log")
    })?;
    let parent = path
        .parent()
        .ok_or_else(|| IoError::other("native tool audit log path is missing parent"))?;

    fs::create_dir_all(parent)?;

    let mut file = OpenOptions::new().create(true).append(true).open(&path)?;
    serde_json::to_writer(&mut file, entry)
        .map_err(|error| IoError::other(format!("failed to serialize native tool audit: {error}")))?;
    file.write_all(b"\n")?;
    Ok(())
}

pub fn read_recent_native_tool_audits<R: Runtime>(
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
    Some(app_data_dir.join(AUDIT_DIRECTORY).join(AUDIT_FILENAME))
}
