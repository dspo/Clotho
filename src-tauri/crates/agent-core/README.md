<a id="zh"></a>

# agent-core

[English](#en)

`agent-core` 是 Tauri Agent Runtime Framework 的 Rust 通用抽象层。

## 公开抽象

- `Builder`
- `AgentDefinition`
- `SoulDefinition`
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
use agent_core::{Builder, PermissionSet, RuntimeConfig, SoulDefinition};

let soul = SoulDefinition::sourced("SOUL.MD", "# Planner\n\nStay inside planning scope.");
let runtime = Builder::new()
    .set_config(RuntimeConfig {
        default_permission: PermissionSet::ReadOnly,
        provider_adapters: vec!["codex".to_string()],
        audit_enabled: true,
    })
    .build()?;
assert_eq!(runtime.config().default_permission, PermissionSet::ReadOnly);
assert_eq!(soul.source.as_deref(), Some("SOUL.MD"));
```

---

<a id="en"></a>

# agent-core

[简体中文](#zh)

`agent-core` is the reusable Rust abstraction layer for the Tauri Agent Runtime Framework.

## Public abstractions

- `Builder`
- `AgentDefinition`
- `SoulDefinition`
- `FunctionToolDefinition`
- `FunctionToolHandler`
- `ToolProvider`
- `SkillCatalogRegistration`
- `IntegrationRegistration`
- `ActionPolicy`
- `OutputContract`
- `PermissionSet`

This crate does not depend on any Clotho-specific domain types. Its goal is to provide stable agent/runtime abstractions for any Tauri host.

## Built-in permission sets

- `read-only`
- `operator`
- `automation`
- `debug`

## Minimal example

```rust
use agent_core::{Builder, PermissionSet, RuntimeConfig, SoulDefinition};

let soul = SoulDefinition::sourced("SOUL.MD", "# Planner\n\nStay inside planning scope.");
let runtime = Builder::new()
    .set_config(RuntimeConfig {
        default_permission: PermissionSet::ReadOnly,
        provider_adapters: vec!["codex".to_string()],
        audit_enabled: true,
    })
    .build()?;
assert_eq!(runtime.config().default_permission, PermissionSet::ReadOnly);
assert_eq!(soul.source.as_deref(), Some("SOUL.MD"));
```
