import type { ConversationBlock } from '@dspo/tauri-agent';

/**
 * Build a composite key for identifying a specific turn in a thread.
 * Useful as a Map/Set key when tracking per-turn state.
 */
export function turnKey(threadId: string, turnId: string): string {
  return `${threadId}:${turnId}`;
}

/**
 * Safely cast an unknown value to a Record, returning null if the value
 * is not a plain object.
 */
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Read a string property from a record, returning null if the key is
 * missing or the value is not a string.
 */
export function readString(
  record: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const candidate = record?.[key];
  return typeof candidate === 'string' ? candidate : null;
}

/**
 * Read an array property from a record, returning null if the key is
 * missing or the value is not an array.
 */
export function readArray(
  record: Record<string, unknown> | null | undefined,
  key: string,
): unknown[] | null {
  const candidate = record?.[key];
  return Array.isArray(candidate) ? candidate : null;
}

/**
 * Read a boolean property from a record, returning null if the key is
 * missing or the value is not a boolean.
 */
export function readBoolean(
  record: Record<string, unknown> | null | undefined,
  key: string,
): boolean | null {
  const candidate = record?.[key];
  return typeof candidate === 'boolean' ? candidate : null;
}

/**
 * Check whether a conversation block is marked as hidden in its metadata.
 */
export function isBlockHidden(block: ConversationBlock): boolean {
  return readBoolean(asRecord(block.metadata), 'hidden') === true;
}

/**
 * Extract the turnId from a conversation block's metadata, if present.
 */
export function getBlockTurnId(block: ConversationBlock): string | null {
  return readString(asRecord(block.metadata), 'turnId');
}

/**
 * Return a human-readable label for a turn/block status string.
 */
export function statusLabel(status: string | null): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'pending':
      return 'Pending';
    case 'in_progress':
      return 'In Progress';
    case 'expired':
      return 'Expired';
    case 'timed_out':
      return 'Timed Out';
    default:
      return status ?? 'Unknown';
  }
}
