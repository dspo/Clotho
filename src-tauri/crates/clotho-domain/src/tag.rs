use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskDependency {
    pub id: String,
    pub predecessor_id: String,
    pub successor_id: String,
    pub dependency_type: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskDependencyDetail {
    pub id: String,
    pub predecessor_id: String,
    pub predecessor_title: String,
    pub successor_id: String,
    pub successor_title: String,
    pub dependency_type: String,
    pub created_at: String,
}
