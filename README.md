<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="Clotho Logo" width="128" height="128">
</p>

<a id="zh"></a>

<h1 align="center">Clotho</h1>

<p align="center">基于 Tauri 2、React 19 与 TypeScript 的任务管理桌面应用。</p>
<p align="center"><a href="#en">English</a></p>

## 功能特性

- **项目与任务管理**：按项目组织任务，并管理状态、优先级与日程
- **富文本描述**：支持 Markdown、斜杠命令、代码块与图片
- **图片附件**：通过高效的 `clotho://` 自定义协议提供图片内容
- **标签与过滤**：使用彩色标签分类并筛选任务
- **MCP Server**：内置 Model Context Protocol 服务，便于 AI 助手接入

## 技术栈

- **桌面框架**：[Tauri 2](https://tauri.app/)
- **前端**：[React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **样式**：[Tailwind CSS 4](https://tailwindcss.com/)
- **路由**：[TanStack Router](https://tanstack.com/router)
- **富文本**：[Tiptap](https://tiptap.dev/) + Markdown
- **状态管理**：[Zustand](https://zustand-demo.pmnd.rs/)
- **UI**：[Radix UI](https://www.radix-ui.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **数据库**：SQLite (`rusqlite`)
- **构建工具**：[Vite 7](https://vitejs.dev/)

## 开发前置条件

- [Node.js](https://nodejs.org/)（v18+）
- [pnpm](https://pnpm.io/)（v10+）
- [Rust](https://www.rust-lang.org/)（用于 Tauri 后端）

## 快速开始

```bash
pnpm install
pnpm tauri dev
pnpm tauri build
```

## 架构说明

### 图片处理

任务图片通过自定义 `clotho://` 协议提供：

- `clotho://image/{id}`：直接返回二进制图片内容
- 支持不可变缓存头
- 避免 base64 编码额外开销

### MCP Server

内置 MCP Server 允许 AI 助手管理任务：

- 默认端点：`http://localhost:7400/mcp`
- 在“设置 > MCP Server”中启用
- 支持任务 / 项目 / 标签的 CRUD 能力

### Agent Runtime Framework

仓库同时承载 `tauri-plugin-agent-runtime` 的框架演进工作。相关开发者文档见：

- `docs/tauri-plugin-agent-runtime/design.md`
- `docs/tauri-plugin-agent-runtime/quickstart.md`
- `examples/cosmic-weather/`

## 许可证

MIT

---

<a id="en"></a>

# Clotho

[简体中文](#zh)

Clotho is a task management desktop application built with Tauri 2, React 19, and TypeScript.

## Features

- **Project & task management** with status, priority, and scheduling
- **Rich text descriptions** with Markdown, slash commands, code blocks, and images
- **Image attachments** served through the custom `clotho://` protocol
- **Tags & filtering** for task categorization
- **Built-in MCP server** for AI assistant integration

## Tech stack

- **Desktop framework**: [Tauri 2](https://tauri.app/)
- **Frontend**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Routing**: [TanStack Router](https://tanstack.com/router)
- **Rich text**: [Tiptap](https://tiptap.dev/) with Markdown
- **State**: [Zustand](https://zustand-demo.pmnd.rs/)
- **UI**: [Radix UI](https://www.radix-ui.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **Database**: SQLite (`rusqlite`)
- **Build tool**: [Vite 7](https://vitejs.dev/)

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/) (v10+)
- [Rust](https://www.rust-lang.org/) for the Tauri backend

## Getting started

```bash
pnpm install
pnpm tauri dev
pnpm tauri build
```

## Architecture notes

### Image handling

Task images are served through the custom `clotho://` protocol:

- `clotho://image/{id}` returns binary image data directly
- Supports immutable browser caching
- Avoids base64 overhead

### MCP server

The built-in MCP server allows AI assistants to manage tasks:

- Default endpoint: `http://localhost:7400/mcp`
- Enable it in Settings > MCP Server
- Supports CRUD for tasks, projects, and tags

### Agent Runtime Framework

This repository also hosts the framework work for `tauri-plugin-agent-runtime`. Developer-facing entry points live in:

- `docs/tauri-plugin-agent-runtime/design.md`
- `docs/tauri-plugin-agent-runtime/quickstart.md`
- `examples/cosmic-weather/`

## License

MIT
