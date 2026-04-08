Issue: https://github.com/dspo/Clotho/issues/15

配套开发者文档：

- [快速接入与开发指南](./quickstart.md)

# 目标

基于目前的工作，抽出一个对 Tauri v2 生态可复用的 "Tauri Agent Runtime Framework", 其形式为 Tauri Plugin（含 Rust core、Tauri plugin、TS SDK、React 包、脚手架与示例）。
让 Tauri 开发者，可以不必关心 AI Agent 开发的任何细节，就能基于我们提供的 Tauri Plugin 轻松将 AI Agent 集成到他的项目中，开发者要做的仅仅是向我们的 Tauri Plugin 提供提示词、工具以及资源而已。而我们提供了几乎完整的 Codex 能力（可能仅仅是没有 Codex TUI 而已），和 Tauri 特色的前后端通信、状态管理、配置管理等，以及对接多 AI Provider 的能力。

可能的实现路径：把现有 Clotho 的 Agent/Runtime/Proposal/Automation 主链抽象成一个对 Tauri 生态可复用的 "Tauri Agent Runtime Framework"（含 Rust core、Tauri plugin、TS SDK、React 包、脚手架与示例），同时保持 Clotho app 可运行并通过所有验证。做到“真实代码+测试+文档+验证”，而不是只产出设计或 TODO 列表。注意我们不能抄袭 Codex 源码，只能通过规范方式引用 Crates。有不得已必须使用 Codex 源码时，应当规范说明。

把以下文件视为事实来源（必读并以其内容为基础，不凭空重写）：
0. Issue: https://github.com/dspo/Clotho/issues/15
1. docs/src/architecture/assistant-codex-runtime.md
2. docs/src/architecture/assistant-codex-rollout.md
3. docs/src/architecture/assistant-codex-contracts.md
4. docs/src/architecture/assistant-codex-proposal-schema.md
5. docs/src/architecture/assistant-codex-phase0-freeze.md
6. src-tauri/crates/tauri-plugin-assistant-runtime/
7. src-tauri/crates/clotho-domain/
8. src-tauri/src/lib.rs
9. src/services/assistant-runtime-client.ts
10. src/types/assistant-runtime.ts
11. .agents/skills/

当前现实（不要把仓库当空项目）
- 已有 embedded Codex runtime、thread/turn/channel、native tools、proposal/apply、automation 主链。
- tauri-plugin-assistant-runtime 直接依赖 clotho-domain（需抽离）。
- native tools、proposal schema、skills、catalog 等带有 Clotho 领域耦合。
- 前端类型安全客户端与 types 仍在 app 内部（需抽成 npm SDK）。
- 目前只有 default 权限集，需扩展为至少 read-only/operator/automation/debug。
- 仓库现在不是 JS monorepo/workspace，需要改为 workspace 并新增 packages。

必须遵守的架构判断（默认决策 — 不要反复问）
1. function_tools 为 runtime primitive。
2. agents 为 product-facing definition。
3. skills 为 authoring-time asset（非 runtime primitive）。
4. MCP 作为 integration / tool provider transport。
5. 写数据库边界保留给宿主应用；框架提供治理边界（proposal/simulate/apply/approval/policy/audit/automation hook）。
6. v1 优先声明式定义（defineAgent/defineDomain），trait/高级扩展次之。
7. 支持多 provider adapter，从 Day1 不绑死单一 provider。
8. 保留 Clotho 侧接入边界，但同时引入 framework-native contract extension。
9. automation 为框架一等能力，但可配置/可禁用/可审计。
10. React 包首版最小可用，headless SDK 不依赖 UI。
11. 注册期冻结结构性定义（id/binding/capability/permission/policy），运行时仅允许有限覆盖（模型配置、输入、profile、少量 instructions/context）。
12. 可采用兼容迁移：新增通用 crate/package + 把旧 Clotho 专用入口变为 thin shim / re-export，最终语义收敛到通用命名。

