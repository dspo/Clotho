import { useEffect, useMemo, useState } from 'react';

import type { ConfigSelection, ConversationBlock, ResolvedConfig } from '@dspo/tauri-agent';
import { defaultTauriAgentClient } from '@dspo/tauri-agent';

import {
  COSMIC_TOOL_ID,
  DEMO_CONFIG_ID,
  cosmicWeatherAgent,
  quickPrompts,
} from './agent';

type DemoProfile = 'default' | 'compat';

type CosmicCard =
  | {
      kind: 'request-birthday';
      title: string;
      prompt: string;
      checklist?: string[];
    }
  | {
      kind: 'forecast';
      title: string;
      sign: string;
      summary: string;
      focus?: string;
      energy?: string;
      luckyColor?: string;
      luckyNumber?: string;
      moodWindow?: string;
      note?: string;
    };

const client = defaultTauriAgentClient;

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error';
}

function makeConfigContext(profile: DemoProfile): ConfigSelection {
  return {
    configId: DEMO_CONFIG_ID,
    profile: profile === 'default' ? null : profile,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.filter((item): item is string => typeof item === 'string');
  return items.length > 0 ? items : undefined;
}

function extractCosmicCard(text: string): CosmicCard | null {
  const match = text.match(/```cosmic-card\s*([\s\S]*?)```/i);
  if (!match) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[1]);
    if (!isRecord(parsed)) {
      return null;
    }

    if (parsed.kind === 'request-birthday') {
      const title = readString(parsed, 'title');
      const prompt = readString(parsed, 'prompt');
      if (!title || !prompt) {
        return null;
      }

      return {
        kind: 'request-birthday',
        title,
        prompt,
        checklist: readStringArray(parsed, 'checklist'),
      };
    }

    if (parsed.kind === 'forecast') {
      const title = readString(parsed, 'title');
      const sign = readString(parsed, 'sign');
      const summary = readString(parsed, 'summary');
      if (!title || !sign || !summary) {
        return null;
      }

      return {
        kind: 'forecast',
        title,
        sign,
        summary,
        focus: readString(parsed, 'focus') ?? undefined,
        energy: readString(parsed, 'energy') ?? undefined,
        luckyColor: readString(parsed, 'luckyColor') ?? undefined,
        luckyNumber: readString(parsed, 'luckyNumber') ?? undefined,
        moodWindow: readString(parsed, 'moodWindow') ?? undefined,
        note: readString(parsed, 'note') ?? undefined,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function stripCosmicCard(text: string): string {
  return text.replace(/```cosmic-card\s*[\s\S]*?```/gi, '').trim();
}

function statusLabel(status: string): string {
  switch (status) {
    case 'connected':
      return 'Runtime connected';
    case 'disconnected':
      return 'Runtime disconnected';
    case 'idle':
      return 'Ready';
    default:
      return status;
  }
}

function composeTurnPrompt(input: string): string {
  return `${cosmicWeatherAgent.instructions ?? ''}\n\nUser request:\n${input.trim()}\n\nRemember: the only host tool you can call is ${COSMIC_TOOL_ID}.`;
}

function blockTitle(block: ConversationBlock): string {
  if (block.kind === 'user_message') {
    return 'You';
  }

  if (block.kind === 'assistant_message') {
    return 'Cosmic Weather';
  }

  return block.kind.split('_').join(' ');
}

function ForecastCard({ card }: { card: CosmicCard }) {
  if (card.kind === 'request-birthday') {
    return (
      <section className="forecast-card forecast-card--request">
        <p className="eyebrow">Need one detail first</p>
        <h2>{card.title}</h2>
        <p>{card.prompt}</p>
        {card.checklist ? (
          <ul className="checklist">
            {card.checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  }

  return (
    <section className="forecast-card">
      <p className="eyebrow">{card.sign}</p>
      <h2>{card.title}</h2>
      <p className="forecast-summary">{card.summary}</p>
      <dl className="forecast-grid">
        {card.focus ? (
          <>
            <dt>Focus</dt>
            <dd>{card.focus}</dd>
          </>
        ) : null}
        {card.energy ? (
          <>
            <dt>Energy</dt>
            <dd>{card.energy}</dd>
          </>
        ) : null}
        {card.luckyColor ? (
          <>
            <dt>Lucky color</dt>
            <dd>{card.luckyColor}</dd>
          </>
        ) : null}
        {card.luckyNumber ? (
          <>
            <dt>Lucky number</dt>
            <dd>{card.luckyNumber}</dd>
          </>
        ) : null}
        {card.moodWindow ? (
          <>
            <dt>Mood window</dt>
            <dd>{card.moodWindow}</dd>
          </>
        ) : null}
      </dl>
      {card.note ? <p className="forecast-note">{card.note}</p> : null}
    </section>
  );
}

export default function App() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [profile, setProfile] = useState<DemoProfile>('default');
  const [input, setInput] = useState<string>(quickPrompts[0]);
  const [blocks, setBlocks] = useState<ConversationBlock[]>([]);
  const [config, setConfig] = useState<ResolvedConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [status, setStatus] = useState('idle');
  const [submitting, setSubmitting] = useState(false);

  const configContext = useMemo(() => makeConfigContext(profile), [profile]);

  const latestAssistantBlock = useMemo(
    () =>
      [...blocks]
        .reverse()
        .find((block) => block.kind === 'assistant_message' || block.kind === 'assistant'),
    [blocks],
  );
  const latestCard = useMemo(
    () => (latestAssistantBlock ? extractCosmicCard(latestAssistantBlock.text) : null),
    [latestAssistantBlock],
  );
  const latestNarrative = useMemo(
    () => (latestAssistantBlock ? stripCosmicCard(latestAssistantBlock.text) : ''),
    [latestAssistantBlock],
  );

  async function refreshConfig(selection: ConfigSelection) {
    try {
      const resolved = await client.resolveConfig(selection);
      setConfig(resolved);
      setConfigError(null);
    } catch (error) {
      setConfig(null);
      setConfigError(formatError(error));
    }
  }

  async function refreshThread(currentThreadId: string) {
    const snapshot = await client.getThreadSnapshot(currentThreadId);
    setBlocks(snapshot.blocks);
  }

  async function ensureThread(): Promise<string> {
    if (threadId) {
      return threadId;
    }

    const created = await client.createThread({
      title: 'Cosmic Weather',
      configContext,
    });
    setThreadId(created.threadId);
    return created.threadId;
  }

  useEffect(() => {
    setThreadId(null);
    setBlocks([]);
    setSubmitError(null);
    void refreshConfig(configContext);
  }, [configContext]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    void client.onStatus((event) => {
      if (isRecord(event.payload) && typeof event.payload.state === 'string') {
        setStatus(event.payload.state);
        return;
      }

      setStatus(event.type);
    }).then((unlisten) => {
      cleanup = unlisten;
    });

    return () => {
      cleanup?.();
    };
  }, []);

  async function handleSubmit(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!input.trim()) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const currentThreadId = await ensureThread();
      await client.startTurn(
        {
          threadId: currentThreadId,
          text: composeTurnPrompt(input),
          mode: 'access',
          configContext,
        },
        () => {
          void refreshThread(currentThreadId);
        },
      );

      setInput('');
      await refreshThread(currentThreadId);
    } catch (error) {
      setSubmitError(formatError(error));
    } finally {
      setSubmitting(false);
    }
  }

  function handlePromptClick(prompt: string) {
    setInput(prompt);
  }

  function resetConversation() {
    setThreadId(null);
    setBlocks([]);
    setSubmitError(null);
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Reusable Tauri Agent Runtime demo</p>
          <h1>Cosmic Weather</h1>
          <p className="hero-copy">
            A one-page Tauri app showing the framework pattern: host prompt +
            host tool + explicit ConfigProvider, with the rest handled by the
            agent runtime.
          </p>
        </div>
        <div className="status-pill">{statusLabel(status)}</div>
      </section>

      <section className="panel panel--split">
        <div className="provider-card">
          <div className="provider-card__header">
            <div>
              <p className="eyebrow">Provider setup</p>
              <h2>Active config context</h2>
            </div>
            <label className="profile-picker">
              <span>Profile</span>
              <select
                value={profile}
                onChange={(event) => setProfile(event.target.value as DemoProfile)}
              >
                <option value="default">default</option>
                <option value="compat">compat</option>
              </select>
            </label>
          </div>

          {config ? (
            <dl className="provider-grid">
              <div>
                <dt>Provider</dt>
                <dd>{config.provider}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{config.model || 'unset'}</dd>
              </div>
              <div>
                <dt>Config source</dt>
                <dd>{config.label}</dd>
              </div>
              <div>
                <dt>Config path</dt>
                <dd>{config.configFilePath ?? 'in-memory'}</dd>
              </div>
              <div>
                <dt>Auth env</dt>
                <dd>{config.envKey ?? 'n/a'}</dd>
              </div>
              <div>
                <dt>Wire API</dt>
                <dd>{config.wireApi}</dd>
              </div>
              <div>
                <dt>Base URL</dt>
                <dd>{config.baseUrl ?? 'default provider endpoint'}</dd>
              </div>
              <div>
                <dt>Tool</dt>
                <dd>{COSMIC_TOOL_ID}</dd>
              </div>
            </dl>
          ) : (
            <p className="inline-error">
              {configError ?? 'Unable to resolve the demo ConfigProvider.'}
            </p>
          )}
        </div>

        <div className="prompt-card">
          <p className="eyebrow">Prompt entry</p>
          <h2>Ask for a constellation reading</h2>
          <div className="prompt-actions">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="secondary-button"
                onClick={() => handlePromptClick(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>

          <form
            className="prompt-form"
            onSubmit={handleSubmit}
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Try: 请读取 1998-02-14 的今日宇宙天气"
              rows={6}
            />
            <div className="prompt-form__footer">
              <button
                type="button"
                className="secondary-button"
                onClick={resetConversation}
              >
                New thread
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={submitting}
              >
                {submitting ? 'Sending...' : 'Run agent'}
              </button>
            </div>
          </form>

          {submitError ? <p className="inline-error">{submitError}</p> : null}
        </div>
      </section>

      <section className="panel panel--results">
        <div className="results-column">
          <p className="eyebrow">Card output</p>
          {latestCard ? (
            <ForecastCard card={latestCard} />
          ) : (
            <div className="placeholder-card">
              <h2>Waiting for a reading</h2>
              <p>
                Submit a prompt with a birthday and the latest assistant turn
                will be rendered as a styled card here.
              </p>
            </div>
          )}
          {latestNarrative ? <p className="narrative">{latestNarrative}</p> : null}
        </div>

        <div className="results-column">
          <p className="eyebrow">Transcript</p>
          <div className="transcript">
            {blocks.length === 0 ? (
              <div className="transcript-empty">
                <h3>No turns yet</h3>
                <p>
                  This demo stores a normal runtime thread and renders the same
                  transcript blocks the framework exposes to any host app.
                </p>
              </div>
            ) : (
              blocks.map((block) => (
                <article
                  key={block.blockId}
                  className={`bubble bubble--${block.kind}`}
                >
                  <p className="bubble__title">{blockTitle(block)}</p>
                  <p>{stripCosmicCard(block.text) || block.text}</p>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
