<a id="zh"></a>

# Cosmic Weather template

[English](#en)

这是 `create-tauri-agent-app` 中更完整的端到端模板。

它展示了 runtime 希望开发者采用的框架模式：

1. 宿主提供 **agent authoring**（`src/agent.ts`）
2. 宿主提供 **SOUL.MD**（`SOUL.MD`）
3. 宿主提供 **tool**（`src-tauri/src/lib.rs` 中的 `cosmic.resolve_zodiac_sign`）
4. 宿主提供显式 **ConfigProvider**（指向 `./.codex/config.toml` 的 `TomlConfigProvider`）
5. 框架提供其余能力：thread / turn 生命周期、streaming、provider 配置解析与 Tauri command bridge

## 运行

```bash
pnpm install
cp .env.example .env
export OPENAI_API_KEY=...
pnpm tauri dev
```

如果你希望使用 OpenAI 兼容端点而不是默认 OpenAI profile：

```bash
export COMPAT_API_KEY=...
pnpm tauri dev
```

然后在 demo UI 中把 profile 选择器从 `default` 切到 `compat`。

## Provider 配置位置

- 模板配置文件：`./.codex/config.toml`
- 模板 provider wiring：`./src-tauri/src/lib.rs`

生成后的 app 故意使用显式 `ConfigProvider`，让宿主保持自包含。

如果移除这段 provider wiring，直接调用 `tauri_plugin_agent_runtime::init()`，框架会回退到 `DefaultConfigProvider`，即读取 `~/.codex/config.toml`。

## SOUL.MD 位置

- `./SOUL.MD`
- `./src/agent.ts`
- `./src/App.tsx`

---

<a id="en"></a>

# Cosmic Weather template

[简体中文](#zh)

This is the richer, end-to-end template for `create-tauri-agent-app`.

It demonstrates the framework pattern the runtime is meant to teach:

1. The host provides **agent authoring** in `src/agent.ts`
2. The host provides **SOUL.MD** in `SOUL.MD`
3. The host provides a **tool**: `cosmic.resolve_zodiac_sign` in `src-tauri/src/lib.rs`
4. The host provides an explicit **ConfigProvider** through `TomlConfigProvider` and `./.codex/config.toml`
5. The framework provides the rest: thread / turn lifecycle, streaming, provider config resolution, and the Tauri command bridge

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

## Where provider config lives

- Template config file: `./.codex/config.toml`
- Template provider wiring: `./src-tauri/src/lib.rs`

The generated app intentionally uses an explicit `ConfigProvider` so the host stays self-contained.

If you remove that provider wiring and call `tauri_plugin_agent_runtime::init()` directly, the framework falls back to `DefaultConfigProvider`, which reads `~/.codex/config.toml`.

## Where SOUL.MD lives

- `./SOUL.MD`
- `./src/agent.ts`
- `./src/App.tsx`
