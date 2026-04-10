# Plugin Sink: Common Infrastructure

## Goal

Move protocol-level code from Clotho host into `tauri-plugin-agent-runtime` (Rust)
and `@dspo/tauri-agent-react` (TS) so the next host app doesn't re-implement it.

## What Gets Sunk

### 1. MultiSourceConfigProvider (Rust plugin)

**File**: `src-tauri/crates/tauri-plugin-agent-runtime/src/config.rs`

The existing `DefaultConfigProvider` only reads a single `~/.codex/config.toml`.
Clotho's `assistant/config.rs` added multi-source discovery (project + user) with
priority fallback and arbitrary custom path support. This is generic.

```rust
pub struct MultiSourceConfigProvider {
    candidates: Vec<ConfigCandidate>,
}

struct ConfigCandidate {
    source: String,           // "project" | "user" | "custom"
    config_path: PathBuf,
    is_default: bool,
}

impl MultiSourceConfigProvider {
    pub fn codex_defaults() -> Self {
        // project: CWD/.codex/config.toml
        // user:    ~/.codex/config.toml
        // default priority: project > user
    }

    pub fn with_candidate(mut self, source: &str, path: PathBuf) -> Self { ... }
}

impl ConfigProvider for MultiSourceConfigProvider { ... }
```

Key behaviors:
- `list_configs()` returns all discovered candidates with `exists` flag
- `resolve_config(selection)` resolves by `config_id` match or falls back to default
- Custom paths accepted via `ConfigSelection.config_id`
- Profile merge logic already exists in plugin's `resolve_effective_table` — reuse it

### 2. AutoResolutionPolicy + HeadlessTurnRunner (Rust plugin)

**File**: `src-tauri/crates/tauri-plugin-agent-runtime/src/headless.rs`

#### AutoResolutionPolicy

```rust
pub enum AutoResolutionPolicy {
    /// Decline all approval requests, return empty answers for input requests.
    DeclineAll,
    /// Accept read-only operations, decline mutations.
    AcceptReadOnly,
    /// Custom resolution function per request kind.
    Custom(Arc<dyn Fn(&PendingRuntimeRequest) -> Option<Value> + Send + Sync>),
}

pub fn auto_resolve_request(
    policy: &AutoResolutionPolicy,
    request: &PendingRuntimeRequest,
) -> Option<Value> { ... }
```

The 7 known request kinds and their decline responses:
- `command_execution_request_approval` → `{ "decision": "decline" }`
- `file_change_request_approval` → `{ "decision": "decline" }`
- `permissions_request_approval` → `{ "permissions": {}, "scope": "turn" }`
- `apply_patch_approval` → `{ "decision": "Denied" }`
- `exec_command_approval` → `{ "decision": "Denied" }`
- `tool_request_user_input` → `{ "answers": {} }`
- `mcp_server_elicitation_request` → `{ "action": "decline", "content": null, "_meta": <from request> }`

#### HeadlessTurnRunner

```rust
pub struct HeadlessTurnRunnerConfig {
    pub timeout: Duration,
    pub poll_interval: Duration,
    pub policy: AutoResolutionPolicy,
}

impl Default for HeadlessTurnRunnerConfig {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(600),
            poll_interval: Duration::from_secs(1),
            policy: AutoResolutionPolicy::DeclineAll,
        }
    }
}

pub struct HeadlessTurnResult {
    pub thread_id: String,
    pub turn_id: String,
    pub status: String,                         // "completed" | "failed" | "cancelled" | "timed_out"
    pub latest_assistant_message: Option<String>,
}

pub async fn run_headless_turn<R: Runtime>(
    app: AppHandle<R>,
    state: AssistantRuntimeState,
    thread_id: String,
    turn_id: String,
    config: HeadlessTurnRunnerConfig,
) -> Result<HeadlessTurnResult> { ... }
```

The runner encapsulates:
1. Poll turn status every `poll_interval`
2. Auto-resolve pending requests per `policy`
3. Interrupt on timeout
4. Return final status + assistant message

### 3. RuntimeRequestResolver (React SDK)

**File**: `packages/tauri-agent-react/src/RuntimeRequestResolver.tsx`

