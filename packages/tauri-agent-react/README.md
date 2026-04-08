# @dspo/tauri-agent-react

Minimal React bindings for the Tauri Agent Runtime Framework.

- `Transcript` renders runtime conversation blocks.
- `ProposalSummary` renders proposal metadata.
- `AuditTrail` renders native tool audit rows.
- `useAgentStatus` subscribes to runtime status events.

```tsx
import { defaultTauriAgentClient } from '@dspo/tauri-agent';
import { Transcript, useAgentStatus } from '@dspo/tauri-agent-react';

export function AgentSurface({ blocks }: { blocks: any[] }) {
  const events = useAgentStatus((handler) => defaultTauriAgentClient.onStatus(handler));

  return (
    <section>
      <p>Observed events: {events.length}</p>
      <Transcript blocks={blocks} />
    </section>
  );
}
```
