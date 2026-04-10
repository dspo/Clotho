import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantTurnStreamEnvelope, TauriAgentClient } from '@dspo/tauri-agent';
import { turnKey } from './helpers';

/** Options for the {@link useTurnStream} hook. */
export interface UseTurnStreamOptions {
  /** The TauriAgentClient instance to use for API calls. */
  client: TauriAgentClient;
  /** Active thread ID, or null when no thread is selected. */
  threadId: string | null;
  /** Active turn ID, or null when no turn is running. */
  turnId: string | null;
  /** Callback invoked for each stream item received. */
  onItem: (item: AssistantTurnStreamEnvelope) => void;
}

/** Return value of the {@link useTurnStream} hook. */
export interface UseTurnStreamReturn {
  /** Whether the stream is currently attached (receiving items). */
  isAttached: boolean;
  /** Whether a resume call is in flight. */
  isResuming: boolean;
  /**
   * Resume (or initially attach) the turn stream.
   * @param afterSeq - Resume from this sequence number. Pass null/undefined to start from the beginning.
   */
  resume: (afterSeq?: number | null) => Promise<void>;
  /** Detach from the current stream, stopping item delivery. */
  detach: () => void;
}

/**
 * React hook that manages the attach/resume/detach state machine for
 * an agent turn stream.
 *
 * Prevents duplicate resume calls and auto-detaches on unmount or when
 * threadId/turnId change.
 *
 * @example
 * ```tsx
 * const { isAttached, resume, detach } = useTurnStream({
 *   client: myClient,
 *   threadId,
 *   turnId,
 *   onItem: (item) => dispatch(item),
 * });
 * ```
 */
export function useTurnStream(options: UseTurnStreamOptions): UseTurnStreamReturn {
  const { client, threadId, turnId, onItem } = options;

  const [isAttached, setIsAttached] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  // Track the currently attached turn to detect changes
  const attachedKeyRef = useRef<string | null>(null);
  // Track the latest seq received
  const lastSeqRef = useRef<number>(0);
  // Guard against concurrent resume calls
  const resumeInFlightRef = useRef(false);
  // Keep onItem callback ref stable
  const onItemRef = useRef(onItem);
  onItemRef.current = onItem;
  // Track mount state
  const mountedRef = useRef(true);

  const currentKey = threadId && turnId ? turnKey(threadId, turnId) : null;

  const detach = useCallback(() => {
    attachedKeyRef.current = null;
    lastSeqRef.current = 0;
    resumeInFlightRef.current = false;
    setIsAttached(false);
    setIsResuming(false);
  }, []);

  const resume = useCallback(
    async (afterSeq?: number | null) => {
      if (!threadId || !turnId) {
        return;
      }

      // Prevent duplicate resume calls for the same turn
      if (resumeInFlightRef.current) {
        return;
      }

      const key = turnKey(threadId, turnId);
      resumeInFlightRef.current = true;
      setIsResuming(true);

      try {
        const ack = await client.resumeTurnStream(
          {
            threadId,
            turnId,
            afterSeq: afterSeq ?? null,
          },
          (item) => {
            if (!mountedRef.current) {
              return;
            }
            // Only process items for the currently attached key
            if (attachedKeyRef.current !== key) {
              return;
            }
            if (item.seq > lastSeqRef.current) {
              lastSeqRef.current = item.seq;
            }
            onItemRef.current(item);
          },
        );

        if (!mountedRef.current) {
          return;
        }

        if (ack.resumed) {
          attachedKeyRef.current = key;
          setIsAttached(true);
        }
      } finally {
        resumeInFlightRef.current = false;
        if (mountedRef.current) {
          setIsResuming(false);
        }
      }
    },
    [client, threadId, turnId],
  );

  // Auto-detach when turn changes
  useEffect(() => {
    if (attachedKeyRef.current && attachedKeyRef.current !== currentKey) {
      detach();
    }
  }, [currentKey, detach]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      attachedKeyRef.current = null;
      resumeInFlightRef.current = false;
    };
  }, []);

  return { isAttached, isResuming, resume, detach };
}
