# create-tauri-agent-app

`create-tauri-agent-app` 是 Tauri Agent Runtime Framework 的最小脚手架。

## 安装

当前仓库内使用：

```bash
node packages/create-tauri-agent-app/bin/create-tauri-agent-app.mjs prompt-only ./my-agent-app
```

当你直接从当前仓库执行脚手架时，生成器会自动把：

- `@dspo/tauri-agent` 改写为指向当前仓库的本地依赖
- `tauri-plugin-agent-runtime` 改写为指向当前仓库 crate 的本地 `path` 依赖

这样在 crate / npm 包尚未正式发布前，也能基于这个仓库完成本地集成与 smoke test。

未来发布到 npm 后，可直接使用：

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
- `cosmic-weather`：完整单页 Tauri demo，包含显式 `ConfigProvider`、自定义 zodiac tool 和卡片式结果 UI
