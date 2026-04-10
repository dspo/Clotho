import { useEffect, useState } from 'react';
import type { PendingRuntimeRequest } from '@dspo/tauri-agent';
import { asRecord, readArray, readBoolean, readString } from './helpers';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The known request kinds supported by the resolver. */
export type RuntimeRequestKind =
  | 'command_execution_request_approval'
  | 'file_change_request_approval'
  | 'permissions_request_approval'
  | 'apply_patch_approval'
  | 'exec_command_approval'
  | 'tool_request_user_input'
  | 'mcp_server_elicitation_request';

/** A resolution value produced by the resolver and passed to onResolve. */
export type RuntimeRequestResolution = unknown;

/** A single question in a tool_request_user_input payload. */
export interface ToolInputQuestion {
  id: string;
  header: string;
  question: string;
  isOther: boolean;
  isSecret: boolean;
  options: { label: string; description?: string }[];
}

/** A single field in an mcp_server_elicitation_request schema. */
export interface ElicitationField {
  key: string;
  title: string;
  description: string | null;
  kind: 'string' | 'number' | 'integer' | 'boolean' | 'single_enum' | 'multi_enum';
  options: { value: string; label: string }[];
  defaultValue: unknown;
  required: boolean;
}

/** Props for the {@link RuntimeRequestResolver} component. */
export interface RuntimeRequestResolverProps {
  /** The pending runtime request to render a form for. */
  request: PendingRuntimeRequest;
  /** Called when the user submits a resolution. */
  onResolve: (response: RuntimeRequestResolution) => Promise<void>;
  /** Optional CSS class name for the root element. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Known request kinds set
// ---------------------------------------------------------------------------

const KNOWN_KINDS: ReadonlySet<string> = new Set<RuntimeRequestKind>([
  'command_execution_request_approval',
  'file_change_request_approval',
  'permissions_request_approval',
  'apply_patch_approval',
  'exec_command_approval',
  'tool_request_user_input',
  'mcp_server_elicitation_request',
]);

// ---------------------------------------------------------------------------
// Helper functions (exported for hosts that want custom rendering)
// ---------------------------------------------------------------------------

/**
 * Parse the questions array from a tool_request_user_input payload.
 */
export function normalizeToolQuestions(
  payload: Record<string, unknown> | null,
): ToolInputQuestion[] {
  return (readArray(payload, 'questions') ?? [])
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((question) => ({
      id: readString(question, 'id') ?? `question-${Math.random().toString(36).slice(2, 8)}`,
      header: readString(question, 'header') ?? 'Question',
      question: readString(question, 'question') ?? '',
      isOther: readBoolean(question, 'isOther') ?? false,
      isSecret: readBoolean(question, 'isSecret') ?? false,
      options: (readArray(question, 'options') ?? [])
        .map((option) => asRecord(option))
        .filter((option): option is Record<string, unknown> => Boolean(option))
        .map((option) => ({
          label: readString(option, 'label') ?? 'Option',
          description: readString(option, 'description') ?? undefined,
        })),
    }));
}

/**
 * Parse schema fields from an mcp_server_elicitation_request payload.
 */
export function normalizeElicitationFields(
  payload: Record<string, unknown> | null,
): ElicitationField[] {
  const schema = asRecord(payload?.requestedSchema);
  const properties = asRecord(schema?.properties);
  if (!properties) {
    return [];
  }

  const required = new Set(
    (readArray(schema, 'required') ?? []).filter(
      (item): item is string => typeof item === 'string',
    ),
  );

  return Object.entries(properties).flatMap<ElicitationField>(([key, rawField]) => {
    const field = asRecord(rawField);
    if (!field) {
      return [];
    }

    const title = readString(field, 'title') ?? key;
    const description = readString(field, 'description');
    const type = readString(field, 'type');

    const enumValues = (readArray(field, 'enum') ?? []).filter(
      (item): item is string => typeof item === 'string',
    );
    const oneOfValues = (readArray(field, 'oneOf') ?? readArray(field, 'anyOf') ?? [])
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => ({
        value: readString(item, 'const') ?? '',
        label: readString(item, 'title') ?? readString(item, 'const') ?? '',
      }))
      .filter((item) => item.value.length > 0);

    if (type === 'array') {
      const items = asRecord(field.items);
      const itemOptions = (readArray(items, 'enum') ?? [])
        .filter((item): item is string => typeof item === 'string')
        .map((value) => ({ value, label: value }));
      const titledItemOptions = (readArray(items, 'anyOf') ?? readArray(items, 'oneOf') ?? [])
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item))
        .map((item) => ({
          value: readString(item, 'const') ?? '',
          label: readString(item, 'title') ?? readString(item, 'const') ?? '',
        }))
        .filter((item) => item.value.length > 0);

      return [
        {
          key,
          title,
          description,
          kind: 'multi_enum' as const,
          options: titledItemOptions.length > 0 ? titledItemOptions : itemOptions,
          defaultValue: Array.isArray(field.default) ? field.default : [],
          required: required.has(key),
        },
      ];
    }

