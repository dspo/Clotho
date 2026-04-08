# tauri-plugin-agent-runtime

`tauri-plugin-agent-runtime` 是面向宿主应用的统一 Tauri plugin 入口，底层能力基于 Codex，并对外暴露 `agent-runtime` 插件命名空间。

## 安装

```toml
[dependencies]
tauri-plugin-agent-runtime = { git = "https://github.com/dspo/Clotho.git" }
```

## 它暴露什么

- `init()`：注册 `agent-runtime` plugin
- `init_with_builder(...)` / `AgentRuntimePluginBuilder`：向宿主注入 `ConfigProvider`、`AgentRuntime` 注册表，以及是否保留内建 tools
- 从 `agent-core` 重新导出的公共抽象
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

`init()` 默认会使用 `DefaultConfigProvider`，也就是读取 `~/.codex/config.toml`。

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

## 迁移说明

- 新宿主统一使用 `tauri-plugin-agent-runtime`
- capability 配置中应统一引用 `agent-runtime:*`
- 本仓库已将原先分散的 runtime 实现收敛进当前 crate
