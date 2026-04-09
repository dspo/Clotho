pub mod error;
pub mod image;
pub mod proposal;
pub mod proposal_execution;
pub mod project;
pub mod repository;
pub mod tag;
pub mod task;

pub use error::DomainError;
pub use image::TaskImage;
pub use proposal::{
    ProposalAction, ProposalActionType, ProposalArtifact, ProposalArtifactType, ProposalPayload,
    PROPOSAL_SCHEMA_VERSION,
};
pub use proposal_execution::{
    apply_proposal, simulate_proposal, validate_proposal, ProposalApplyReport,
    ProposalSimulationAction, ProposalSimulationReport,
};
pub use project::{Project, ProjectWithStats};
pub use repository::{
    DependencyRepository, ImageRepository, ProjectRepository, TagRepository, TaskRepository,
};
pub use tag::{Tag, TaskDependency, TaskDependencyDetail};
pub use task::{
    CreateTaskInput, ListTasksFilter, ScheduleStats, TaskData, TaskDetailData, TaskPatchInput,
    TaskProgressData, TaskWithTagsData, UpdateTaskInput,
};
