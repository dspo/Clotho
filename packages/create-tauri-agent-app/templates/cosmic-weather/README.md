# Cosmic Weather template

This template is the richer, end-to-end scaffold for `create-tauri-agent-app`.

It demonstrates the framework pattern the runtime is meant to teach:

1. The host provides a **prompt** (`src/agent.ts`).
2. The host provides a **tool** (`cosmic.resolve_zodiac_sign` in `src-tauri/src/lib.rs`).
3. The host provides an explicit **ConfigProvider** (a `TomlConfigProvider` pointing at `./.codex/config.toml`).
4. The framework provides the rest: thread / turn lifecycle, streaming, provider config resolution, and the Tauri command bridge.

## Run

```bash
pnpm install
cp .env.example .env
export OPENAI_API_KEY=...
pnpm tauri dev
```

If you want to use an OpenAI-compatible endpoint instead of the default OpenAI profile:

```bash
export COMPAT_API_KEY=...
pnpm tauri dev
```

Then switch the profile selector in the demo UI from `default` to `compat`.

## Where the provider config lives

- Template config file: `./.codex/config.toml`
- Template provider wiring: `./src-tauri/src/lib.rs`

The generated app intentionally uses an explicit `ConfigProvider` so the host is self-contained.

If you remove that provider wiring and call `tauri_plugin_agent_runtime::init()` directly, the framework falls back to `DefaultConfigProvider`, which reads `~/.codex/config.toml`.
