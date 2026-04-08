# agent-core

`agent-core` 是 Tauri Agent Runtime Framework 的 Rust 通用抽象层。

## 公开抽象

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

这个 crate 不依赖 Clotho 私有 domain 类型，目标是为任意 Tauri 宿主提供稳定的 agent/runtime 抽象。

## 内置权限集

- `read-only`
- `operator`
- `automation`
- `debug`

## 最小示例

```rust
use agent_core::{Builder, PermissionSet, RuntimeConfig};

let mut builder = Builder::new();
builder.set_config(RuntimeConfig {
    default_permission: PermissionSet::ReadOnly,
    provider_adapters: vec!["codex".to_string()],
    audit_enabled: true,
});

let runtime = builder.build()?;
assert_eq!(runtime.config().default_permission, PermissionSet::ReadOnly);
```
