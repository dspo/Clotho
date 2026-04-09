<a id="zh"></a>

# @dspo/tauri-agent

[English](#en)

`@dspo/tauri-agent` 是 Tauri Agent Runtime Framework 的 TypeScript 客户端 SDK，负责提供：

- 声明式 authoring API：`defineAgent(...)`、`defineDomain(...)`、`defineSoul(...)`
- 统一的类型安全客户端：`TauriAgentClient`
- 默认 client：`defaultTauriAgentClient`
- 共享 DTO：threads、turns、proposals、automation、runtime events
- `composeAgentTurnText(...)`：统一拼接 `SOUL.MD`、instructions 与用户输入

## 最小示例

```ts
import {
  composeAgentTurnText,
  defaultTauriAgentClient,
  defineAgent,
  defineDomain,
  defineSoul,
} from '@dspo/tauri-agent';

const plannerSoul = defineSoul({
  source: 'SOUL.MD',
  summary: '限制 agent 只做任务规划。',
  markdown: '# Planner Soul\n\nOnly help with planning and proposal drafting.',
});

const agent = defineAgent({
  id: 'planner',
  soul: plannerSoul,
  instructions: '帮助用户规划任务并生成提案。',
});

const domain = defineDomain({
  id: 'planning',
  resources: [{ resourceId: 'task-db', required: true }],
  actions: [{ id: 'draft-plan', description: '生成安全提案' }],
});

const thread = await defaultTauriAgentClient.createThread({ title: 'Planning' });
const text = composeAgentTurnText(agent, {
  userText: '请帮我整理今天的任务。',
});
```

默认插件命名空间为 `agent-runtime`。

---

<a id="en"></a>

# @dspo/tauri-agent

[简体中文](#zh)

`@dspo/tauri-agent` is the TypeScript client SDK for the Tauri Agent Runtime Framework. It provides:

- Declarative authoring APIs: `defineAgent(...)`, `defineDomain(...)`, and `defineSoul(...)`
- A typed runtime client: `TauriAgentClient`
- The default client: `defaultTauriAgentClient`
- Shared DTOs for threads, turns, proposals, automation, and runtime events
- `composeAgentTurnText(...)` to combine `SOUL.MD`, developer instructions, and user input

## Minimal example

```ts
import {
  composeAgentTurnText,
  defaultTauriAgentClient,
  defineAgent,
  defineDomain,
  defineSoul,
} from '@dspo/tauri-agent';

const plannerSoul = defineSoul({
  source: 'SOUL.MD',
  summary: 'Keep the agent inside planning-only scope.',
  markdown: '# Planner Soul\n\nOnly help with planning and proposal drafting.',
});

const agent = defineAgent({
  id: 'planner',
  soul: plannerSoul,
  instructions: 'Help the user plan work and draft proposals.',
});

const domain = defineDomain({
  id: 'planning',
  resources: [{ resourceId: 'task-db', required: true }],
  actions: [{ id: 'draft-plan', description: 'Generate a safe proposal' }],
});

const thread = await defaultTauriAgentClient.createThread({ title: 'Planning' });
const text = composeAgentTurnText(agent, {
  userText: "Help me organize today's work.",
});
```

The default plugin namespace is `agent-runtime`.
