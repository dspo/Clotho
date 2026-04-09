<a id="zh"></a>

# tauri-plugin-agent-runtime

[English](#en)

`tauri-plugin-agent-runtime` 是面向宿主应用的统一 Tauri plugin 入口，底层能力基于 Codex，并对外暴露 `agent-runtime` 插件命名空间。

## 安装

```toml
[dependencies]
tauri-plugin-agent-runtime = { git = "https://github.com/dspo/Clotho.git" }
```

## 它暴露什么

- `init()`：注册 `agent-runtime` plugin
- `init_with_builder(...)` / `AgentRuntimePluginBuilder`：向宿主注入 `ConfigProvider`、`AgentRuntime` 注册表，并按需显式启用内建 tools
- 从 `agent-core` 重新导出的公共抽象（含 `SoulDefinition`）
- 与 thread / turn / stream / catalog 相关的共享 runtime 类型
- `ConfigProvider`、`DefaultConfigProvider`、`TomlConfigProvider`
- 内置的 runtime engine、native tools、proposal / audit / config / catalog 实现

## 最小注册

```rust
use tauri_plugin_agent_runtime::init as agent_runtime_plugin;

fn main() {
    tauri::Builder::default()
        .plugin(agent_runtime_plugin())
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}
```

`init()` 默认会使用 `DefaultConfigProvider`，也就是读取 `~/.codex/config.toml`。内建 native tools 默认**不启用**；如果宿主希望接入框架内置的 Clotho native tools，需要显式调用 `.enable_builtin_native_tools()`。

如果宿主想改为项目内 / app 内配置来源，可以切换到：

```rust
use std::path::PathBuf;
use std::sync::Arc;

use tauri_plugin_agent_runtime::{
    init_with_builder, AgentRuntimePluginBuilder, TomlConfigProvider,
};

fn main() {
    let config_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join(".codex")
        .join("config.toml");

    tauri::Builder::default()
        .plugin(init_with_builder(
            AgentRuntimePluginBuilder::new().config_provider(Arc::new(
                TomlConfigProvider::new("demo", "Bundled demo config", "demo", config_path)
                    .with_default(true),
            )),
        ))
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}
```

## SOUL.MD 与宿主边界

这个 crate 负责 runtime / plugin / tool / config 的宿主接入面；`SOUL.MD` 本身建议由宿主通过 `@dspo/tauri-agent` 的 `defineSoul(...)` 与 `composeAgentTurnText(...)` 接入，再把最终 prompt 发给 runtime。这样 agent 的“灵魂、边界、越界拒绝方式”可以由开发者在宿主侧明确控制。

## 迁移说明

- 新宿主统一使用 `tauri-plugin-agent-runtime`
- capability 配置中应统一引用 `agent-runtime:*`
- 本仓库已将原先分散的 runtime 实现收敛进当前 crate

---

<a id="en"></a>

# tauri-plugin-agent-runtime

[简体中文](#zh)

`tauri-plugin-agent-runtime` is the unified Tauri plugin entrypoint for host apps. It is powered by Codex under the hood and exposes the `agent-runtime` plugin namespace.

## Installation

```toml
[dependencies]
tauri-plugin-agent-runtime = { git = "https://github.com/dspo/Clotho.git" }
```

## What it exposes

- `init()` to register the `agent-runtime` plugin
- `init_with_builder(...)` / `AgentRuntimePluginBuilder` to inject a `ConfigProvider`, `AgentRuntime` registry, and optionally enable built-in tools
- Re-exported abstractions from `agent-core`, including `SoulDefinition`
- Shared runtime types for thread / turn / stream / catalog flows
- `ConfigProvider`, `DefaultConfigProvider`, and `TomlConfigProvider`
- Built-in runtime engine, native tools, proposal / audit / config / catalog implementations

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

`init()` uses `DefaultConfigProvider` by default, which reads `~/.codex/config.toml`. Built-in native tools are **disabled by default**; call `.enable_builtin_native_tools()` only if your host explicitly wants the framework-provided Clotho native tools.

If your host wants project-local or app-local config instead, switch to:

```rust
use std::path::PathBuf;
use std::sync::Arc;

use tauri_plugin_agent_runtime::{
    init_with_builder, AgentRuntimePluginBuilder, TomlConfigProvider,
};

fn main() {
    let config_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join(".codex")
        .join("config.toml");

    tauri::Builder::default()
        .plugin(init_with_builder(
            AgentRuntimePluginBuilder::new().config_provider(Arc::new(
                TomlConfigProvider::new("demo", "Bundled demo config", "demo", config_path)
                    .with_default(true),
            )),
        ))
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}
```

## SOUL.MD and host-side boundaries

This crate owns the runtime / plugin / tool / config integration surface. The actual `SOUL.MD` authoring flow is best defined on the host side through `@dspo/tauri-agent` with `defineSoul(...)` and `composeAgentTurnText(...)`, so the host keeps explicit control over the agent's role, boundary, and refusal behavior.

## Migration notes

- New hosts should use `tauri-plugin-agent-runtime`
- Capability configuration should reference `agent-runtime:*`
- This repository has consolidated the previous fragmented runtime implementation into this crate
