import { useEffect, useRef, useState } from 'react';

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
  const subscribeRef = useRef(subscribe);
  subscribeRef.current = subscribe;

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    const subscription = subscribeRef.current((event) => {
      if (!disposed) {
        setEvents((current) => [...current, event]);
      }
    });

    void subscription.then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      cleanup = unlisten;
    });

    return () => {
      disposed = true;
      if (cleanup) {
        cleanup();
        return;
      }
      void subscription.then((unlisten) => {
        unlisten();
      });
    };
  }, []);

  return events;
}