必须交付的实际代码与产物（非草案）
- Rust:
  - 新 crate src-tauri/crates/agent-core（通用抽象、公共 API）。
  - 新 crate src-tauri/crates/tauri-plugin-agent-runtime（通用 Tauri plugin）。
  - 对现有 src-tauri/crates/tauri-plugin-assistant-runtime 做兼容迁移：要么转成 shim/re-export，要么迁移并删除旧命名，但 Clotho app 必须可运行。
  - 把 clotho-domain 相关逻辑从 plugin 中剥离到宿主适配层或单独 crate（例如 src-tauri/crates/clotho-adapter）。
  - 在 agent-core 中暴露公共 API（Builder、AgentDefinition、FunctionToolDefinition、FunctionToolHandler、ToolProvider、SkillCatalogRegistration、IntegrationRegistration、ActionPolicy、OutputContract、AutomationHooks 及 supporting types）。
  - 实现 permission sets（至少 read-only/operator/automation/debug）。

- JS/TS:
  - 把前端类型安全客户端与 types 提炼成 pnpm workspace packages：
    - packages/tauri-agent（headless 类型安全客户端 + authoring API：defineAgent、defineDomain 等）
    - packages/tauri-agent-react（最小 React 组件 / hooks：transcript、approval、proposal、audit）
    - packages/create-tauri-agent-app（最小脚手架，能生成至少 prompt-only / declarative / operator 模板之一）
  - examples/ 或 templates/ 提供最少一个非 Clotho 的 demo，证明框架通用。

- 文档：
  - docs 增补 quickstart、concepts（framework-oriented）、security/permission、migration（从 tauri-plugin-assistant-runtime/clotho-domain 到新框架的迁移步骤与兼容策略）。

- 测试/验证：
  - Rust 单元测试/集成测试覆盖新抽象与 plugin。
  - TS packages build/typecheck。
  - Clotho app 的最小 smoke test（核心 thread/turn/stream、proposal/simulate/apply、approval、automation 不被中断）。
  - 验证 prompt-only、declarative、custom tool/operator 三类 agent 至少各有一个最小路径。
  - 权限模型映射验证（read-only/operator/automation/debug）。

实现顺序（优先保证仓库不断可用）
1. 全量代码+文档审计（生成内部实施清单，仅供 agent 自用，不在此停留）。
2. 在 src-tauri/crates/ 下创建 agent-core（核心抽象）并实现基本 API（空实现也要有测试和文档）。
3. 创建 tauri-plugin-agent-runtime（基于 agent-core 的 Tauri 插件 skeleton），把现有 tauri-plugin-assistant-runtime 中通用逻辑迁移进来。
4. 在迁移过程中，把 Clotho 专用逻辑抽到宿主适配层（clotho-adapter crate 或 app-side module），确保有 thin shim 维持兼容。
5. 修改 src-tauri/src/lib.rs 和 app 的 plugin 注册，使其使用新的通用 plugin；确保 Clotho 在每一步的中间状态都能恢复并通过 smoke test。
6. 在 JS 侧改造为 pnpm workspace（packages/...），抽出 tauri-agent 与 tauri-agent-react、create-tauri-agent-app。
7. 为 TS SDK 提供类型安全客户端（示例 API: defineAgent、defineDomain、TauriAgentClient.run/ simulate/ apply）。
8. 提供最小 React 组件和示例页面，能在 Clotho app 或 demo 中使用。
9. 新增脚手架最小实现，能生成模板。
10. 撰写文档、示例、README 与迁移指南。
11. 持续运行并修复测试/构建失败，直至通过验证要求。

代码风格：
Tauri 项目的代码风格，必要时提供宏以帮助开发者更方便地将函数、文本封装成函数工具、资源等。
符合 Agent 开发范式，符合 Tauri Plugin 开发的项目组织风格。

API 建议（可直接作为实现参考）
- Rust (示例签名，具体类型可适度调整)：
  - pub struct Builder { /* register_agent, register_tool, register_provider, set_config */ }
  - pub struct AgentDefinition { id: String, name: Option<String>, instructions: Option<String>, model_profile: Option<ModelProfile>, tool_bindings: Vec<ToolBinding>, skill_bindings: Vec<SkillBinding>, action_policy: ActionPolicy, output_contract: OutputContract, automation_hooks: AutomationHooks, ui_metadata: UiMetadata }
  - pub struct FunctionToolDefinition { id: String, description: String, namespace: Option<String>, input_schema: Option<serde_json::Value>, output_schema: Option<serde_json::Value>, execution_mode: ExecutionMode, authz: PermissionSet, visibility: Visibility }
  - pub trait FunctionToolHandler { fn handle(&self, ctx: &ToolContext, input: serde_json::Value) -> Result<serde_json::Value, ToolError>; }
  - pub trait ToolProvider { fn list_tools(&self, ctx: &Context) -> Vec<FunctionToolDefinition>; fn invoke(&self, id: &str, input: serde_json::Value) -> Result<serde_json::Value, ToolError>; }
  - pub enum ActionPolicy { Direct, ProposalOnly, ApprovalRequired { approvers: Vec<String> }, /* plus allowed/blocked tool lists */ }
  - pub enum OutputContract { FreeformText, StructuredArtifact { schema: serde_json::Value }, Proposal }

