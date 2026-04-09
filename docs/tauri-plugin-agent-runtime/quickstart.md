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

如果你是直接在本仓库里跑这个脚手架，生成器会自动把 `@dspo/tauri-agent` 和 `tauri-plugin-agent-runtime` 改写成指向当前 checkout 的本地依赖，方便在发布前先做真实集成与 smoke test。

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

默认情况下，`init()` 会使用 framework 内置的 `DefaultConfigProvider`，它会从 `~/.codex/config.toml` 读取模型 / provider 配置。

framework 本身不会内置任何宿主业务 tools。宿主需要暴露自己的能力时，应通过 `Builder` / `ToolProvider` 注册函数工具，再由 runtime 在启动 thread 时按注册结果暴露给模型。

如果宿主应用希望改成项目内配置、demo 内配置，或任何自定义来源，应改用 `AgentRuntimePluginBuilder` + `init_with_builder(...)` 显式提供 `ConfigProvider`。

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

## 3. 配置 AI Provider（ConfigProvider）

`ConfigProvider` 是 runtime 的显式接入边界：

1. **宿主可以自己提供**配置来源（项目内 TOML、数据库、系统设置、远程密钥服务等）
2. **如果宿主不提供**，framework 默认回退到 `DefaultConfigProvider`
3. 默认 provider 的行为是：读取 `~/.codex/config.toml`

### 最小自定义 provider：直接指向一个 TOML 文件

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
                TomlConfigProvider::new(
                    "demo",
                    "Bundled demo config",
                    "demo",
                    config_path,
                )
                .with_default(true),
            )),
        ))
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}
```

### `.codex/config.toml` 形状

```toml
model = "gpt-5.4"
model_provider = "openai"
approval_policy = "never"
sandbox_mode = "read-only"

[model_providers.openai]
env_key = "OPENAI_API_KEY"
wire_api = "responses"

[profiles.compat]
model = "gpt-4.1"
model_provider = "compat"

[profiles.compat.model_providers.compat]
base_url = "https://your-openai-compatible-endpoint/v1"
env_key = "COMPAT_API_KEY"
wire_api = "chat_completions"
```

当前 runtime 会读取这些字段：

- `model`
- `model_provider`
- `[model_providers.<id>]`
- `base_url`
- `env_key`
- `wire_api`
- `approval_policy`
- `sandbox_mode`
- `model_reasoning_effort`
- `model_reasoning_summary`
- `model_verbosity`
- `personality`
- `service_tier`

### 前端如何查看当前解析结果

```ts
import { defaultTauriAgentClient } from '@dspo/tauri-agent';

const config = await defaultTauriAgentClient.resolveConfig({
  configId: 'demo',
  profile: 'compat',
});

console.log(config.provider, config.model, config.baseUrl, config.envKey);
```

### 常见约定

1. `ConfigProvider` 决定“配置从哪里来”
2. `configId` 决定“当前选的是哪份配置”
3. `profile` 决定“在同一份配置里叠加哪个 profile”
4. 如果没有显式 `ConfigProvider`，就按 `~/.codex/config.toml` 走

完整参考实现见 `examples/cosmic-weather/`。

## 4. 定义和注册 function tools

在当前实现里，`function_tools` 的接入通常只需要一层 provider：

1. `ToolProvider::list_tools(...)`：返回 `FunctionToolDefinition`，描述 tool 的 contract、权限、schema、可见性
2. `ToolProvider::invoke(...)`：真正执行 tool 调用

也就是说，宿主通常只需要 `register_provider(...)`。`register_tool(...)` 只在你想对 provider 返回的定义做额外覆盖时才需要显式使用。

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

let runtime = Builder::new()
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
    })
    .build()?;
assert_eq!(runtime.provider_count(), 1);
```

### 关于 `FunctionToolHandler`

