use std::collections::BTreeMap;

use rusqlite::Connection;
use serde::Serialize;
use serde_json::{Map, Value};

use crate::{
    CreateTaskInput, DependencyRepository, DomainError, ProjectRepository, ProposalAction,
    ProposalActionType, ProposalPayload, TagRepository, TaskData, TaskPatchInput, TaskRepository,
    PROPOSAL_SCHEMA_VERSION,
};

#[derive(Debug, Clone, Serialize)]
pub struct ProposalApplyReport {
    pub applied_actions: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalSimulationAction {
    pub action_id: String,
    pub action_type: String,
    pub target_type: String,
    pub target_id: Option<String>,
    pub title: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalSimulationReport {
    pub proposal_id: String,
    pub valid: bool,
    pub action_count: usize,
    pub action_type_counts: BTreeMap<String, usize>,
    pub actions: Vec<ProposalSimulationAction>,
    pub notices: Vec<String>,
}

pub fn apply_proposal(
    conn: &mut Connection,
    proposal: &ProposalPayload,
) -> Result<ProposalApplyReport, DomainError> {
    let tx = conn.transaction()?;
    validate_proposal(&tx, proposal)?;
    for action in &proposal.actions {
        apply_action(&tx, action)?;
    }
    tx.commit()?;

    Ok(ProposalApplyReport {
        applied_actions: proposal.actions.len(),
    })
}

pub fn simulate_proposal(conn: &Connection, proposal: &ProposalPayload) -> ProposalSimulationReport {
    let mut notices = Vec::new();
    let valid = match validate_proposal(conn, proposal) {
        Ok(()) => true,
        Err(error) => {
            notices.push(error.to_string());
            false
        }
    };

    let mut action_type_counts = BTreeMap::new();
    let actions = proposal
        .actions
        .iter()
        .map(|action| {
            *action_type_counts
                .entry(action.action_type.as_str().to_string())
                .or_insert(0) += 1;
            ProposalSimulationAction {
                action_id: action.action_id.clone(),
                action_type: action.action_type.as_str().to_string(),
                target_type: action.target_type.clone(),
                target_id: action.target_id.clone(),
                title: action.title.clone(),
                summary: action.summary.clone(),
            }
        })
        .collect::<Vec<_>>();

    ProposalSimulationReport {
        proposal_id: proposal.proposal_id.clone(),
        valid,
        action_count: proposal.actions.len(),
        action_type_counts,
        actions,
        notices,
    }
}

pub fn validate_proposal(conn: &Connection, proposal: &ProposalPayload) -> Result<(), DomainError> {
    if proposal.schema_version != PROPOSAL_SCHEMA_VERSION {
        return Err(DomainError::InvalidInput(format!(
            "unsupported proposal schema `{}`",
            proposal.schema_version
        )));
    }

    for action in &proposal.actions {
        validate_action(conn, action)?;
    }

    Ok(())
}

fn validate_action(conn: &Connection, action: &ProposalAction) -> Result<(), DomainError> {
    match action.action_type {
        ProposalActionType::CreateTask => {
            let input = parse_create_task_input(&action.after_json)?;
            ProjectRepository::get(conn, &input.project_id)?;
            validate_parent_project(conn, &input.project_id, input.parent_task_id.as_deref())?;
        }
        ProposalActionType::UpdateTask => {
            let task = current_task(conn, action)?;
            let patch = parse_task_patch(&action.after_json)?;
            validate_task_patch(conn, &task, &patch)?;
        }
        ProposalActionType::RescheduleTask => {
            let task = current_task(conn, action)?;
            if matches!(task.status.as_str(), "done" | "cancelled") {
                return Err(DomainError::Conflict(format!(
                    "cannot reschedule task `{}` with status `{}`",
                    task.id, task.status
                )));
            }
            let patch = parse_task_patch(&action.after_json)?;
            validate_task_patch(conn, &task, &patch)?;
        }
        ProposalActionType::BatchUpdateTasks => {
            let updates = parse_batch_updates(&action.after_json)?;
            for update in updates {
                let task = TaskRepository::get(conn, &update.task_id)?;
                validate_task_patch(conn, &task, &update.patch)?;
            }
        }
        ProposalActionType::CreateDependency => {
            let dependency = parse_dependency_create(&action.after_json)?;
            TaskRepository::get(conn, &dependency.predecessor_id)?;
            TaskRepository::get(conn, &dependency.successor_id)?;
            if dependency.predecessor_id == dependency.successor_id {
                return Err(DomainError::InvalidInput(
                    "dependency cannot point to the same task".to_string(),
                ));
            }
            if dependency_would_create_cycle(
                conn,
                &dependency.predecessor_id,
                &dependency.successor_id,
            )? {
                return Err(DomainError::Conflict(
                    "dependency would create a cycle".to_string(),
                ));
            }
        }
        ProposalActionType::DeleteDependency => {
            let dependency_id = required_target_id(action)?;
            if !dependency_exists(conn, &dependency_id)? {
                return Err(DomainError::NotFound(format!("dependency {dependency_id}")));
            }
        }
        ProposalActionType::AddTaskTag | ProposalActionType::RemoveTaskTag => {
            let task_id = resolve_task_target_id(action)?;
            let tag_id = required_string(
                action.after_json.as_object(),
                &["tag_id", "tagId"],
                "tag_id",
            )?;
            TaskRepository::get(conn, &task_id)?;
            TagRepository::get(conn, &tag_id)?;
        }
    }

    Ok(())
}

fn apply_action(conn: &Connection, action: &ProposalAction) -> Result<(), DomainError> {
    match action.action_type {
        ProposalActionType::CreateTask => {
            let input = parse_create_task_input(&action.after_json)?;
            TaskRepository::create(conn, &input)?;
        }
        ProposalActionType::UpdateTask | ProposalActionType::RescheduleTask => {
            let task_id = resolve_task_target_id(action)?;
            let patch = parse_task_patch(&action.after_json)?;
            TaskRepository::patch(conn, &task_id, &patch)?;
        }
        ProposalActionType::BatchUpdateTasks => {
            for update in parse_batch_updates(&action.after_json)? {
                TaskRepository::patch(conn, &update.task_id, &update.patch)?;
            }
        }
        ProposalActionType::CreateDependency => {
            let dependency = parse_dependency_create(&action.after_json)?;
            DependencyRepository::create(
                conn,
                &dependency.predecessor_id,
                &dependency.successor_id,
                dependency.dependency_type.as_deref(),
            )?;
        }
        ProposalActionType::DeleteDependency => {
            DependencyRepository::delete(conn, &required_target_id(action)?)?;
        }
        ProposalActionType::AddTaskTag => {
            let task_id = resolve_task_target_id(action)?;
            let tag_id = required_string(
                action.after_json.as_object(),
                &["tag_id", "tagId"],
                "tag_id",
            )?;
            TagRepository::add_to_task(conn, &task_id, &tag_id)?;
        }
        ProposalActionType::RemoveTaskTag => {
            let task_id = resolve_task_target_id(action)?;
            let tag_id = required_string(
                action.after_json.as_object(),
                &["tag_id", "tagId"],
                "tag_id",
            )?;
            TagRepository::remove_from_task(conn, &task_id, &tag_id)?;
        }
    }

    Ok(())
}

fn current_task(conn: &Connection, action: &ProposalAction) -> Result<TaskData, DomainError> {
    TaskRepository::get(conn, &resolve_task_target_id(action)?)
}

fn validate_task_patch(
    conn: &Connection,
    current_task: &TaskData,
    patch: &TaskPatchInput,
) -> Result<(), DomainError> {
    if let Some(project_id) = patch.project_id.as_deref() {
        ProjectRepository::get(conn, project_id)?;
    }

    let resolved_project_id = patch
        .project_id
        .as_deref()
        .unwrap_or(current_task.project_id.as_str());
    let resolved_parent_task_id = match &patch.parent_task_id {
        Some(parent) => parent.as_deref(),
        None => current_task.parent_task_id.as_deref(),
    };

    validate_parent_project(conn, resolved_project_id, resolved_parent_task_id)?;
    Ok(())
}

fn validate_parent_project(
    conn: &Connection,
    project_id: &str,
    parent_task_id: Option<&str>,
) -> Result<(), DomainError> {
    let Some(parent_task_id) = parent_task_id else {
        return Ok(());
    };

    let parent = TaskRepository::get(conn, parent_task_id)?;
    if parent.project_id != project_id {
        return Err(DomainError::Conflict(format!(
            "parent task `{parent_task_id}` belongs to a different project"
        )));
    }

    Ok(())
}

fn resolve_task_target_id(action: &ProposalAction) -> Result<String, DomainError> {
    action
        .target_id
        .clone()
        .or_else(|| string_from_value(action.after_json.as_object(), &["task_id", "taskId", "id"]))
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            DomainError::InvalidInput(format!(
                "action `{}` is missing a task target id",
                action.action_id
            ))
        })
}

