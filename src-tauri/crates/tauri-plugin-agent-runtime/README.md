# tauri-plugin-agent-runtime

`tauri-plugin-agent-runtime` 是面向宿主应用的统一 Tauri plugin 入口，底层能力基于 Codex，并对外暴露 `agent-runtime` 插件命名空间。

## 安装

```toml
[dependencies]
tauri-plugin-agent-runtime = { git = "https://github.com/dspo/Clotho.git" }
```

## 它暴露什么

- `init()`：注册 `agent-runtime` plugin
- 从 `agent-core` 重新导出的公共抽象
- 与 thread / turn / stream / catalog 相关的共享 runtime 类型

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

## 迁移说明

- 新宿主统一使用 `tauri-plugin-agent-runtime`
- 旧的 `tauri-plugin-assistant-runtime` 仅保留为兼容别名
- capability 配置中应统一引用 `agent-runtime:*`
