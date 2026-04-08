# agent-core

Reusable Rust abstractions for the Tauri Agent Runtime Framework.

This crate defines the framework-facing API surface:

- `Builder`
- `AgentDefinition`
- `FunctionToolDefinition`
- `FunctionToolHandler`
- `ToolProvider`
- `SkillCatalogRegistration`
- `IntegrationRegistration`
- `ActionPolicy`
- `OutputContract`
- `PermissionSet`

It does not depend on Clotho-specific domain types.

Built-in permission sets:

- `read-only`
- `operator`
- `automation`
- `debug`

Typical usage:

```rust
use agent_core::{Builder, PermissionSet, RuntimeConfig};

let runtime = Builder::new()
    .set_config(RuntimeConfig {
        default_permission: PermissionSet::ReadOnly,
        provider_adapters: vec!["openai".to_string()],
        audit_enabled: true,
    })
    .build()?;
```
