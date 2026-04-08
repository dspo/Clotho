# 基于 Codex 的 Tauri Agent Runtime 快速接入与开发指南

这份文档面向希望在 Tauri v2 应用中集成 **基于 Codex 的 AI Agent 能力** 的开发者。对外推荐的统一入口是：

1. Rust 侧使用 `tauri-plugin-agent-runtime`
2. TypeScript 侧使用 `@dspo/tauri-agent`
3. React 宿主按需使用 `@dspo/tauri-agent-react`
4. 新项目可用 `create-tauri-agent-app` 起模板

## 目录结构与职责

| 路径 / 包 | 作用 |
| --- | --- |
| `src-tauri/crates/agent-core` | 通用抽象：`Builder`、`AgentDefinition`、`FunctionToolDefinition`、`ToolProvider`、`ActionPolicy`、`OutputContract` |
| `src-tauri/crates/tauri-plugin-agent-runtime` | 对外统一的 Tauri plugin 入口，同时承载 runtime engine、thread/turn/stream 主链实现，插件命名空间为 `agent-runtime` |
| `src-tauri/crates/clotho-adapter` | 让 runtime 先依赖通用 adapter，再由宿主接 Clotho domain |
| `packages/tauri-agent` | 类型安全客户端、共享 DTO、`defineAgent` / `defineDomain` |
| `packages/tauri-agent-react` | transcript / proposal / audit 的最小 React 组件与 hooks |
| `packages/create-tauri-agent-app` | `prompt-only` / `declarative` / `operator` 模板 |

## 1. 安装与引用

### Rust 侧

开发者文档默认按 Git 依赖示例说明；实际项目中建议固定 `rev` 或 tag。

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-agent-runtime = { git = "https://github.com/dspo/Clotho.git" }
```

如果你就在本仓库内开发，也可以直接使用 workspace/path 依赖。

### TypeScript 侧

当前仓库内的包通过 pnpm workspace 提供；未来对外发布后，可替换成常规 npm 依赖。

```bash
pnpm add @dspo/tauri-agent
pnpm add @dspo/tauri-agent-react
```

### 脚手架

当前仓库内可直接运行：

```bash
node packages/create-tauri-agent-app/bin/create-tauri-agent-app.mjs prompt-only ./my-agent-app
```

未来对外发布后，可使用：

```bash
pnpm dlx create-tauri-agent-app prompt-only ./my-agent-app
```

## 2. 在 Tauri 中注册 plugin

`tauri-plugin-agent-runtime` 的统一 namespace 是 `agent-runtime`，因此 capability 里也应使用 `agent-runtime:*` 权限标识。

### Rust 注册

```rust
use tauri_plugin_agent_runtime::init as agent_runtime_plugin;

fn main() {
    tauri::Builder::default()
        .plugin(agent_runtime_plugin())
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}
```

### Capability 示例

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "main-capability",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "agent-runtime:operator"
  ]
}
```

当前内置权限集：

- `agent-runtime:read-only`
- `agent-runtime:operator`
- `agent-runtime:automation`
- `agent-runtime:debug`
- `agent-runtime:default`

## 3. 定义和注册 function tools

在当前实现里，`function_tools` 的接入分成两层：

1. `FunctionToolDefinition`：描述 tool 的 contract、权限、schema、可见性
2. `ToolProvider`：真正执行 tool 调用

也就是说，`register_tool(...)` 负责把 tool 暴露到 runtime catalog，`register_provider(...)` 负责执行入口。

```rust
use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{json, Value};
use tauri_plugin_agent_runtime::{
    AgentError, Builder, ExecutionMode, FunctionToolDefinition, PermissionSet,
    ProviderRegistration, RuntimeConfig, RuntimeContext, ToolContext, ToolProvider, Visibility,
};

struct LocalWorkspaceProvider;

#[async_trait]
impl ToolProvider for LocalWorkspaceProvider {
    async fn list_tools(
        &self,
        _ctx: &RuntimeContext,
    ) -> Vec<FunctionToolDefinition> {
        vec![FunctionToolDefinition {
            id: "workspace.list_files".into(),
            description: "列出工作区文件".into(),
            namespace: Some("workspace".into()),
            input_schema: Some(json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" }
                }
            })),
            output_schema: Some(json!({
                "type": "array",
                "items": { "type": "string" }
            })),
            execution_mode: ExecutionMode::Immediate,
            authz: PermissionSet::ReadOnly,
            visibility: Visibility::Public,
        }]
    }

    async fn invoke(
        &self,
        _ctx: &ToolContext,
        tool_id: &str,
        _input: Value,
    ) -> Result<Value, AgentError> {
        match tool_id {
            "workspace.list_files" => Ok(json!(["src", "src-tauri", "package.json"])),
            other => Err(AgentError::Execution(format!("unknown tool: {other}"))),
        }
    }
}

let mut builder = Builder::new();
builder
    .register_tool(FunctionToolDefinition {
        id: "workspace.list_files".into(),
        description: "列出工作区文件".into(),
        namespace: Some("workspace".into()),
        input_schema: None,
        output_schema: None,
        execution_mode: ExecutionMode::Immediate,
        authz: PermissionSet::ReadOnly,
        visibility: Visibility::Public,
    })
    .register_provider(
        ProviderRegistration {
            id: "local-workspace".into(),
            kind: "host".into(),
        },
        Arc::new(LocalWorkspaceProvider),
    )
    .set_config(RuntimeConfig {
        default_permission: PermissionSet::ReadOnly,
        provider_adapters: vec!["codex".into()],
        audit_enabled: true,
    });

let runtime = builder.build()?;
assert_eq!(runtime.provider_count(), 1);
```

