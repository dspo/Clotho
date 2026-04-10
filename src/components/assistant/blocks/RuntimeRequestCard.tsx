import { useEffect, useState } from 'react';
import { Check, Shield, SquareTerminal, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ConversationBlock } from '@/types/assistant-runtime';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  asRecord,
  readArray,
  readBoolean,
  readString,
  type PendingRuntimeRequestView,
} from '@/stores/assistant/helpers';

interface RuntimeRequestCardProps {
  block: ConversationBlock;
  request: PendingRuntimeRequestView | null;
  onResolve: (request: PendingRuntimeRequestView, response: unknown) => Promise<void>;
}

interface ToolInputQuestion {
  id: string;
  header: string;
  question: string;
  isOther: boolean;
  isSecret: boolean;
  options: { label: string; description?: string }[];
}

interface ElicitationField {
  key: string;
  title: string;
  description: string | null;
  kind: 'string' | 'number' | 'integer' | 'boolean' | 'single_enum' | 'multi_enum';
  options: { value: string; label: string }[];
  defaultValue: unknown;
  required: boolean;
}

function JsonDetails({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  if (value == null) {
    return null;
  }

  return (
    <details className="rounded-lg border bg-muted/30">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
        {label}
      </summary>
      <pre className="overflow-x-auto px-3 py-3 text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function normalizeToolQuestions(payload: Record<string, unknown> | null): ToolInputQuestion[] {
  return (readArray(payload, 'questions') ?? [])
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((question) => ({
      id: readString(question, 'id') ?? `question-${Math.random().toString(36).slice(2, 8)}`,
      header: readString(question, 'header') ?? '问题',
      question: readString(question, 'question') ?? '',
      isOther: readBoolean(question, 'isOther') ?? false,
      isSecret: readBoolean(question, 'isSecret') ?? false,
      options: (readArray(question, 'options') ?? [])
        .map((option) => asRecord(option))
        .filter((option): option is Record<string, unknown> => Boolean(option))
        .map((option) => ({
          label: readString(option, 'label') ?? '选项',
          description: readString(option, 'description') ?? undefined,
        })),
    }));
}

function normalizeElicitationFields(payload: Record<string, unknown> | null): ElicitationField[] {
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

      const options = titledItemOptions.length > 0 ? titledItemOptions : itemOptions;
      const result: ElicitationField = {
        key,
        title,
        description,
        kind: 'multi_enum',
        options,
        defaultValue: Array.isArray(field.default) ? field.default : [],
        required: required.has(key),
      };

      return [result];
    }

    if (enumValues.length > 0 || oneOfValues.length > 0) {
      const result: ElicitationField = {
        key,
        title,
        description,
        kind: 'single_enum',
        options:
          oneOfValues.length > 0
            ? oneOfValues
            : enumValues.map((value) => ({ value, label: value })),
        defaultValue: field.default ?? '',
        required: required.has(key),
      };

      return [result];
    }

    if (type === 'boolean') {
      const result: ElicitationField = {
        key,
        title,
        description,
        kind: 'boolean',
        options: [],
        defaultValue: field.default ?? false,
        required: required.has(key),
      };

      return [result];
    }

    if (type === 'number' || type === 'integer') {
      const result: ElicitationField = {
        key,
        title,
        description,
        kind: type,
        options: [],
        defaultValue: field.default ?? '',
        required: required.has(key),
      };

      return [result];
    }

    const result: ElicitationField = {
      key,
      title,
      description,
      kind: 'string',
      options: [],
      defaultValue: field.default ?? '',
      required: required.has(key),
    };

    return [result];
  });
}

function decisionLabel(decision: string) {
  switch (decision) {
    case 'accept':
      return '允许';
    case 'acceptForSession':
      return '本会话允许';
    case 'decline':
      return '拒绝';
    case 'cancel':
      return '中止';
    case 'Approved':
      return '允许补丁';
    case 'ApprovedForSession':
      return '本会话允许';
    case 'Denied':
      return '拒绝';
    case 'Abort':
      return '中止';
    default:
      return decision;
  }
}

