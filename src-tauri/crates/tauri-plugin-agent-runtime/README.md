# tauri-plugin-agent-runtime

Generic Tauri plugin entrypoint for the Tauri Agent Runtime Framework.

## What this crate exposes

- `init()` for Tauri plugin registration
- framework-facing public types re-exported from `agent-core`
- compatibility exports from `tauri-plugin-assistant-runtime` so existing runtime flows keep working

## Minimal registration

```rust
use tauri_plugin_agent_runtime::init as agent_runtime_plugin;

fn main() {
    tauri::Builder::default()
        .plugin(agent_runtime_plugin())
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}
```

## Current migration state

- The generic plugin name is now the preferred Rust entrypoint.
- Internally, `init()` still delegates to `tauri-plugin-assistant-runtime`.
- Runtime abstractions such as `Builder`, `AgentDefinition`, `FunctionToolDefinition`, `ToolProvider`, `ActionPolicy`, and `OutputContract` come from `agent-core`.

That keeps the API surface moving toward the framework name without breaking the already working Clotho runtime chain.