- TypeScript (示例 API)：
  - type AgentSpec = { id: string; name?: string; description?: string; instructions?: string; modelProfile?: any; toolBindings?: any[]; actionPolicy?: ActionPolicy; outputContract?: OutputContract; automationHooks?: any; }
  - export function defineAgent(spec: AgentSpec): AgentSpec
  - export function defineDomain(...): DomainSpec
  - export class TauriAgentClient { constructor(config); run(agentId:string, input:any): Promise<any>; simulateProposal(...); applyProposal(...); listAgents(): Promise<AgentSpec[]> }

验证命令（执行并修复直至通过）
- Rust:
  - cd src-tauri && cargo test --workspace
  - 对新增 crate 单独运行 cargo test -p agent-core && cargo test -p tauri-plugin-agent-runtime
- JS/TS:
  - 使用 pnpm workspace：pnpm -w install
  - pnpm -w -r build 或 pnpm -w -r -C packages build / pnpm -w -r -C packages typecheck（视现有 scripts）
  - 在根和 packages 单独运行必要的 build/typecheck
- App smoke:
  - 构建或运行 Clotho 的最小 smoke 流程（npm/pnpm start 或 yarn start），并验证 thread/turn/stream、proposal/simulate/apply、approval、automation 最关键路径能跑通。
- 如果测试失败：修复代码直至通过，再继续下一步。

提交与分支策略
- 在执行前新建分支：feat/agent-runtime-framework
- 每个功能点做小而原子提交，提交信息清晰（示例：feat(rust): add agent-core crate — extract runtime abstractions），拒绝 Co-authored-by。
- 最终形成一个包含所有改造的 branch；（可选）打开 PR，PR 描述包含“已完成的工作、验证命令与结果、残余非阻塞项”。

停止条件（仅在这些真实阻塞时才停止并向我汇报）
- 需要外部密钥、私有 registry/凭据或组织级权限（例如发布到 crates.io/npm registry 的凭据）才能继续关键步骤。
- 需要产品 owner 的交互式决策（例如：是否弃用旧 API 并强制删除旧接入路径），且无法用合理默认值继续。
- 发现仓库存在未关联到本任务的、本质上危险或敏感的改动（例如包含凭据）的情况下先暂停并汇报。

最终交付的总结（在完成后必须给出）
- 新增/重构的 crate/package/module 列表（按路径）。
- 关键公共 API（类型/函数/trait/方法）和兼容迁移策略（旧名如何 shim/重定向）。
- Clotho 宿主如何继续工作的说明（调用路径/接入边界位置/演示步骤）。
- 运行的测试/构建命令与实际结果（通过/失败与修复说明）。
- 剩余的、且确为非阻塞的限制项（必须是真正无法在当前环境解决的），并解释原因。

额外要求（行为规范）
- 不要把“以后抽”放在注释里；需要抽的这次就抽。
- 不要长时间把仓库置于破坏状态；每完成重要切片就恢复 Clotho 宿主的可运行性并做 smoke test。
- 旧接入路径必须尽可能薄；不要留下长期维护成本。
- 所有新增 crate/package 都要有 README、Cargo.toml/package.json、build script、基本示例和本地 smoke 测试命令（但不强制实际发布）。
- 在每次关键修改后执行相应的测试和构建并记录结果；若失败先修直至通过。

在开始之前的第一步（立即执行）
- 在当前工作树新建分支 feat/agent-runtime-framework。
- 做一次全库审计（静态读取上面列出的事实文件和相关实现），生成内部实施清单（只存在于 agent 内存中或临时文件），然后直接开始第 2 步（实现 agent-core）。不要把审计结果作为最终输出停下——继续实现。

注：除非真的遇到上面定义的 blocker，否则不要向我请求决策或确认。始终以本 prompt 中列出的默认决策推进。