fn required_target_id(action: &ProposalAction) -> Result<String, DomainError> {
    action
        .target_id
        .clone()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            DomainError::InvalidInput(format!(
                "action `{}` is missing a target id",
                action.action_id
            ))
        })
}

fn parse_create_task_input(value: &Value) -> Result<CreateTaskInput, DomainError> {
    let object = required_object(value, "after_json")?;

    Ok(CreateTaskInput {
        project_id: required_string(Some(object), &["project_id", "projectId"], "project_id")?,
        title: required_string(Some(object), &["title"], "title")?,
        description: optional_nullable_string_any(Some(object), &["description"])?.flatten(),
        description_format: optional_nullable_string_any(
            Some(object),
            &["description_format", "descriptionFormat"],
        )?
        .flatten(),
        status: optional_nullable_string_any(Some(object), &["status"])?.flatten(),
        priority: optional_nullable_string_any(Some(object), &["priority"])?.flatten(),
        difficulty: optional_nullable_string_any(Some(object), &["difficulty"])?.flatten(),
        start_date: optional_nullable_string_any(Some(object), &["start_date", "startDate"])?
            .flatten(),
        due_date: optional_nullable_string_any(Some(object), &["due_date", "dueDate"])?
            .flatten(),
        parent_task_id: optional_nullable_string_any(
            Some(object),
            &["parent_task_id", "parentTaskId"],
        )?
        .flatten(),
        is_milestone: optional_bool_any(Some(object), &["is_milestone", "isMilestone"])?,
        kanban_order: optional_nullable_string_any(Some(object), &["kanban_order", "kanbanOrder"])?
            .flatten(),
        estimated_hours: optional_nullable_f64_any(
            Some(object),
            &["estimated_hours", "estimatedHours"],
        )?
        .flatten(),
        tag_ids: optional_string_array(Some(object), &["tag_ids", "tagIds"])?,
    })
}