```tsx
export interface RuntimeRequestResolverProps {
  request: PendingRuntimeRequest;
  onResolve: (response: unknown) => Promise<void>;
  className?: string;
}

export function RuntimeRequestResolver(props: RuntimeRequestResolverProps): JSX.Element;
```

The component:
- Renders the correct form for each of the 7 known `requestKind` values
- Falls back to freeform JSON textarea for unknown kinds
- Uses plain HTML with `data-request-kind` attributes — no shadcn/radix dependency
- Host apps can style via CSS or wrap with their own UI components
- Exports helper types and functions for hosts that want custom rendering

Helpers exported:
```tsx
export type RuntimeRequestKind =
  | 'command_execution_request_approval'
  | 'file_change_request_approval'
  | 'permissions_request_approval'
  | 'apply_patch_approval'
  | 'exec_command_approval'
  | 'tool_request_user_input'
  | 'mcp_server_elicitation_request';

export function buildAutoResponse(request: PendingRuntimeRequest): unknown | null;
export function normalizeToolQuestions(payload: Record<string, unknown>): ToolInputQuestion[];
export function normalizeElicitationFields(payload: Record<string, unknown>): ElicitationField[];
```

### 4. useTurnStream Hook (React SDK)

**File**: `packages/tauri-agent-react/src/useTurnStream.ts`

```tsx
export interface UseTurnStreamOptions {
  client: TauriAgentClient;
  threadId: string | null;
  turnId: string | null;
  onItem: (item: AssistantTurnStreamEnvelope) => void;
}

export interface UseTurnStreamReturn {
  isAttached: boolean;
  isResuming: boolean;
  resume: (afterSeq?: number | null) => Promise<void>;
  detach: () => void;
}

export function useTurnStream(options: UseTurnStreamOptions): UseTurnStreamReturn;
```

The hook:
- Manages attach/resume/detach state machine
- Prevents duplicate resume calls
- Auto-detaches on unmount
- Tracks lastSeq internally

### 5. Shared Helpers (React SDK)

**File**: `packages/tauri-agent-react/src/helpers.ts`

```tsx
export function turnKey(threadId: string, turnId: string): string;
export function isBlockHidden(block: ConversationBlock): boolean;
export function getBlockTurnId(block: ConversationBlock): string | null;
export function asRecord(value: unknown): Record<string, unknown> | null;
export function readString(record: Record<string, unknown> | null, key: string): string | null;
export function readArray(record: Record<string, unknown> | null, key: string): unknown[] | null;
export function readBoolean(record: Record<string, unknown> | null, key: string): boolean | null;
export function statusLabel(status: string | null): string;
```

## File Change Summary

| Package | File | Action |
|---------|------|--------|
| tauri-plugin-agent-runtime | `src/config.rs` | Add `MultiSourceConfigProvider` |
| tauri-plugin-agent-runtime | `src/headless.rs` | New: `AutoResolutionPolicy`, `HeadlessTurnRunner` |
| tauri-plugin-agent-runtime | `src/lib.rs` | Add `mod headless`, re-export new types |
| @dspo/tauri-agent-react | `src/RuntimeRequestResolver.tsx` | New: protocol-aware form component |
| @dspo/tauri-agent-react | `src/useTurnStream.ts` | New: stream state machine hook |
| @dspo/tauri-agent-react | `src/helpers.ts` | New: shared utilities |
| @dspo/tauri-agent-react | `src/index.tsx` | Re-export new modules |
| @dspo/tauri-agent-react | `package.json` | Add `@dspo/tauri-agent` peer dep if missing |

## What Stays in Clotho

- `host_tools.rs` — domain-specific tools (project/task/dependency)
- `SOUL.md` — Clotho persona
- `runtime_host.rs` — AgentDefinition with Clotho tool bindings
- `proposal.rs` — Clotho proposal schema + extraction
- `commands/assistant.rs` — apply/simulate commands
- `automation.rs` — daily scheduler job (but uses `HeadlessTurnRunner` from plugin)
- Frontend ProposalCard/ProposalDrawer — Clotho proposal rendering
