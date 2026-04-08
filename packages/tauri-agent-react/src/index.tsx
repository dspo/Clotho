import { useEffect, useState } from 'react';

import type {
  AssistantStatusEventEnvelope,
  ConversationBlock,
  NativeToolAuditEntry,
  ProposalPayload,
} from '@dspo/tauri-agent';

export function Transcript({ blocks }: { blocks: ConversationBlock[] }) {
  return (
    <div>
      {blocks.map((block) => (
        <article key={block.blockId}>
          {block.title ? <h4>{block.title}</h4> : null}
          <p>{block.text}</p>
        </article>
      ))}
    </div>
  );
}

export function ProposalSummary({ proposal }: { proposal: ProposalPayload }) {
  return (
    <section>
      <h3>{proposal.summary}</h3>
      <p>{proposal.intent}</p>
      <p>Actions: {proposal.actions.length}</p>
    </section>
  );
}

export function AuditTrail({ entries }: { entries: NativeToolAuditEntry[] }) {
  return (
    <ul>
      {entries.map((entry) => (
        <li key={entry.auditId}>
          <strong>{entry.toolName}</strong>: {entry.summary}
        </li>
      ))}
    </ul>
  );
}

export function useAgentStatus<TPayload = unknown>(
  subscribe: (
    handler: (event: AssistantStatusEventEnvelope<TPayload>) => void,
  ) => Promise<() => void>,
) {
  const [events, setEvents] = useState<AssistantStatusEventEnvelope<TPayload>[]>([]);

  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | undefined;

    void subscribe((event) => {
      if (!active) {
        return;
      }
      setEvents((current) => [...current, event]);
    }).then((unlisten) => {
      cleanup = unlisten;
    });

    return () => {
      active = false;
      cleanup?.();
    };
  }, [subscribe]);

  return events;
}