fn parse_task_patch(value: &Value) -> Result<TaskPatchInput, DomainError> {
    let object = required_object(value, "after_json")?;

    Ok(TaskPatchInput {
        title: optional_nullable_string_any(Some(object), &["title"])?.flatten(),
        description: optional_nullable_string_any(Some(object), &["description"])?,
        description_format: optional_nullable_string_any(
            Some(object),
            &["description_format", "descriptionFormat"],
        )?,
        status: optional_nullable_string_any(Some(object), &["status"])?.flatten(),
        priority: optional_nullable_string_any(Some(object), &["priority"])?.flatten(),
        difficulty: optional_nullable_string_any(Some(object), &["difficulty"])?,
        start_date: optional_nullable_string_any(Some(object), &["start_date", "startDate"])?,
        due_date: optional_nullable_string_any(Some(object), &["due_date", "dueDate"])?,
        parent_task_id: optional_nullable_string_any(
            Some(object),
            &["parent_task_id", "parentTaskId"],
        )?,
        is_milestone: optional_bool_any(Some(object), &["is_milestone", "isMilestone"])?,
        kanban_order: optional_nullable_string_any(Some(object), &["kanban_order", "kanbanOrder"])?
            .flatten(),
        estimated_hours: optional_nullable_f64_any(
            Some(object),
            &["estimated_hours", "estimatedHours"],
        )?,
        actual_hours: optional_nullable_f64_any(
            Some(object),
            &["actual_hours", "actualHours"],
        )?,
        tag_ids: optional_string_array(Some(object), &["tag_ids", "tagIds"])?,
        project_id: optional_nullable_string_any(Some(object), &["project_id", "projectId"])?
            .flatten(),
    })
}

struct BatchTaskUpdate {
    task_id: String,
    patch: TaskPatchInput,
}

fn parse_batch_updates(value: &Value) -> Result<Vec<BatchTaskUpdate>, DomainError> {
    let object = required_object(value, "after_json")?;
    let updates = object
        .get("task_updates")
        .or_else(|| object.get("updates"))
        .or_else(|| object.get("tasks"))
        .and_then(Value::as_array)
        .ok_or_else(|| {
            DomainError::InvalidInput(
                "batch_update_tasks requires `task_updates` array".to_string(),
            )
        })?;

    updates
        .iter()
        .enumerate()
        .map(|(index, item)| {
            let object = required_object(item, &format!("task_updates[{index}]"))?;
            let task_id = required_string(
                Some(object),
                &["target_id", "task_id", "taskId", "id"],
                "task_id",
            )?;
            Ok(BatchTaskUpdate {
                task_id,
                patch: parse_task_patch(item)?,
            })
        })
        .collect()
}

struct DependencyCreateInput {
    predecessor_id: String,
    successor_id: String,
    dependency_type: Option<String>,
}

