# create-tauri-agent-app

`create-tauri-agent-app` 是 Tauri Agent Runtime Framework 的最小脚手架。

## 安装

当前仓库内使用：

```bash
node packages/create-tauri-agent-app/bin/create-tauri-agent-app.mjs prompt-only ./my-agent-app
```

未来发布到 npm 后，可直接使用：

```bash
pnpm dlx create-tauri-agent-app prompt-only ./my-agent-app
```

## 用法

```bash
create-tauri-agent-app prompt-only ./my-agent-app
create-tauri-agent-app declarative ./my-agent-app
create-tauri-agent-app operator ./my-agent-app
```

## 模板

- `prompt-only`：最小 prompt agent
- `declarative`：内置 resource / action / domain 声明
- `operator`：预留高权限 tools 与 operator workflow
