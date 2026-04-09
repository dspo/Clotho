<a id="zh"></a>

# create-tauri-agent-app

[English](#en)

`create-tauri-agent-app` 是 Tauri Agent Runtime Framework 的最小脚手架。

## 仓库内使用

```bash
node packages/create-tauri-agent-app/bin/create-tauri-agent-app.mjs prompt-only ./my-agent-app
```

当你直接从当前仓库执行脚手架时，生成器会自动把：

- `@dspo/tauri-agent` 改写为指向当前仓库的本地依赖
- `tauri-plugin-agent-runtime` 改写为指向当前仓库 crate 的本地 `path` 依赖

这样在 crate / npm 包尚未正式发布前，也能基于这个仓库完成本地集成与 smoke test。

## 发布后使用

```bash
pnpm dlx create-tauri-agent-app prompt-only ./my-agent-app
```

## 用法

```bash
create-tauri-agent-app prompt-only ./my-agent-app
create-tauri-agent-app declarative ./my-agent-app
create-tauri-agent-app operator ./my-agent-app
create-tauri-agent-app cosmic-weather ./my-cosmic-app
```

## 模板

- `prompt-only`：最小 prompt agent
- `declarative`：内置 resource / action / domain 声明
- `operator`：预留高权限 tools 与 operator workflow
- `cosmic-weather`：完整单页 Tauri demo，包含显式 `ConfigProvider`、自定义 zodiac tool、`SOUL.MD` 与卡片式结果 UI

## 生成后的体验

- 在当前仓库内生成时，脚手架会自动改写本地 JS / Rust 依赖
- `cosmic-weather` 模板会保留完整 demo wiring，适合作为开发者接入参考
- 生成后的 app 可以用 `SOUL.MD` + `defineSoul(...)` + `composeAgentTurnText(...)` 快速定义 agent 的灵魂与边界

---

<a id="en"></a>

# create-tauri-agent-app

[简体中文](#zh)

`create-tauri-agent-app` is the minimal scaffold for the Tauri Agent Runtime Framework.

## Using it from this repository

```bash
node packages/create-tauri-agent-app/bin/create-tauri-agent-app.mjs prompt-only ./my-agent-app
```

When you run the scaffold directly from this repository, it automatically rewrites:

- `@dspo/tauri-agent` to a local dependency inside this checkout
- `tauri-plugin-agent-runtime` to a local Rust `path` dependency inside this checkout

That keeps local integration and smoke tests working before the crate / npm packages are published.

## Using it after publish

```bash
pnpm dlx create-tauri-agent-app prompt-only ./my-agent-app
```

## Usage

```bash
create-tauri-agent-app prompt-only ./my-agent-app
create-tauri-agent-app declarative ./my-agent-app
create-tauri-agent-app operator ./my-agent-app
create-tauri-agent-app cosmic-weather ./my-cosmic-app
```

## Templates

- `prompt-only`: smallest prompt-driven agent
- `declarative`: resource / action / domain declarations
- `operator`: high-privilege tools and operator workflow shape
- `cosmic-weather`: full single-page Tauri demo with an explicit `ConfigProvider`, custom zodiac tool, `SOUL.MD`, and card-based UI

## What generated apps get

- Local JS / Rust dependency rewriting when generated inside this repo
- Full demo wiring in the `cosmic-weather` template
- A first-class `SOUL.MD` entrypoint via `defineSoul(...)` and `composeAgentTurnText(...)`
