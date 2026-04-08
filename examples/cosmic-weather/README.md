# Cosmic Weather

`Cosmic Weather` is the first end-to-end demo host for `tauri-plugin-agent-runtime`.

It demonstrates the framework pattern the PR is trying to teach:

1. The host provides a **prompt** (`src/agent.ts`).
2. The host provides a **tool** (`cosmic.resolve_zodiac_sign` in `src-tauri/src/lib.rs`).
3. The host provides an explicit **ConfigProvider** (a `TomlConfigProvider` pointing at `examples/cosmic-weather/.codex/config.toml`).
4. The framework provides the rest: thread / turn lifecycle, streaming, provider config resolution, and Tauri command bridge.

## Run

```bash
pnpm install
cp examples/cosmic-weather/.env.example examples/cosmic-weather/.env
export OPENAI_API_KEY=...
pnpm --dir examples/cosmic-weather tauri dev
```

If you want to use an OpenAI-compatible endpoint instead of the default OpenAI profile:

```bash
export COMPAT_API_KEY=...
pnpm --dir examples/cosmic-weather tauri dev
```

Then switch the profile selector in the demo UI from `default` to `compat`.

## Where the provider config lives

- Demo config file: `examples/cosmic-weather/.codex/config.toml`
- Demo provider wiring: `examples/cosmic-weather/src-tauri/src/lib.rs`

The demo intentionally uses an explicit `ConfigProvider` so the example is self-contained.

If you remove that provider wiring and call `tauri_plugin_agent_runtime::init()` directly, the framework falls back to `DefaultConfigProvider`, which reads `~/.codex/config.toml`.
