const COMMANDS: &[&str] = &[
    "list_threads",
    "get_thread_snapshot",
    "create_thread",
    "start_turn",
    "resume_turn_stream",
    "cancel_turn",
    "submit_runtime_request",
    "list_configs",
    "resolve_config",
    "get_runtime_catalog",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
