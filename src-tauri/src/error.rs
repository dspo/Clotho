#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("runtime error: {0}")]
    Runtime(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<clotho_domain::DomainError> for AppError {
    fn from(value: clotho_domain::DomainError) -> Self {
        match value {
            clotho_domain::DomainError::Database(error) => Self::Database(error),
            clotho_domain::DomainError::NotFound(message) => Self::NotFound(message),
            clotho_domain::DomainError::InvalidInput(message) => Self::InvalidInput(message),
            clotho_domain::DomainError::Conflict(message) => Self::Conflict(message),
        }
    }
}

impl From<tauri_plugin_agent_runtime::Error> for AppError {
    fn from(value: tauri_plugin_agent_runtime::Error) -> Self {
        match value {
            tauri_plugin_agent_runtime::Error::NotFound(message) => Self::NotFound(message),
            tauri_plugin_agent_runtime::Error::InvalidInput(message) => Self::InvalidInput(message),
            tauri_plugin_agent_runtime::Error::Conflict(message) => Self::Conflict(message),
            tauri_plugin_agent_runtime::Error::Runtime(message)
            | tauri_plugin_agent_runtime::Error::Database(message) => Self::Runtime(message),
            tauri_plugin_agent_runtime::Error::Io(error) => Self::Runtime(error.to_string()),
            tauri_plugin_agent_runtime::Error::Json(error) => Self::Runtime(error.to_string()),
            tauri_plugin_agent_runtime::Error::Toml(error) => Self::Runtime(error.to_string()),
        }
    }
}