export function RuntimeRequestCard({
  block,
  request,
  onResolve,
}: RuntimeRequestCardProps) {
  const payload = asRecord(request?.payload ?? block.metadata);
  const requestKind = request?.requestKind ?? readString(payload, 'requestKind') ?? 'runtime_request';
  const [submitting, setSubmitting] = useState(false);
  const [toolAnswers, setToolAnswers] = useState<Record<string, string>>({});
  const [elicitationValues, setElicitationValues] = useState<Record<string, unknown>>({});
  const [freeformValue, setFreeformValue] = useState('');
  const questions = normalizeToolQuestions(payload);
  const elicitationFields = normalizeElicitationFields(payload);

  useEffect(() => {
    const nextQuestions = normalizeToolQuestions(payload);
    const nextFields = normalizeElicitationFields(payload);
    const nextToolAnswers = Object.fromEntries(
      nextQuestions.map((question) => [question.id, '']),
    );
    setToolAnswers(nextToolAnswers);

    const nextElicitationValues = Object.fromEntries(
      nextFields.map((field) => [field.key, field.defaultValue]),
    );
    setElicitationValues(nextElicitationValues);

    setFreeformValue('');
  }, [request?.requestId, block.blockId]);

  async function submit(response: unknown) {
    if (!request) {
      return;
    }
    setSubmitting(true);
    try {
      await onResolve(request, response);
    } finally {
      setSubmitting(false);
    }
  }

  function tryParseJson(value: string) {
    try {
      return JSON.parse(value);
    } catch {
      toast.error('JSON 格式无效');
      return undefined;
    }
  }

  const resolvedResolution = asRecord(asRecord(block.metadata)?.resolution);

  if (!request || block.status !== 'pending') {
    return (
      <div className="space-y-3 rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{block.title ?? 'Runtime Request'}</div>
            <div className="text-xs text-muted-foreground">
              {block.status === 'expired' ? '请求已过期' : '请求已处理'}
            </div>
          </div>
          <Badge variant="outline">{block.status ?? 'completed'}</Badge>
        </div>

        {block.text && (
          <p className="text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
            {block.text}
          </p>
        )}

        <JsonDetails label="Resolution" value={resolvedResolution ?? asRecord(block.metadata)} />
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <SquareTerminal className="h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{request.title ?? block.title ?? 'Runtime Request'}</div>
          <div className="text-xs text-muted-foreground">{request.requestKind}</div>
        </div>
        <Badge variant="secondary">待处理</Badge>
      </div>

      {(request.summary || block.text) && (
        <p className="text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
          {request.summary ?? block.text}
        </p>
      )}

      {(requestKind === 'command_execution_request_approval' ||
        requestKind === 'file_change_request_approval') && (
        <div className="flex flex-wrap gap-2">
          {(requestKind === 'command_execution_request_approval'
            ? ['accept', 'acceptForSession', 'decline', 'cancel']
            : ['accept', 'acceptForSession', 'decline', 'cancel']
          ).map((decision) => (
            <Button
              key={decision}
              size="sm"
              variant={decision.includes('decline') || decision.includes('cancel') ? 'outline' : 'default'}
              disabled={submitting}
              onClick={() => void submit({ decision })}
            >
              {decisionLabel(decision)}
            </Button>
          ))}
        </div>
      )}

      {requestKind === 'permissions_request_approval' && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={submitting}
            onClick={() =>
              void submit({
                permissions: payload?.permissions ?? {},
                scope: 'turn',
              })
            }
          >
            <Check className="h-4 w-4" />
            本次允许
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={submitting}
            onClick={() =>
              void submit({
                permissions: payload?.permissions ?? {},
                scope: 'session',
              })
            }
          >
            本会话允许
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={submitting}
            onClick={() =>
              void submit({
                permissions: {},
                scope: 'turn',
              })
            }
          >
            <X className="h-4 w-4" />
            拒绝
          </Button>
        </div>
      )}

      {(requestKind === 'apply_patch_approval' || requestKind === 'exec_command_approval') && (
        <div className="flex flex-wrap gap-2">
          {['Approved', 'ApprovedForSession', 'Denied', 'Abort'].map((decision) => (
            <Button
              key={decision}
              size="sm"
              variant={decision.includes('Denied') || decision.includes('Abort') ? 'outline' : 'default'}
              disabled={submitting}
              onClick={() => void submit({ decision })}
            >
              {decisionLabel(decision)}
            </Button>
          ))}
        </div>
      )}

      {requestKind === 'tool_request_user_input' && (
        <div className="space-y-3">
          {questions.map((question) => (
            <div key={question.id} className="space-y-2 rounded-xl border bg-muted/20 p-3">
              <div>
                <div className="text-sm font-medium">{question.header}</div>
                <div className="text-xs text-muted-foreground">{question.question}</div>
              </div>

              {question.options.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {question.options.map((option) => (
                    <Button
                      key={option.label}
                      size="sm"
                      variant={
                        toolAnswers[question.id] === option.label ? 'default' : 'outline'
                      }
                      onClick={() =>
                        setToolAnswers((state) => ({
                          ...state,
                          [question.id]: option.label,
                        }))
                      }
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              )}

              <Input
                type={question.isSecret ? 'password' : 'text'}
                value={toolAnswers[question.id] ?? ''}
                onChange={(event) =>
                  setToolAnswers((state) => ({
                    ...state,
                    [question.id]: event.target.value,
                  }))
                }
                placeholder={question.isOther ? '补充你的答案' : '输入答案'}
              />
            </div>
          ))}

          <Button
            size="sm"
            disabled={submitting}
            onClick={() =>
              void submit({
                answers: Object.fromEntries(
                  questions.map((question) => [
                    question.id,
                    {
                      answers: toolAnswers[question.id]?.trim()
                        ? [toolAnswers[question.id].trim()]
                        : [],
                    },
                  ]),
                ),
              })
            }
          >
            提交回答
          </Button>
        </div>
      )}

      {requestKind === 'mcp_server_elicitation_request' && (
        <div className="space-y-3">
          <div className="rounded-xl border bg-muted/20 p-3 text-sm leading-6 text-muted-foreground">
            {readString(payload, 'message') ?? 'MCP server requests more information.'}
          </div>

          {elicitationFields.length > 0 && (
            <div className="space-y-3">
              {elicitationFields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <label className="text-sm font-medium">
                    {field.title}
                    {field.required && <span className="ml-1 text-destructive">*</span>}
                  </label>
                  {field.description && (
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                  )}

                  {field.kind === 'boolean' && (
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(elicitationValues[field.key])}
                        onChange={(event) =>
                          setElicitationValues((state) => ({
                            ...state,
                            [field.key]: event.target.checked,
                          }))
                        }
                      />
                      {field.title}
                    </label>
                  )}

                  {field.kind === 'single_enum' && (
                    <div className="flex flex-wrap gap-2">
                      {field.options.map((option) => (
                        <Button
                          key={option.value}
                          size="sm"
                          variant={
                            elicitationValues[field.key] === option.value ? 'default' : 'outline'
                          }
                          onClick={() =>
                            setElicitationValues((state) => ({
                              ...state,
                              [field.key]: option.value,
                            }))
                          }
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  )}

                  {field.kind === 'multi_enum' && (
                    <div className="flex flex-wrap gap-2">
                      {field.options.map((option) => {
                        const selectedValues = Array.isArray(elicitationValues[field.key])
                          ? (elicitationValues[field.key] as string[])
                          : [];
                        const selected = selectedValues.includes(option.value);
                        return (
                          <Button
                            key={option.value}
                            size="sm"
                            variant={selected ? 'default' : 'outline'}
                            onClick={() =>
                              setElicitationValues((state) => {
                                const current = Array.isArray(state[field.key])
                                  ? (state[field.key] as string[])
                                  : [];
                                return {
                                  ...state,
                                  [field.key]: selected
                                    ? current.filter((value) => value !== option.value)
                                    : [...current, option.value],
                                };
                              })
                            }
                          >
                            {option.label}
                          </Button>
                        );
                      })}
                    </div>
                  )}

                  {(field.kind === 'string' ||
                    field.kind === 'number' ||
                    field.kind === 'integer') && (
                    <Input
                      type={field.kind === 'string' ? 'text' : 'number'}
                      value={String(elicitationValues[field.key] ?? '')}
                      onChange={(event) =>
                        setElicitationValues((state) => ({
                          ...state,
                          [field.key]:
                            field.kind === 'string'
                              ? event.target.value
                              : event.target.value === ''
                                ? ''
                                : Number(event.target.value),
                        }))
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {elicitationFields.length === 0 && (
            <Textarea
              value={freeformValue}
              onChange={(event) => setFreeformValue(event.target.value)}
              placeholder="输入 JSON 响应体；不需要时可以留空。"
              className="min-h-28 font-mono text-xs"
            />
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={submitting}
              onClick={() => {
                const content =
                  elicitationFields.length > 0
                    ? elicitationValues
                    : freeformValue.trim()
                      ? tryParseJson(freeformValue)
                      : null;
                if (content === undefined) {
                  return;
                }
                void submit({
                  action: 'accept',
                  content,
                  _meta: payload?._meta ?? null,
                });
              }}
            >
              允许并提交
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={submitting}
              onClick={() => void submit({ action: 'decline', content: null, _meta: payload?._meta ?? null })}
            >
              拒绝
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={submitting}
              onClick={() => void submit({ action: 'cancel', content: null, _meta: payload?._meta ?? null })}
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {![
        'command_execution_request_approval',
        'file_change_request_approval',
        'permissions_request_approval',
        'apply_patch_approval',
        'exec_command_approval',
        'tool_request_user_input',
        'mcp_server_elicitation_request',
      ].includes(requestKind) && (
        <div className="space-y-3">
          <Textarea
            value={freeformValue}
            onChange={(event) => setFreeformValue(event.target.value)}
            placeholder="输入提交给 runtime request 的 JSON 响应体。"
            className={cn('min-h-28 font-mono text-xs')}
          />
          <Button
            size="sm"
            disabled={submitting || !freeformValue.trim()}
            onClick={() => {
              const parsed = tryParseJson(freeformValue);
              if (parsed === undefined) {
                return;
              }
              void submit(parsed);
            }}
          >
            提交响应
          </Button>
        </div>
      )}

      <JsonDetails label="Payload" value={request.payload} />
    </div>
  );
}
