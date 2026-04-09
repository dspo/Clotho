use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskImage {
    pub id: String,
    pub task_id: String,
    pub filename: String,
    pub mime_type: String,
    pub size: i64,
    pub created_at: String,
}

pub fn stored_task_image_filename(image_id: &str, original_filename: &str) -> String {
    let raw_ext = original_filename.rsplit('.').next().unwrap_or("bin");
    let sanitized_ext: String = raw_ext
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect();
    let ext = if sanitized_ext.is_empty() {
        "bin".to_string()
    } else {
        sanitized_ext
    };
    format!("{image_id}.{ext}")
}

pub fn stored_task_image_path(
    app_data_dir: &Path,
    image_id: &str,
    original_filename: &str,
) -> PathBuf {
    app_data_dir
        .join("images")
        .join(stored_task_image_filename(image_id, original_filename))
}
