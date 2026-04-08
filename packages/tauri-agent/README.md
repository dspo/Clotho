# @dspo/tauri-agent

Typed client, shared runtime types, and declarative authoring helpers for the Tauri Agent Runtime Framework.

This package now owns the shared runtime types that were previously app-local in Clotho.

It exposes:

- `defineAgent(...)`
- `defineDomain(...)`
- `builtinPermissionSets`
- `TauriAgentClient`
- `defaultTauriAgentClient`
- shared DTOs for threads, turns, proposals, automation, and runtime events

```ts
import { defineAgent, defineDomain, defaultTauriAgentClient } from '@dspo/tauri-agent';

const agent = defineAgent({
  id: 'planner',
  instructions: 'Help the user plan work.',
});

const domain = defineDomain({
  id: 'planning',
  resources: [{ resourceId: 'task-db', required: true }],
  actions: [{ id: 'draft-plan', description: 'Prepare a safe plan' }],
});

const thread = await defaultTauriAgentClient.createThread({ title: 'Planning' });
```

Compatibility note: the Rust-facing framework crate is `tauri-plugin-agent-runtime`, while the current client still defaults to the legacy `assistant-runtime` plugin namespace so existing hosts keep working during migration.