    if (enumValues.length > 0 || oneOfValues.length > 0) {
      return [
        {
          key,
          title,
          description,
          kind: 'single_enum' as const,
          options:
            oneOfValues.length > 0
              ? oneOfValues
              : enumValues.map((value) => ({ value, label: value })),
          defaultValue: field.default ?? '',
          required: required.has(key),
        },
      ];
    }

    if (type === 'boolean') {
      return [
        { key, title, description, kind: 'boolean' as const, options: [], defaultValue: field.default ?? false, required: required.has(key) },
      ];
    }

    if (type === 'number' || type === 'integer') {
      return [
        { key, title, description, kind: type as 'number' | 'integer', options: [], defaultValue: field.default ?? '', required: required.has(key) },
      ];
    }

    return [
      { key, title, description, kind: 'string' as const, options: [], defaultValue: field.default ?? '', required: required.has(key) },
    ];
  });
}

/**
 * Build an automatic decline/empty response for a pending request.
 * Returns null if the request kind is unknown and cannot be auto-resolved.
 *
 * This mirrors the Rust-side `AutoResolutionPolicy::DeclineAll` behaviour.
 */
export function buildAutoResponse(
  request: PendingRuntimeRequest,
): RuntimeRequestResolution | null {
  const payload = asRecord(request.payload);

  switch (request.requestKind) {
    case 'command_execution_request_approval':
    case 'file_change_request_approval':
      return { decision: 'decline' };
    case 'permissions_request_approval':
      return { permissions: {}, scope: 'turn' };
    case 'apply_patch_approval':
    case 'exec_command_approval':
      return { decision: 'Denied' };
    case 'tool_request_user_input':
      return { answers: {} };
    case 'mcp_server_elicitation_request':
      return { action: 'decline', content: null, _meta: payload?._meta ?? null };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Sub-forms (plain HTML, data-* attributes for styling)
// ---------------------------------------------------------------------------

/** Human-readable labels for protocol decision values. */
const DECISION_LABELS: Record<string, string> = {
  accept: 'Accept',
  acceptForSession: 'Accept (session)',
  decline: 'Decline',
  cancel: 'Cancel',
  Approved: 'Accept',
  ApprovedForSession: 'Accept (session)',
  Denied: 'Decline',
  Abort: 'Abort',
};

function DecisionButtons({
  decisions,
  submitting,
  onSubmit,
}: {
  decisions: string[];
  submitting: boolean;
  onSubmit: (response: unknown) => void;
}) {
  return (
    <div data-part="actions">
      {decisions.map((decision) => (
        <button
          key={decision}
          type="button"
          data-decision={decision}
          disabled={submitting}
          onClick={() => onSubmit({ decision })}
        >
          {DECISION_LABELS[decision] ?? decision}
        </button>
      ))}
    </div>
  );
}

function PermissionsForm({
  payload,
  submitting,
  onSubmit,
}: {
  payload: Record<string, unknown> | null;
  submitting: boolean;
  onSubmit: (response: unknown) => void;
}) {
  return (
    <div data-part="actions">
      <button
        type="button"
        data-decision="accept-turn"
        disabled={submitting}
        onClick={() =>
          onSubmit({ permissions: payload?.permissions ?? {}, scope: 'turn' })
        }
      >
        Accept (this turn)
      </button>
      <button
        type="button"
        data-decision="accept-session"
        disabled={submitting}
        onClick={() =>
          onSubmit({ permissions: payload?.permissions ?? {}, scope: 'session' })
        }
      >
        Accept (session)
      </button>
      <button
        type="button"
        data-decision="decline"
        disabled={submitting}
        onClick={() => onSubmit({ permissions: {}, scope: 'turn' })}
      >
        Decline
      </button>
    </div>
  );
}

function ToolInputForm({
  questions,
  submitting,
  onSubmit,
}: {
  questions: ToolInputQuestion[];
  submitting: boolean;
  onSubmit: (response: unknown) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, ''])),
  );

  // Reset answers when questions change
  useEffect(() => {
    setAnswers(Object.fromEntries(questions.map((q) => [q.id, ''])));
  }, [questions.map((q) => q.id).join(',')]);

  return (
    <div data-part="tool-input-form">
      {questions.map((question) => (
        <div key={question.id} data-part="question-group" data-question-id={question.id}>
          <div data-part="question-header">{question.header}</div>
          <div data-part="question-text">{question.question}</div>

          {question.options.length > 0 && (
            <div data-part="question-options">
              {question.options.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  data-part="option-button"
                  data-selected={answers[question.id] === option.label ? 'true' : undefined}
                  onClick={() =>
                    setAnswers((prev) => ({ ...prev, [question.id]: option.label }))
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          <input
            type={question.isSecret ? 'password' : 'text'}
            data-part="question-input"
            value={answers[question.id] ?? ''}
            placeholder={question.isOther ? 'Other answer' : 'Enter answer'}
            onChange={(e) =>
              setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))
            }
          />
        </div>
      ))}

      <div data-part="actions">
        <button
          type="button"
          data-decision="submit"
          disabled={submitting}
          onClick={() =>
            onSubmit({
              answers: Object.fromEntries(
                questions.map((q) => [
                  q.id,
                  {
                    answers: answers[q.id]?.trim() ? [answers[q.id].trim()] : [],
                  },
                ]),
              ),
            })
          }
        >
          Submit
        </button>
      </div>
    </div>
  );
}

function ElicitationForm({
  payload,
  fields,
  submitting,
  onSubmit,
}: {
  payload: Record<string, unknown> | null;
  fields: ElicitationField[];
  submitting: boolean;
  onSubmit: (response: unknown) => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.defaultValue])),
  );
  const [freeformText, setFreeformText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setValues(Object.fromEntries(fields.map((f) => [f.key, f.defaultValue])));
    setFreeformText('');
    setParseError(null);
    setValidationError(null);
  }, [fields.map((f) => f.key).join(',')]);

  const message = readString(payload, 'message');

  function submitAccept() {
    setParseError(null);
    setValidationError(null);

    // Validate required fields
    if (fields.length > 0) {
      const missing = fields.filter((f) => {
        if (!f.required) return false;
        const v = values[f.key];
        if (v === undefined || v === null || v === '') return true;
        if (Array.isArray(v) && v.length === 0) return true;
        return false;
      });
      if (missing.length > 0) {
        setValidationError(`Required fields missing: ${missing.map((f) => f.title).join(', ')}`);
        return;
      }
    }

    let content: unknown;
    if (fields.length > 0) {
      content = values;
    } else if (freeformText.trim()) {
      try {
        content = JSON.parse(freeformText);
      } catch (error) {
        setParseError(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
    } else {
      content = null;
    }
    onSubmit({ action: 'accept', content, _meta: payload?._meta ?? null });
  }

  return (
    <div data-part="elicitation-form">
      {message && <div data-part="elicitation-message">{message}</div>}

      {fields.length > 0 ? (
        <div data-part="elicitation-fields">
          {fields.map((field) => (
            <div key={field.key} data-part="field-group" data-field-key={field.key}>
              <label data-part="field-label">
                {field.title}
                {field.required && <span data-part="field-required">*</span>}
              </label>
              {field.description && (
                <div data-part="field-description">{field.description}</div>
              )}

              {field.kind === 'boolean' && (
                <label data-part="field-checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(values[field.key])}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.key]: e.target.checked }))
                    }
                  />
                  {field.title}
                </label>
              )}

              {field.kind === 'single_enum' && (
                <select
                  data-part="field-select"
                  value={String(values[field.key] ?? '')}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                >
                  <option value="">-- Select --</option>
                  {field.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}

              {field.kind === 'multi_enum' && (
                <div data-part="field-multi-enum">
                  {field.options.map((opt) => {
                    const selectedValues = Array.isArray(values[field.key])
                      ? (values[field.key] as string[])
                      : [];
                    const selected = selectedValues.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        data-part="enum-option"
                        data-selected={selected ? 'true' : undefined}
                        onClick={() =>
                          setValues((prev) => {
                            const current = Array.isArray(prev[field.key])
                              ? (prev[field.key] as string[])
                              : [];
                            return {
                              ...prev,
                              [field.key]: selected
                                ? current.filter((v) => v !== opt.value)
                                : [...current, opt.value],
                            };
                          })
                        }
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {(field.kind === 'string' ||
                field.kind === 'number' ||
                field.kind === 'integer') && (
                <input
                  type={field.kind === 'string' ? 'text' : 'number'}
                  data-part="field-input"
                  value={String(values[field.key] ?? '')}
                  onChange={(e) =>
                    setValues((prev) => ({
                      ...prev,
                      [field.key]:
                        field.kind === 'string'
                          ? e.target.value
                          : e.target.value === ''
                            ? ''
                            : Number(e.target.value),
                    }))
                  }
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <textarea
          data-part="freeform-input"
          data-error={parseError ? 'true' : undefined}
          value={freeformText}
          onChange={(e) => {
            setFreeformText(e.target.value);
            setParseError(null);
          }}
          placeholder="Enter JSON response body (leave empty if not needed)"
        />
      )}

      {(parseError || validationError) && (
        <div data-part="error-message">{parseError ?? validationError}</div>
      )}

      <div data-part="actions">
        <button
          type="button"
          data-decision="accept"
          disabled={submitting}
          onClick={submitAccept}
        >
          Accept
        </button>
        <button
          type="button"
          data-decision="decline"
          disabled={submitting}
          onClick={() =>
            onSubmit({ action: 'decline', content: null, _meta: payload?._meta ?? null })
          }
        >
          Decline
        </button>
        <button
          type="button"
          data-decision="cancel"
          disabled={submitting}
          onClick={() =>
            onSubmit({ action: 'cancel', content: null, _meta: payload?._meta ?? null })
          }
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function FreeformFallback({
  submitting,
  onSubmit,
}: {
  submitting: boolean;
  onSubmit: (response: unknown) => void;
}) {
  const [text, setText] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  return (
    <div data-part="freeform-fallback">
      <textarea
        data-part="freeform-input"
        data-error={parseError ? 'true' : undefined}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setParseError(null);
        }}
        placeholder="Enter JSON response body"
      />
      {parseError && <div data-part="error-message">{parseError}</div>}
      <div data-part="actions">
        <button
          type="button"
          data-decision="submit"
          disabled={submitting || !text.trim()}
          onClick={() => {
            try {
              onSubmit(JSON.parse(text));
            } catch (error) {
              setParseError(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
            }
          }}
        >
          Submit
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Renders the appropriate form for a pending runtime request.
 *
 * Uses plain HTML elements with `data-*` attributes for styling hooks.
 * No CSS framework is required — host apps provide their own styles
 * targeting the data attributes.
 *
 * @example
 * ```tsx
 * <RuntimeRequestResolver
 *   request={pendingRequest}
 *   onResolve={async (response) => {
 *     await client.submitRuntimeRequest({
 *       threadId, turnId,
 *       requestId: pendingRequest.requestId,
 *       response,
 *     });
 *   }}
 * />
 * ```
 */
export function RuntimeRequestResolver({
  request,
  onResolve,
  className,
}: RuntimeRequestResolverProps) {
  const payload = asRecord(request.payload);
  const kind = request.requestKind;
  const [submitting, setSubmitting] = useState(false);

  async function submit(response: unknown) {
    setSubmitting(true);
    try {
      await onResolve(response);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      data-request-kind={kind}
      data-request-id={request.requestId}
      data-state={submitting ? 'submitting' : 'idle'}
      className={className}
    >
      <div data-part="header">
        <div data-part="title">{request.title ?? 'Runtime Request'}</div>
        <div data-part="kind">{kind}</div>
      </div>

      {(request.summary) && (
        <div data-part="summary">{request.summary}</div>
      )}

      {/* command_execution / file_change approval */}
      {(kind === 'command_execution_request_approval' ||
        kind === 'file_change_request_approval') && (
        <DecisionButtons
          decisions={['accept', 'acceptForSession', 'decline', 'cancel']}
          submitting={submitting}
          onSubmit={submit}
        />
      )}

      {/* permissions approval */}
      {kind === 'permissions_request_approval' && (
        <PermissionsForm
          payload={payload}
          submitting={submitting}
          onSubmit={submit}
        />
      )}

      {/* apply_patch / exec_command approval */}
      {(kind === 'apply_patch_approval' || kind === 'exec_command_approval') && (
        <DecisionButtons
          decisions={['Approved', 'ApprovedForSession', 'Denied', 'Abort']}
          submitting={submitting}
          onSubmit={submit}
        />
      )}

      {/* tool_request_user_input */}
      {kind === 'tool_request_user_input' && (
        <ToolInputForm
          questions={normalizeToolQuestions(payload)}
          submitting={submitting}
          onSubmit={submit}
        />
      )}

      {/* mcp_server_elicitation_request */}
      {kind === 'mcp_server_elicitation_request' && (
        <ElicitationForm
          payload={payload}
          fields={normalizeElicitationFields(payload)}
          submitting={submitting}
          onSubmit={submit}
        />
      )}

      {/* Unknown kind fallback */}
      {!KNOWN_KINDS.has(kind) && (
        <FreeformFallback submitting={submitting} onSubmit={submit} />
      )}

      <details data-part="payload-details">
        <summary>Payload</summary>
        <pre>{JSON.stringify(request.payload, null, 2)}</pre>
      </details>
    </div>
  );
}