### 关于 `FunctionToolHandler`

`FunctionToolHandler` 是更细粒度的 handler trait，适合宿主在更高层再包一层 DSL 或宏；当前框架里，最直接、最稳定的执行路径仍然是 `ToolProvider`。

## 4. 定义 agents、resources、actions

TypeScript 侧推荐通过声明式 API 编排 agent / domain。

```ts
import {
  builtinPermissionSets,
  defineAgent,
  defineDomain,
} from '@dspo/tauri-agent';

export const planningDomain = defineDomain({
  id: 'planning',
  resources: [{ resourceId: 'task-db', required: true }],
  actions: [{ id: 'draft-plan', description: '生成今日计划提案' }],
  tools: [{ toolId: 'workspace.list_files', permission: builtinPermissionSets[0] }],
});

export const plannerAgent = defineAgent({
  id: 'planner',
  name: 'Planner',
  description: '生成任务规划与提案。',
  instructions: '优先给出安全、可审计、可应用的计划。',
  toolBindings: [{ toolId: 'workspace.list_files', permission: builtinPermissionSets[0] }],
  skillBindings: [{ skillId: 'planning/default' }],
  resourceBindings: [{ resourceId: 'task-db', required: true }],
  actionPolicy: 'proposal-only',
  outputContract: 'proposal',
});
```

## 5. 集成 skills 与 integrations

skills 是 authoring-time assets，不是比 tool 更高一级的 runtime primitive。推荐做法是：

1. 在宿主仓库保留 skills 根目录，例如 `.agents/skills`
2. 通过 `SkillCatalogRegistration` 注册 skills catalog
3. 在 agent 定义里通过 `skillBindings` 引用 skill id

```rust
use serde_json::json;
use tauri_plugin_agent_runtime::{IntegrationRegistration, SkillCatalogRegistration};

builder
    .register_skill_catalog(SkillCatalogRegistration {
        id: "default-skills".into(),
        description: Some("宿主提供的行为资产目录".into()),
        root_path: ".agents/skills".into(),
    })
    .register_integration(IntegrationRegistration {
        id: "github-mcp".into(),
        kind: "mcp".into(),
        config: Some(json!({
            "transport": "streamable-http",
            "baseUrl": "http://127.0.0.1:7400/mcp"
        })),
    });
```

这里的 `IntegrationRegistration` 表达的是接入源；例如 MCP 是 integration / tool provider transport，而不是业务动作模型本身。

## 6. 创建 thread / turn / streaming

`@dspo/tauri-agent` 默认连接 `agent-runtime` 插件命名空间。

```ts
import { defaultTauriAgentClient } from '@dspo/tauri-agent';

const thread = await defaultTauriAgentClient.createThread({
  title: '每周规划',
});

const ack = await defaultTauriAgentClient.startTurn(
  {
    threadId: thread.threadId,
    text: '请先查看我的任务，再给出今天的提案。',
    mode: 'plan',
  },
  (item) => {
    console.log('stream item', item);
  },
);

const snapshot = await defaultTauriAgentClient.getThreadSnapshot(thread.threadId);
console.log(ack.turnId, snapshot.blocks.length);
```

如果宿主额外实现了治理边界，还可以继续接：

- `simulateProposal(...)`
- `applyProposal(...)`
- `getDailyAutomationStatus()`
- `runDailyAutomationNow()`

这些 API 的最终写入边界仍应保留在宿主应用，而不是让通用 runtime 直接越权写库。

## 7. React 宿主接入

```tsx
import { defaultTauriAgentClient } from '@dspo/tauri-agent';
import { Transcript, ProposalSummary, AuditTrail, useAgentStatus } from '@dspo/tauri-agent-react';

export function AgentPanel({
  blocks,
  proposal,
  audits,
}: {
  blocks: any[];
  proposal?: any;
  audits: any[];
}) {
  const events = useAgentStatus((handler) => defaultTauriAgentClient.onStatus(handler));

  return (
    <section>
      <p>状态事件数：{events.length}</p>
      <Transcript blocks={blocks} />
      {proposal ? <ProposalSummary proposal={proposal} /> : null}
      <AuditTrail entries={audits} />
    </section>
  );
}
```

当前 React 包故意保持最小可用：先把 transcript / proposal / audit / status hook 抽成通用能力，把产品私有壳层留给宿主自己实现。

## 8. 脚手架模板

```bash
node packages/create-tauri-agent-app/bin/create-tauri-agent-app.mjs prompt-only ./my-agent-app
node packages/create-tauri-agent-app/bin/create-tauri-agent-app.mjs declarative ./my-agent-app
node packages/create-tauri-agent-app/bin/create-tauri-agent-app.mjs operator ./my-agent-app
```

模板差异：

- `prompt-only`：只有最小 prompt agent 定义
- `declarative`：预置 domain/resources/actions
- `operator`：预留高权限 tool / operator workflow 的位置

## 9. Codex 依赖与迁移说明

### Codex 依赖策略

当前 framework 通过 Cargo `git` 依赖引用 Codex crates，而不是 vendor 源码：

- 上游：`https://github.com/openai/codex.git`
- 当前固定 rev：`bb95ec3ec602dfc7762fd92e2746606df9dfea21`

固定 rev 的目的：

1. 保证构建可复现
2. 保持 PR 与 CI 绑定到明确的 Codex 快照
3. 避免上游漂移让 framework surface 悄悄变化

### 统一入口

1. 使用 `agent-runtime` 插件命名空间
2. 使用 `agent-runtime:*` capability 权限
3. 在 TS 侧使用 `@dspo/tauri-agent` 的默认 client 配置