`FunctionToolHandler` 是更细粒度的 handler trait，适合宿主在更高层再包一层 DSL 或宏；当前框架里，最直接、最稳定的执行路径仍然是 `ToolProvider`。

## 5. 定义 agents、resources、actions

TypeScript 侧推荐通过声明式 API 编排 agent / domain。

```ts
import {
  builtinPermissionSets,
  composeAgentTurnText,
  defineAgent,
  defineDomain,
  defineSoul,
} from '@dspo/tauri-agent';

export const planningDomain = defineDomain({
  id: 'planning',
  resources: [{ resourceId: 'task-db', required: true }],
  actions: [{ id: 'draft-plan', description: '生成今日计划提案' }],
  tools: [{ toolId: 'workspace.list_files', permission: builtinPermissionSets[0] }],
});

export const plannerSoul = defineSoul({
  source: 'SOUL.MD',
  summary: '限制 agent 只做任务规划与提案生成。',
  markdown: `
# Planner Soul

## Scope
- 帮助用户整理任务上下文
- 生成可审计、可应用的规划提案

## Boundaries
- 不处理与规划无关的泛用聊天
- 不给出医疗、法律、金融等高风险建议
- 如果用户要求越界能力，简短拒绝并引导回规划场景
  `.trim(),
});

export const plannerAgent = defineAgent({
  id: 'planner',
  name: 'Planner',
  description: '生成任务规划与提案。',
  soul: plannerSoul,
  instructions: '优先给出安全、可审计、可应用的计划。',
  toolBindings: [{ toolId: 'workspace.list_files', permission: builtinPermissionSets[0] }],
  skillBindings: [{ skillId: 'planning/default' }],
  resourceBindings: [{ resourceId: 'task-db', required: true }],
  actionPolicy: 'proposal-only',
  outputContract: 'proposal',
});

const turnText = composeAgentTurnText(plannerAgent, {
  userText: '请根据本周任务生成今日计划提案。',
  extraInstructions: ['优先输出可执行的 proposal，不要直接写入业务数据库。'],
});
```

推荐把 agent 的“灵魂与边界”放在独立的 `SOUL.MD` 中，再通过 `defineSoul(...)` 接入；运行时发送 turn 时使用 `composeAgentTurnText(...)` 统一把 `SOUL.MD`、开发者 instructions 和用户输入拼成最终 prompt，避免宿主每个页面手写一套 prompt 模板，导致边界逐渐漂移。

## 6. 集成 skills 与 integrations

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

## 7. 创建 thread / turn / streaming

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

如果宿主额外实现了 proposal / automation / 资源落盘等治理边界，建议在宿主侧单独暴露自己的 Tauri commands 或二次 SDK，而不是把这些业务命令塞回通用 `@dspo/tauri-agent`。

## 8. React 宿主接入

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

## 9. 脚手架模板

```bash
node packages/create-tauri-agent-app/bin/create-tauri-agent-app.mjs prompt-only ./my-agent-app
node packages/create-tauri-agent-app/bin/create-tauri-agent-app.mjs declarative ./my-agent-app
node packages/create-tauri-agent-app/bin/create-tauri-agent-app.mjs operator ./my-agent-app
node packages/create-tauri-agent-app/bin/create-tauri-agent-app.mjs cosmic-weather ./my-cosmic-app
```

从当前仓库本地执行时，脚手架会自动注入本地 repo 依赖；将来包正式发布后，同一命令会落到发布版依赖坐标。

模板差异：

- `prompt-only`：只有最小 prompt agent 定义
- `declarative`：预置 domain/resources/actions
- `operator`：预留高权限 tool / operator workflow 的位置
- `cosmic-weather`：完整单页 Tauri demo，包含显式 `ConfigProvider`、自定义 zodiac tool、卡片式输出 UI

如果你希望先看真实成品，再回头抽象成模板，仓库里还有一个同步维护的完整示例：

- `examples/cosmic-weather/`

## 10. Codex 依赖与迁移说明

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
