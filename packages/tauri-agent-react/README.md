<a id="zh"></a>

# @dspo/tauri-agent-react

[English](#en)

`@dspo/tauri-agent-react` 提供最小可复用的 React 绑定，适合宿主快速拼出 transcript / proposal / audit UI。

## 公开能力

- `Transcript`
- `ProposalSummary`
- `AuditTrail`
- `useAgentStatus`

## 示例

```tsx
import { defaultTauriAgentClient } from '@dspo/tauri-agent';
import { Transcript, useAgentStatus } from '@dspo/tauri-agent-react';

export function AgentSurface({ blocks }: { blocks: any[] }) {
  const events = useAgentStatus((handler) => defaultTauriAgentClient.onStatus(handler));

  return (
    <section>
      <p>观察到的状态事件数：{events.length}</p>
      <Transcript blocks={blocks} />
    </section>
  );
}
```

---

<a id="en"></a>

# @dspo/tauri-agent-react

[简体中文](#zh)

`@dspo/tauri-agent-react` provides a minimal reusable React surface for building transcript / proposal / audit UI quickly in a host app.

## Public surface

- `Transcript`
- `ProposalSummary`
- `AuditTrail`
- `useAgentStatus`

## Example

```tsx
import { defaultTauriAgentClient } from '@dspo/tauri-agent';
import { Transcript, useAgentStatus } from '@dspo/tauri-agent-react';

export function AgentSurface({ blocks }: { blocks: any[] }) {
  const events = useAgentStatus((handler) => defaultTauriAgentClient.onStatus(handler));

  return (
    <section>
      <p>Observed status events: {events.length}</p>
      <Transcript blocks={blocks} />
    </section>
  );
}
```
