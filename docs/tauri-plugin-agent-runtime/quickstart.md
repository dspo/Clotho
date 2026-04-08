# Tauri Agent Runtime Quickstart

这份文档面向希望把 Codex 能力快速接入 Tauri v2 应用的开发者。当前仓库里的 framework 还处在“generic facade + legacy runtime shim”阶段，但已经具备一条可运行的最小接入路径：

1. Rust 侧注册 `tauri-plugin-agent-runtime`
2. TypeScript 侧用 `@dspo/tauri-agent` 声明 agent / domain
3. 可选地用 `@dspo/tauri-agent-react` 渲染 transcript / proposal / audit
4. 需要新项目时，用 `create-tauri-agent-app` 生成模板

## 组件一览

| Surface | Path / package | Responsibility |
| --- | --- | --- |
| Rust core | `src-tauri/crates/agent-core` | 通用 agent/tool/provider/policy/output 抽象 |
| Tauri plugin | `src-tauri/crates/tauri-plugin-agent-runtime` | Tauri plugin 入口；当前转接到兼容层实现 |
| Legacy compatibility layer | `src-tauri/crates/tauri-plugin-assistant-runtime` | 现有 thread/turn/streaming/proposal/runtime 主链 |
| TS SDK | `packages/tauri-agent` | typed client、runtime types、`defineAgent` / `defineDomain` |
| React bindings | `packages/tauri-agent-react` | `Transcript`、`ProposalSummary`、`AuditTrail`、`useAgentStatus` |
| Scaffold | `packages/create-tauri-agent-app` | `prompt-only` / `declarative` / `operator` 模板 |

## 1. Rust 侧注册 plugin

如果你在这个 monorepo 内开发，直接使用 path / workspace 依赖；未来对外发布后再切换成 semver 依赖即可。

```toml
# src-tauri/Cargo.toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-agent-runtime = { path = "crates/tauri-plugin-agent-runtime" }
```

然后在 Tauri builder 中注册 plugin：

```rust
use tauri_plugin_agent_runtime::init as agent_runtime_plugin;

fn main() {
    tauri::Builder::default()
        .plugin(agent_runtime_plugin())
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}
```

## 2. TypeScript 侧声明 agent / domain

`@dspo/tauri-agent` 暴露的是声明式 authoring API 和 typed runtime client。

```ts
import {
  builtinPermissionSets,
  defineAgent,
  defineDomain,
} from '@dspo/tauri-agent';

export const planningDomain = defineDomain({
  id: 'planning',
  resources: [{ resourceId: 'task-db', required: true }],
  actions: [{ id: 'draft-plan', description: 'Generate a safe work plan' }],
});

export const plannerAgent = defineAgent({
  id: 'planner',
  name: 'Planner',
  description: 'Plan work with proposal-first safeguards.',
  instructions: 'Help the user plan work safely and explain trade-offs.',
  toolBindings: [{ toolId: 'list_tasks', permission: builtinPermissionSets[0] }],
  actionPolicy: 'proposal-only',
  outputContract: 'proposal',
});
```

内置权限集当前固定为：

- `read-only`
- `operator`
- `automation`
- `debug`

## 3. 使用 typed client 建 thread / turn / stream

```ts
import { defaultTauriAgentClient } from '@dspo/tauri-agent';

const thread = await defaultTauriAgentClient.createThread({
  title: 'Weekly planning',
});

const ack = await defaultTauriAgentClient.startTurn(
  {
    threadId: thread.threadId,
    text: 'Review my workload and prepare a proposal for today.',
    mode: 'plan',
  },
  (item) => {
    console.log('stream item', item);
  },
);

const snapshot = await defaultTauriAgentClient.getThreadSnapshot(thread.threadId);
console.log(ack.turnId, snapshot.blocks.length);
```

如果宿主应用实现了 proposal / automation 边界，还可以使用：

- `simulateProposal(...)`
- `applyProposal(...)`
- `getDailyAutomationStatus()`
- `runDailyAutomationNow()`

## 4. 可选：接入 React 组件 / hooks

```tsx
import { defaultTauriAgentClient } from '@dspo/tauri-agent';
import { Transcript, useAgentStatus } from '@dspo/tauri-agent-react';

export function AgentPanel({ blocks }: { blocks: any[] }) {
  const events = useAgentStatus((handler) => defaultTauriAgentClient.onStatus(handler));

  return (
    <section>
      <p>Status events: {events.length}</p>
      <Transcript blocks={blocks} />
    </section>
  );
}
```

当前 React 包提供的能力是最小可用版本，重点是把 transcript / proposal / audit 这几个通用 UI 面先独立出来。

## 5. 用脚手架快速起步

本仓库中的本地用法：

```bash
node packages/create-tauri-agent-app/bin/create-tauri-agent-app.mjs prompt-only ./my-agent-app
node packages/create-tauri-agent-app/bin/create-tauri-agent-app.mjs declarative ./my-agent-app
node packages/create-tauri-agent-app/bin/create-tauri-agent-app.mjs operator ./my-agent-app
```

模板差异：

- `prompt-only`: 只提供 prompt 和最小 agent 定义
- `declarative`: 增加 resource / action / domain 声明
- `operator`: 预留更高权限、自定义 tool/operator 的位置

## 6. 当前兼容性说明

为了不打断现有 Clotho 主链，generic plugin 目前仍复用 `tauri-plugin-assistant-runtime` 的运行时实现。因此：

1. Rust 侧推荐使用 `tauri-plugin-agent-runtime::init()`
2. TypeScript client 当前默认仍连到 `assistant-runtime` plugin namespace
3. proposal / simulate / apply 的最终写入边界仍由宿主应用负责

换句话说，PR1 交付的是“通用框架表面 + 可接入文档 + 可运行包结构”，PR2 再把 Clotho 作为第一个完整宿主应用接上去。
