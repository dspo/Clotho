<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="Clotho Logo" width="128" height="128">
</p>

<h1 align="center">Clotho</h1>

<p align="center">A task management desktop application built with Tauri 2, React 19, and TypeScript.</p>

## Features

- **Project & Task Management**: Organize tasks into projects with status, priority, and scheduling
- **Rich Text Descriptions**: Markdown editor with slash commands, code blocks, and image support
- **Image Attachments**: Attach images to tasks, served via efficient custom protocol (`clotho://`)
- **Tags & Filtering**: Categorize tasks with colored tags
- **MCP Server**: Built-in Model Context Protocol server for AI assistant integration

## Tech Stack

- **Framework**: [Tauri 2](https://tauri.app/) - Desktop apps with Rust backend
- **Frontend**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Routing**: [TanStack Router](https://tanstack.com/router)
- **Rich Text**: [Tiptap](https://tiptap.dev/) with Markdown support
- **State**: [Zustand](https://zustand-demo.pmnd.rs/)
- **UI**: [Radix UI](https://www.radix-ui.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **Database**: SQLite (rusqlite)
- **Build**: [Vite 7](https://vitejs.dev/)

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/) (v10+)
- [Rust](https://www.rust-lang.org/) (for Tauri backend)

## Getting Started

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

## Architecture

### Image Handling

Images attached to tasks are served via a custom `clotho://` protocol:
- `clotho://image/{id}` - Returns binary image data directly
- Supports browser caching with immutable Cache-Control headers
- No base64 encoding overhead

### MCP Server

The built-in MCP server allows AI assistants to manage tasks:
- Endpoint: `http://localhost:7400/mcp` (configurable)
- Enable in Settings > MCP Server
- Supports task/project/tag CRUD operations

## License

MIT
