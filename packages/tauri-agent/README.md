# @dspo/tauri-agent

`@dspo/tauri-agent` 是 Tauri Agent Runtime Framework 的 TypeScript 客户端 SDK，负责提供：

- 声明式 authoring API：`defineAgent(...)`、`defineDomain(...)`
- 统一的类型安全客户端：`TauriAgentClient`
- 默认 client：`defaultTauriAgentClient`
- 共享 DTO：threads、turns、proposals、automation、runtime events

## 最小示例

```ts
import { defineAgent, defineDomain, defaultTauriAgentClient } from '@dspo/tauri-agent';

const agent = defineAgent({
  id: 'planner',
  instructions: '帮助用户规划任务并生成提案。',
});

const domain = defineDomain({
  id: 'planning',
  resources: [{ resourceId: 'task-db', required: true }],
  actions: [{ id: 'draft-plan', description: '生成安全提案' }],
});

const thread = await defaultTauriAgentClient.createThread({ title: 'Planning' });
```

默认插件命名空间为 `agent-runtime`。如果你仍在维护旧宿主，可通过 `new TauriAgentClient({ plugin: 'assistant-runtime' })` 显式覆盖。
