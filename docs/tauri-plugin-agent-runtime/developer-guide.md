# Tauri Agent Runtime Developer Guide

这份文档解释 PR1 里已经落地的 framework surface、当前兼容层的边界，以及开发者在接入时各自应承担的职责。

## 当前 package / crate 结构

### Rust

| Path | Role |
| --- | --- |
| `src-tauri/crates/agent-core` | 定义通用 runtime 抽象：`Builder`、`AgentDefinition`、`FunctionToolDefinition`、`ToolProvider`、`ActionPolicy`、`OutputContract` |
| `src-tauri/crates/tauri-plugin-agent-runtime` | 通用 Tauri plugin facade；对外暴露 framework 名称 |
| `src-tauri/crates/tauri-plugin-assistant-runtime` | 兼容层和现有实现；承载 thread/turn/streaming/catalog/runtime 命令 |
| `src-tauri/crates/clotho-adapter` | 让 runtime 先依赖 adapter，再由 adapter 转接 Clotho domain |
| `src-tauri/crates/clotho-domain` | 现阶段仍被兼容层使用的 Clotho 领域模型和 proposal / repository 语义 |

### TypeScript / React

| Path | Role |
| --- | --- |
| `packages/tauri-agent` | typed client、runtime types、`defineAgent` / `defineDomain` |
| `packages/tauri-agent-react` | transcript / proposal / audit 的最小 React 组件与 `useAgentStatus` |
| `packages/create-tauri-agent-app` | 本地模板脚手架 |

## 核心抽象

PR1 里对外暴露的核心公共 API 包括：

- `Builder`
- `AgentDefinition`
- `FunctionToolDefinition`
- `FunctionToolHandler`
- `ToolProvider`
- `SkillCatalogRegistration`
- `IntegrationRegistration`
- `ActionPolicy`
- `OutputContract`
- `AutomationHooks`

这些抽象都位于 `agent-core`，`tauri-plugin-agent-runtime` 只负责把它们重新导出，并提供 Tauri plugin 的入口。

## 权限与治理边界

当前内置权限集：

| Permission | Intended use |
| --- | --- |
| `read-only` | 只读查询、低风险浏览型工具 |
| `operator` | 需要较高权限但仍由用户直接驱动的工具 |
| `automation` | 定时或后台自动化任务 |
| `debug` | 诊断、检查、开发期辅助能力 |

需要注意的边界：

1. runtime / plugin 可以承载 thread、turn、stream、catalog、config resolution、tool routing。
2. proposal / simulate / apply 的治理模型已经暴露给 client，但最终写库边界仍在宿主应用。
3. automation 是 framework 的一等能力，但启停、审计和写入动作仍应由宿主控制。

## 当前兼容策略

`tauri-plugin-agent-runtime` 目前还是一个很薄的 generic facade：

- `init()` 直接委托给 `tauri_plugin_assistant_runtime::init()`
- runtime state、streaming envelope、catalog models 也通过兼容层导出
- 这样做的目标是先稳定“通用命名 + 可接入表面”，再逐步迁移内部实现

因此在接入时应把下面这点视为**当前兼容现状，而不是最终 stable contract**：

- TypeScript client 默认 plugin namespace 仍是 `assistant-runtime`

这保证了现有 Clotho 链路不被打断，同时让 PR1 能作为“先落 framework surface、后迁宿主”的基线。

## Codex 依赖策略

PR1 仍然通过 Cargo `git` 依赖引入 Codex crates，而不是 vendor 源码：

- 上游来源：`https://github.com/openai/codex.git`
- 当前固定 `rev`：`bb95ec3ec602dfc7762fd92e2746606df9dfea21`

保留固定 `rev` 的原因：

1. 保证构建可复现
2. 避免上游漂移导致当前 framework surface 隐式变化
3. 便于把 CI 结果与具体 Codex 快照对应起来

另外，Windows 构建会通过本地 `winres` patch 收窄资源链接范围，避免 `codex-windows-sandbox` 的资源对象泄漏到宿主应用最终链接阶段。

## 开发者接入建议

推荐的最小接入顺序：

1. 先注册 `tauri-plugin-agent-runtime`
2. 用 `defineAgent` / `defineDomain` 声明最小 agent
3. 用 `TauriAgentClient` 建 thread、发 turn、读 stream
4. 再按需接 proposal / audit / automation
5. 最后才把宿主应用的数据库写入、审批流和高权限 tool 接上

如果你的目标是：

- **快速验证 prompt agent**：从 `prompt-only` 模板开始
- **声明式资源/动作接入**：从 `declarative` 模板开始
- **高权限工具/后台能力**：从 `operator` 模板开始

## 当前 PR1 的意图

PR1 不负责把 Clotho 完整变成宿主应用。它的目标是：

1. 先把 framework surface、workspace 包结构、兼容迁移策略、开发者文档和 CI 打稳
2. 让另一个开发者可以在这个基线之上接入自己的 Tauri app
3. 再让当前 `feature/assistant-runtime-v1` 作为 PR2，承接 Clotho 这一个真实宿主的智能化实现
