# tauri-plugin-assistant-runtime

`tauri-plugin-assistant-runtime` 不是新的框架入口，而是**仓库内部实现 crate**。

## 为什么仓库里同时还保留这个 crate

当前仓库把公共入口与实现承载分开了：

1. `tauri-plugin-agent-runtime`：对外统一入口，代表框架终态命名
2. `tauri-plugin-assistant-runtime`：承载当前 runtime engine 与 `assistant-runtime` namespace 的内部实现

因此这个 crate 当前承担的是实现职责，而不是对外产品职责：

- 承载 thread / turn / stream / runtime 主链实现
- 承载 `assistant-runtime` 相关的内部命名空间细节
- 为 `tauri-plugin-agent-runtime` 提供底层实现支撑

## 对宿主开发者意味着什么

- 新宿主应用
- 新 capability 配置
- 新的 framework 文档示例

这些场景统一使用 `tauri-plugin-agent-runtime`，并以 `agent-runtime:*` 作为权限标识。

## 当前与 `tauri-plugin-agent-runtime` 的关系

- `tauri-plugin-agent-runtime`：对外统一入口，代表终态命名
- `tauri-plugin-assistant-runtime`：仓库内部实现 crate，不作为新的公共入口

也就是说，保留两个 crate 不是为了长期并列维护两套公共入口，而是为了把**对外 API 收敛**和**内部实现承载**分开。对外讨论框架接入时，应始终以 `tauri-plugin-agent-runtime` 为准。
