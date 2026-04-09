#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("runtime error: {0}")]
    Runtime(String),
    #[error("database error: {0}")]
    Database(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("failed to parse TOML: {0}")]
    Toml(#[from] toml::de::Error),
}

pub type Result<T> = std::result::Result<T, Error>;

impl serde::Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serde::Serialize::serialize(
            &SerializedError {
                code: self.code(),
                message: self.to_string(),
            },
            serializer,
        )
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SerializedError {
    code: &'static str,
    message: String,
}

impl Error {
    fn code(&self) -> &'static str {
        match self {
            Error::NotFound(_) => "not_found",
            Error::InvalidInput(_) => "invalid_input",
            Error::Conflict(_) => "conflict",
            Error::Runtime(_) => "runtime",
            Error::Database(_) => "database",
            Error::Io(_) => "io",
            Error::Json(_) => "json",
            Error::Toml(_) => "toml",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Error;

    #[test]
    fn serializes_error_with_code_and_message() {
        let json = serde_json::to_value(Error::Conflict("duplicate".to_string())).unwrap();
        assert_eq!(json["code"], "conflict");
        assert_eq!(json["message"], "conflict: duplicate");
    }
}