fn parse_dependency_create(value: &Value) -> Result<DependencyCreateInput, DomainError> {
    let object = required_object(value, "after_json")?;
    Ok(DependencyCreateInput {
        predecessor_id: required_string(
            Some(object),
            &["predecessor_id", "predecessorId"],
            "predecessor_id",
        )?,
        successor_id: required_string(
            Some(object),
            &["successor_id", "successorId"],
            "successor_id",
        )?,
        dependency_type: optional_nullable_string(Some(object), "dependency_type")?.flatten(),
    })
}

fn dependency_exists(conn: &Connection, dependency_id: &str) -> Result<bool, DomainError> {
    conn.query_row(
        "SELECT COUNT(*) > 0 FROM task_dependencies WHERE id = ?1",
        [dependency_id],
        |row| row.get(0),
    )
    .map_err(DomainError::Database)
}

fn dependency_would_create_cycle(
    conn: &Connection,
    predecessor_id: &str,
    successor_id: &str,
) -> Result<bool, DomainError> {
    conn.query_row(
        "
        WITH RECURSIVE reachable(id) AS (
            SELECT successor_id
            FROM task_dependencies
            WHERE predecessor_id = ?1
            UNION
            SELECT d.successor_id
            FROM task_dependencies d
            INNER JOIN reachable r ON d.predecessor_id = r.id
        )
        SELECT EXISTS(SELECT 1 FROM reachable WHERE id = ?2)
        ",
        rusqlite::params![successor_id, predecessor_id],
        |row| row.get(0),
    )
    .map_err(DomainError::Database)
}

fn required_object<'a>(
    value: &'a Value,
    field_name: &str,
) -> Result<&'a Map<String, Value>, DomainError> {
    value
        .as_object()
        .ok_or_else(|| DomainError::InvalidInput(format!("{field_name} must be a JSON object")))
}

fn required_string(
    object: Option<&Map<String, Value>>,
    keys: &[&str],
    field_name: &str,
) -> Result<String, DomainError> {
    string_from_value(object, keys)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| DomainError::InvalidInput(format!("missing required field `{field_name}`")))
}

fn string_from_value(object: Option<&Map<String, Value>>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| object?.get(*key))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn optional_nullable_string(
    object: Option<&Map<String, Value>>,
    key: &str,
) -> Result<Option<Option<String>>, DomainError> {
    optional_nullable_string_any(object, &[key])
}

fn optional_nullable_string_any(
    object: Option<&Map<String, Value>>,
    keys: &[&str],
) -> Result<Option<Option<String>>, DomainError> {
    let Some(value) = keys.iter().find_map(|key| object.and_then(|map| map.get(*key))) else {
        return Ok(None);
    };

    match value {
        Value::Null => Ok(Some(None)),
        Value::String(text) => Ok(Some(Some(text.to_string()))),
        _ => Err(DomainError::InvalidInput(format!(
            "field `{}` must be a string or null",
            keys[0]
        ))),
    }
}

fn optional_nullable_f64_any(
    object: Option<&Map<String, Value>>,
    keys: &[&str],
) -> Result<Option<Option<f64>>, DomainError> {
    let Some(value) = keys.iter().find_map(|key| object.and_then(|map| map.get(*key))) else {
        return Ok(None);
    };

    match value {
        Value::Null => Ok(Some(None)),
        Value::Number(number) => number
            .as_f64()
            .map(|parsed| Some(Some(parsed)))
            .ok_or_else(|| {
                DomainError::InvalidInput(format!(
                    "field `{}` must be a finite number or null",
                    keys[0]
                ))
            }),
        _ => Err(DomainError::InvalidInput(format!(
            "field `{}` must be a number or null",
            keys[0]
        ))),
    }
}

fn optional_bool_any(
    object: Option<&Map<String, Value>>,
    keys: &[&str],
) -> Result<Option<bool>, DomainError> {
    let Some(value) = keys.iter().find_map(|key| object.and_then(|map| map.get(*key))) else {
        return Ok(None);
    };

    match value {
        Value::Bool(flag) => Ok(Some(*flag)),
        _ => Err(DomainError::InvalidInput(format!(
            "field `{}` must be a boolean",
            keys[0]
        ))),
    }
}

fn optional_string_array(
    object: Option<&Map<String, Value>>,
    keys: &[&str],
) -> Result<Option<Vec<String>>, DomainError> {
    let Some(value) = keys.iter().find_map(|key| object.and_then(|map| map.get(*key))) else {
        return Ok(None);
    };

    let array = value.as_array().ok_or_else(|| {
        DomainError::InvalidInput("tag_ids must be an array of strings".to_string())
    })?;

    array
        .iter()
        .map(|item| {
            item.as_str().map(str::to_string).ok_or_else(|| {
                DomainError::InvalidInput("tag_ids must be an array of strings".to_string())
            })
        })
        .collect::<Result<Vec<_>, _>>()
        .map(Some)
}
