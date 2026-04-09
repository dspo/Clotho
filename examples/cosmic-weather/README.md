<a id="zh"></a>

# Cosmic Weather

[English](#en)

`Cosmic Weather` 是 `tauri-plugin-agent-runtime` 的首个完整 demo 宿主应用。

它演示了框架希望开发者采用的最小接入模式：

1. 宿主提供 **agent prompt / authoring**（`src/agent.ts`）
2. 宿主提供 **SOUL.MD**（`SOUL.MD`），定义 agent 的灵魂、范围与拒绝边界
3. 宿主提供 **tool**（`src-tauri/src/lib.rs` 中的 `cosmic.resolve_zodiac_sign`）
4. 宿主提供显式 **ConfigProvider**（指向 `examples/cosmic-weather/.codex/config.toml` 的 `TomlConfigProvider`）
5. 框架提供其余能力：thread / turn 生命周期、streaming、provider 配置解析与 Tauri command bridge

## 运行

```bash
pnpm install
cp examples/cosmic-weather/.env.example examples/cosmic-weather/.env
export OPENAI_API_KEY=...
pnpm --dir examples/cosmic-weather tauri dev
```

如果你希望使用 OpenAI 兼容端点而不是默认 OpenAI profile：

```bash
export COMPAT_API_KEY=...
pnpm --dir examples/cosmic-weather tauri dev
```

然后在 demo UI 中把 profile 选择器从 `default` 切到 `compat`。

## Provider 配置位置

- Demo 配置文件：`examples/cosmic-weather/.codex/config.toml`
- Demo provider wiring：`examples/cosmic-weather/src-tauri/src/lib.rs`

这个 demo 故意使用显式 `ConfigProvider`，让示例是自包含的。

如果移除这段 provider wiring，直接调用 `tauri_plugin_agent_runtime::init()`，框架会回退到 `DefaultConfigProvider`，即读取 `~/.codex/config.toml`。

## SOUL.MD 位置

- `examples/cosmic-weather/SOUL.MD`
- `examples/cosmic-weather/src/agent.ts`
- `examples/cosmic-weather/src/App.tsx`

其中：

- `SOUL.MD` 定义 agent 的身份、支持范围、工具边界与越界拒绝方式
- `defineSoul(...)` 把这份文档接入 agent 定义
- `composeAgentTurnText(...)` 在发送 turn 时把 `SOUL.MD`、instructions 与用户输入统一拼成最终 prompt

---

<a id="en"></a>

# Cosmic Weather

[简体中文](#zh)

`Cosmic Weather` is the first end-to-end demo host for `tauri-plugin-agent-runtime`.

It demonstrates the smallest full framework integration pattern:

1. The host provides **agent authoring** in `src/agent.ts`
2. The host provides **SOUL.MD** in `SOUL.MD` to define the agent's role, scope, and refusal boundary
3. The host provides a **tool**: `cosmic.resolve_zodiac_sign` in `src-tauri/src/lib.rs`
4. The host provides an explicit **ConfigProvider** via `TomlConfigProvider` and `examples/cosmic-weather/.codex/config.toml`
5. The framework provides the rest: thread / turn lifecycle, streaming, provider config resolution, and the Tauri command bridge

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

## Where provider config lives

- Demo config file: `examples/cosmic-weather/.codex/config.toml`
- Demo provider wiring: `examples/cosmic-weather/src-tauri/src/lib.rs`

The demo intentionally uses an explicit `ConfigProvider` so the example stays self-contained.

If you remove that provider wiring and call `tauri_plugin_agent_runtime::init()` directly, the framework falls back to `DefaultConfigProvider`, which reads `~/.codex/config.toml`.

## Where SOUL.MD lives

- `examples/cosmic-weather/SOUL.MD`
- `examples/cosmic-weather/src/agent.ts`
- `examples/cosmic-weather/src/App.tsx`

In this demo:

- `SOUL.MD` defines identity, supported scope, tool boundaries, and out-of-scope refusal behavior
- `defineSoul(...)` attaches the document to the agent definition
- `composeAgentTurnText(...)` combines `SOUL.MD`, developer instructions, and user input into the final runtime prompt
