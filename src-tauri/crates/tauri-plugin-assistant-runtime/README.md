# tauri-plugin-assistant-runtime

`tauri-plugin-assistant-runtime` 不是新的框架入口，而是**遗留兼容层**。

## 为什么它还存在

本仓库在拆分 PR1 / PR2 时，需要同时满足两件事：

1. 对外把统一入口收敛到 `tauri-plugin-agent-runtime`
2. 不打断仍然依赖旧 `assistant-runtime` namespace 的历史宿主与迁移中代码

因此当前保留这个 crate，但它的角色被严格限制为：

- 保留旧的 `assistant-runtime` plugin 名称
- 保留旧事件命名空间与审计目录
- 作为历史调用路径的兼容别名

## 什么时候用它

- 只在你必须兼容历史 `assistant-runtime` 接入代码时使用

## 什么时候不要用它

- 新宿主应用
- 新 capability 配置
- 新的 framework 文档示例

这些场景统一使用 `tauri-plugin-agent-runtime`，并以 `agent-runtime:*` 作为权限标识。

## 当前与 `tauri-plugin-agent-runtime` 的关系

- `tauri-plugin-agent-runtime`：对外统一入口，代表终态命名
- `tauri-plugin-assistant-runtime`：兼容层，承接旧入口

也就是说，保留两个 crate 不是为了长期并列维护两套公共入口，而是为了让框架抽象先落地，同时不给已有宿主制造一次性破坏式迁移。
