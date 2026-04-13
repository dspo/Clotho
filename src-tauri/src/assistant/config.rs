//! Configuration provider for Clotho.
//!
//! This module re-exports the [MultiSourceConfigProvider] from the plugin,
//! which handles project-level and user-level Codex config discovery.

pub use tauri_plugin_agent_runtime::MultiSourceConfigProvider;

/// Creates a shared config provider using the standard Codex two-source layout:
/// - Project: `CWD/.codex/config.toml` (project, highest priority when exists)
/// - User: `~/.codex/config.toml` (user, fallback)
pub fn shared_config_provider() -> std::sync::Arc<dyn tauri_plugin_agent_runtime::ConfigProvider> {
    std::sync::Arc::new(MultiSourceConfigProvider::codex_defaults())
}
