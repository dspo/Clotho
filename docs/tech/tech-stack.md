# Clotho App 技术选型文档

> Tauri 2 + React 19 + TypeScript + Vite + TailwindCSS + shadcn/ui 桌面应用

## 1. 技术选型总览表

| 技术领域 | 推荐方案 | 备选方案 | 理由 |
|---------|---------|---------|------|
| 状态管理 | Zustand | Jotai | 轻量、简洁、React 19 兼容、适合中大型应用 |
| 路由 | TanStack Router | React Router v7 | 类型安全、文件路由、搜索参数验证 |
| 本地存储 | SQLite (tauri-plugin-sql) | - | Tauri 原生支持、SQL 查询能力强、离线优先 |
| 甘特图 | 自研 (SVG) | SVAR Gantt | 高度定制需求、避免商业库限制 |
| 日历组件 | Schedule-X | FullCalendar | 轻量现代、MIT 开源、shadcn 风格兼容 |
| 看板拖拽 | dnd-kit | @hello-pangea/dnd | 性能优秀、React 19 支持、高度可定制 |
| 图标库 | Lucide React | - | shadcn/ui 默认、tree-shaking 友好 |
| 日期处理 | date-fns | dayjs | shadcn/ui 生态默认、tree-shaking、函数式 |
| 表格/列表 | TanStack Table + TanStack Virtual | - | 虚拟滚动、headless、高度可定制 |
| 数据同步 | 本地优先 + 增量同步 | CRDT | 初期纯本地，预留同步接口 |

---

## 2. 各技术点详细分析

### 2.1 状态管理

#### 候选方案对比

| 特性 | Zustand | Jotai | Redux Toolkit | Valtio |
|------|---------|-------|---------------|--------|
| 包体积 | ~1.1KB (gzip) | ~2KB (gzip) | ~11KB (gzip) | ~3KB (gzip) |
| 学习曲线 | 低 | 低 | 中高 | 低 |
| React 19 支持 | v5 完全支持 | 支持 | 支持 | 支持 |
| DevTools | 支持 | 支持 | 优秀 | 支持 |
| 中间件生态 | persist/immer/devtools | - | 丰富 | - |
| 模式 | Store 模式 | 原子模式 | Flux 模式 | Proxy 模式 |

#### 推荐：Zustand

理由：
- 极小的包体积（~1.1KB gzip），适合桌面应用关注体积
- API 简洁直观，学习成本低
- 内置 `persist` 中间件，可直接对接本地存储
- Store 模式适合项目管理应用的数据组织（项目、任务、设置等独立 store）
- v5 完全兼容 React 19
- 社区活跃，npm 周下载量超 800 万

使用模式示例：
```typescript
// stores/project-store.ts
interface ProjectStore {
  projects: Project[]
  activeProjectId: string | null
  setActiveProject: (id: string) => void
  addProject: (project: Project) => void
}

const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      projects: [],
      activeProjectId: null,
      setActiveProject: (id) => set({ activeProjectId: id }),
      addProject: (project) =>
        set((state) => ({ projects: [...state.projects, project] })),
    }),
    { name: 'clotho-projects' }
  )
)
```

### 2.2 路由方案

#### 候选方案对比

| 特性 | TanStack Router | React Router v7 |
|------|----------------|-----------------|
| 类型安全 | 完整的端到端类型安全 | 基础类型支持 |
| 搜索参数 | 内置验证和序列化 | 需手动处理 |
| 文件路由 | 支持（可选） | 支持（框架模式） |
| 数据加载 | loader + 类型推断 | loader（Remix 风格） |
| 包体积 | ~12KB (gzip) | ~14KB (gzip) |
| 学习曲线 | 中 | 低 |
| 桌面应用适配 | SPA 模式原生支持 | 需配置 SPA 模式 |

#### 推荐：TanStack Router

理由：
- 端到端类型安全，路由参数、搜索参数都有完整类型推断
- 搜索参数验证和序列化内置支持，适合项目管理应用的复杂筛选场景
- 文件路由可选，不强制使用
- 桌面应用天然是 SPA，TanStack Router 的 SPA 模式更自然
- 与 TanStack Table 等同生态工具配合良好
- React Router v7 更偏向全栈框架（Remix 合并），桌面应用不需要 SSR 能力

路由结构示例：
```
src/routes/
├── __root.tsx          # 根布局
├── index.tsx           # 首页/仪表盘
├── projects/
│   ├── index.tsx       # 项目列表
│   └── $projectId/
│       ├── index.tsx   # 项目概览
│       ├── board.tsx   # 看板视图
│       ├── list.tsx    # 列表视图
│       ├── gantt.tsx   # 甘特图视图
│       └── calendar.tsx # 日历视图
└── settings.tsx        # 设置
```

### 2.3 本地数据存储

#### 候选方案对比

| 特性 | SQLite (tauri-plugin-sql) | IndexedDB | 文件系统 JSON |
|------|--------------------------|-----------|--------------|
| 查询能力 | SQL 全功能 | 键值+索引 | 无（全量读写） |
| 数据量支持 | 大（GB 级） | 中（受浏览器限制） | 小（MB 级） |
| 事务支持 | 完整 ACID | 支持 | 无 |
| 关系查询 | JOIN 等完整支持 | 不支持 | 不支持 |
| Tauri 集成 | 原生插件支持 | WebView 内置 | 需 Tauri FS API |
| 迁移管理 | SQL migration | 手动版本管理 | 手动 |
| 性能 | 优秀 | 良好 | 差（大数据量） |

#### 推荐：SQLite (tauri-plugin-sql)

理由：
- 项目管理应用涉及复杂的关系数据（项目-任务-子任务-标签-成员），SQL 查询能力必不可少
- Tauri 2 官方提供 `@tauri-apps/plugin-sql`，集成成熟
- SQLite 在 Rust 侧运行，性能远优于 WebView 内的 IndexedDB
- 支持数据库迁移，便于版本迭代
- 未来云同步时，SQLite 的变更追踪更容易实现
- 桌面应用无浏览器存储限制

前端数据层设计：
```
Rust (SQLite) ←→ Tauri IPC ←→ TypeScript 数据层 ←→ Zustand Store ←→ React UI
```

不推荐引入前端 ORM（如 Drizzle/Prisma），直接通过 Tauri command 调用 Rust 侧的 SQL 操作，保持架构简洁。数据访问层在 Rust 侧实现，前端只负责调用和缓存。

### 2.4 甘特图渲染

#### 候选方案对比

| 方案 | 许可证 | 功能完整度 | 定制性 | 维护状态 | 包体积 |
|------|--------|-----------|--------|---------|--------|
| gantt-task-react | MIT | 中 | 中 | 低（维护不活跃） | ~50KB |
| SVAR Gantt | MIT | 高 | 中 | 活跃 | ~80KB |
| frappe-gantt | MIT | 低 | 低 | 低 | ~30KB |
| DHTMLX Gantt | GPL/商业 | 非常高 | 高 | 活跃 | ~200KB+ |
| 自研 (SVG) | - | 按需 | 最高 | 自控 | 按需 |

#### 推荐：自研 (SVG)

理由：
- 项目管理应用的甘特图是核心功能，需要高度定制化
- 现有开源库要么功能不足（gantt-task-react 维护不活跃），要么定制性受限
- SVAR Gantt 虽然功能较全，但样式定制受限，难以与 shadcn/ui 风格统一
- 商业库（DHTMLX、Bryntum）功能强大但许可证成本高，且包体积大
- SVG 方案在桌面应用中性能足够，且与 React 组件模型天然契合
- 可以完全控制交互体验，实现与看板、列表视图的无缝切换

自研范围：
- 时间轴渲染（日/周/月/季度视图）
- 任务条渲染和拖拽调整
- 任务依赖关系连线
- 里程碑标记
- 今日线
- 左侧任务列表（复用 TanStack Table）

技术方案：
- 使用 SVG 渲染甘特图区域（React 组件直接渲染 SVG 元素）
- 使用 dnd-kit 处理拖拽交互
- 时间轴计算使用 date-fns
- 虚拟滚动使用 TanStack Virtual（大量任务时）

### 2.5 日历组件

#### 候选方案对比

| 特性 | Schedule-X | react-big-calendar | FullCalendar |
|------|-----------|-------------------|--------------|
| 许可证 | MIT（核心） | MIT | MIT |
| 包体积 | ~15KB (gzip) | ~40KB (gzip) | ~50KB+ (gzip) |
| 视图 | 日/周/月 | 日/周/月/议程 | 日/周/月/列表 |
| 样式定制 | CSS 变量、现代 | 需覆盖样式 | 主题系统 |
| React 19 | 支持 | 支持 | 支持 |
| TypeScript | 原生 | 类型定义 | 类型定义 |
| 拖拽 | 内置 | 需插件 | 内置 |
| 设计风格 | 现代简洁 | 传统 | 传统 |

#### 推荐：Schedule-X

理由：
- 轻量现代，包体积小（~15KB gzip），适合桌面应用
- 设计风格简洁现代，与 shadcn/ui 的设计语言一致
- 原生 TypeScript 支持
- CSS 变量定制，易于与 TailwindCSS 主题集成
- 内置拖拽支持，无需额外依赖
- 核心功能 MIT 开源
- 插件架构，按需引入功能

注意事项：
- Schedule-X 的高级功能（如资源视图）可能需要付费插件
- 如果需要更复杂的日程功能，FullCalendar 是成熟的备选

### 2.6 看板拖拽

#### 候选方案对比

| 特性 | dnd-kit | @hello-pangea/dnd | react-dnd |
|------|---------|-------------------|-----------|
| 包体积 | ~10KB (core, gzip) | ~30KB (gzip) | ~20KB (gzip) |
| React 19 | 支持（v2 重写） | 支持 | 不支持 |
| 性能 | 优秀 | 良好 | 良好 |
| 可访问性 | 优秀（ARIA） | 优秀 | 基础 |
| 定制性 | 非常高 | 中 | 高 |
| 触摸支持 | 内置 | 内置 | 需插件 |
| 排序 | @dnd-kit/sortable | 内置 | 需手动 |
| 跨容器拖拽 | 支持 | 支持 | 支持 |

#### 推荐：dnd-kit

理由：
- v2 版本完全重写，原生支持 React 19
- 包体积最小，模块化设计（core + sortable 按需引入）
- 性能优秀，使用 CSS transforms 而非 DOM 操作
- 高度可定制，headless 设计理念与 shadcn/ui 一致
- 优秀的可访问性支持（键盘导航、屏幕阅读器）
- 不仅用于看板，还可复用于甘特图拖拽、列表排序等场景
- 社区活跃，有大量看板实现参考

看板实现要点：
```typescript
// 使用 @dnd-kit/core + @dnd-kit/sortable
// 支持：跨列拖拽、列内排序、列排序
// 碰撞检测：closestCorners（适合看板场景）
```

### 2.7 图标库

#### 推荐：Lucide React

理由：
- shadcn/ui 默认图标库，零额外配置
- 完美支持 tree-shaking，只打包使用的图标
- 每个图标 ~1KB，按需引入不影响包体积
- 1000+ 图标，覆盖项目管理场景所需
- 一致的设计风格，与 shadcn/ui 视觉统一
- TypeScript 原生支持

### 2.8 日期处理

#### 候选方案对比

| 特性 | date-fns | dayjs | Temporal API |
|------|---------|-------|-------------|
| 包体积 | tree-shaking 友好 | ~2KB (core) | 原生（无需安装） |
| 不可变性 | 是（纯函数） | 否（链式调用） | 是 |
| Tree-shaking | 优秀 | 需插件按需加载 | N/A |
| TypeScript | 原生 | 类型定义 | 原生 |
| 时区支持 | date-fns-tz | 插件 | 内置 |
| 浏览器支持 | 全部 | 全部 | Chrome 144+（2026.3） |
| 生态兼容 | shadcn/ui 默认 | 广泛 | 尚未普及 |

#### 推荐：date-fns

理由：
- shadcn/ui 的 DatePicker 组件依赖 react-day-picker，后者默认使用 date-fns
- 纯函数式 API，与 React 的不可变数据理念一致
- 优秀的 tree-shaking 支持，只打包使用的函数
- TypeScript 原生支持，类型推断完整
- Temporal API 虽然已在 Chrome 144 中发布，但 Firefox/Safari 尚未支持，Tauri 的 WebView 引擎支持情况不确定，暂不采用
- dayjs 虽然体积更小，但 tree-shaking 不如 date-fns，且与 shadcn 生态不一致

### 2.9 表格/列表组件

#### 推荐：TanStack Table + TanStack Virtual

理由：
- Headless 设计，完全控制 UI 渲染，与 shadcn/ui 完美配合
- shadcn/ui 官方提供 TanStack Table 的集成示例
- 支持排序、筛选、分组、列固定、列调整等完整功能
- TanStack Virtual 提供虚拟滚动，处理大量任务时性能优秀
- TypeScript 原生支持
- 同一生态（TanStack Router + TanStack Table + TanStack Virtual）

使用场景：
- 任务列表视图（排序、筛选、分组）
- 甘特图左侧任务列表
- 项目列表
- 设置页面的数据表格

### 2.10 数据同步策略

#### 推荐：本地优先 + 预留同步接口

阶段规划：

**第一阶段（当前）：纯本地**
- SQLite 作为唯一数据源
- Zustand store 作为内存缓存
- 所有数据操作通过 Tauri command 调用 Rust 侧 SQL

**第二阶段（未来）：增量同步**
- SQLite 表增加 `updated_at`、`sync_version`、`is_deleted`（软删除）字段
- 基于时间戳的增量同步
- 冲突解决策略：Last-Write-Wins (LWW)

**第三阶段（远期）：CRDT 同步**
- 如需多设备实时协作，考虑引入 CRDT
- 候选方案：cr-sqlite（SQLite CRDT 扩展）
- 通过 Rust 侧集成，前端无感知

数据层接口设计（预留同步能力）：
```typescript
// 统一的数据操作接口
interface DataService<T> {
  getById(id: string): Promise<T | null>
  list(filter?: Filter): Promise<T[]>
  create(data: CreateInput<T>): Promise<T>
  update(id: string, data: UpdateInput<T>): Promise<T>
  delete(id: string): Promise<void>
}
```

---

## 3. 架构建议

### 3.1 目录结构

```
src/
├── app/                    # 应用入口和全局配置
│   ├── App.tsx
│   ├── router.tsx          # TanStack Router 配置
│   └── providers.tsx       # 全局 Provider 组合
├── routes/                 # 路由页面（TanStack Router 文件路由）
│   ├── __root.tsx
│   ├── index.tsx
│   ├── projects/
│   │   ├── index.tsx
│   │   └── $projectId/
│   │       ├── index.tsx
│   │       ├── board.tsx
│   │       ├── list.tsx
│   │       ├── gantt.tsx
│   │       └── calendar.tsx
│   └── settings.tsx
├── components/             # 共享组件
│   ├── ui/                 # shadcn/ui 组件（自动生成）
│   ├── layout/             # 布局组件（侧边栏、顶栏等）
│   ├── task/               # 任务相关组件
│   ├── project/            # 项目相关组件
│   ├── gantt/              # 甘特图组件（自研）
│   ├── board/              # 看板组件
│   └── calendar/           # 日历组件封装
├── stores/                 # Zustand stores
│   ├── project-store.ts
│   ├── task-store.ts
│   ├── ui-store.ts         # UI 状态（侧边栏、主题等）
│   └── settings-store.ts
├── services/               # Tauri command 调用封装
│   ├── project-service.ts
│   ├── task-service.ts
│   └── db-service.ts       # 数据库初始化和迁移
├── hooks/                  # 自定义 hooks
├── lib/                    # 工具函数
│   ├── utils.ts            # shadcn/ui cn() 等
│   ├── date.ts             # date-fns 封装
│   └── constants.ts
└── types/                  # TypeScript 类型定义
    ├── project.ts
    ├── task.ts
    └── common.ts
```

### 3.2 分层设计

```
┌─────────────────────────────────────────┐
│              UI 层 (React)               │
│  Routes → Components → shadcn/ui        │
├─────────────────────────────────────────┤
│            状态层 (Zustand)              │
│  Stores（内存缓存 + UI 状态）            │
├─────────────────────────────────────────┤
│           服务层 (TypeScript)            │
│  Services（Tauri IPC 调用封装）          │
├─────────────────────────────────────────┤
│          Tauri IPC 边界                  │
├─────────────────────────────────────────┤
│           命令层 (Rust)                  │
│  Tauri Commands（业务逻辑）              │
├─────────────────────────────────────────┤
│           数据层 (Rust)                  │
│  SQLite（数据持久化）                    │
└─────────────────────────────────────────┘
```

数据流：
1. UI 触发操作 → 调用 Service
2. Service 通过 Tauri invoke 调用 Rust command
3. Rust command 执行 SQL 操作，返回结果
4. Service 更新 Zustand store
5. Store 变更触发 UI 重渲染

---

## 4. 性能考量

### 4.1 包体积预估

| 依赖 | 预估体积 (gzip) |
|------|----------------|
| React + ReactDOM | ~45KB |
| TanStack Router | ~12KB |
| Zustand | ~1.1KB |
| dnd-kit (core + sortable) | ~13KB |
| date-fns (按需) | ~5-10KB |
| TanStack Table | ~14KB |
| TanStack Virtual | ~2KB |
| Schedule-X (core + react) | ~15KB |
| Lucide React (按需) | ~1KB/图标 |
| shadcn/ui (按需) | ~按组件计 |
| **总计（预估）** | **~110-130KB** |

### 4.2 性能优化策略

- **虚拟滚动**：任务列表、甘特图使用 TanStack Virtual，支持 10000+ 任务
- **懒加载路由**：TanStack Router 支持路由级代码分割
- **Zustand selector**：使用 selector 避免不必要的重渲染
- **SVG 优化**：甘特图只渲染可视区域的任务条
- **Tauri IPC 批量操作**：减少 IPC 调用次数，支持批量 CRUD
- **SQLite 索引**：为常用查询字段建立索引

### 4.3 桌面应用特殊优化

- Tauri 的 WebView 比 Electron 的 Chromium 轻量得多
- SQLite 在 Rust 侧运行，不占用 JS 主线程
- 文件操作通过 Rust 侧处理，避免 WebView 性能瓶颈
- 可利用 Rust 侧进行计算密集型操作（如甘特图关键路径计算）

---

## 5. 未来扩展性考虑

### 5.1 云同步

- 数据层接口已预留同步能力
- SQLite 的 `updated_at` + `sync_version` 支持增量同步
- 未来可在 Rust 侧实现同步引擎，前端无需改动
- 考虑 cr-sqlite 实现 CRDT 级别的多设备同步

### 5.2 插件系统

- 基于 Tauri 的插件架构，可扩展 Rust 侧能力
- 前端组件的模块化设计便于功能扩展
- Zustand 的 store 模式便于新增数据域

### 5.3 多平台

- Tauri 2 支持 macOS、Windows、Linux
- 未来 Tauri 移动端支持成熟后，可复用大部分前端代码
- 响应式布局预留（虽然桌面优先）

### 5.4 国际化

- 预留 i18n 接口，推荐使用 react-i18next（如需要时引入）
- date-fns 内置多语言支持
- Schedule-X 支持多语言

### 5.5 主题系统

- shadcn/ui + TailwindCSS 的 CSS 变量主题系统
- 支持亮色/暗色模式切换
- Schedule-X 通过 CSS 变量与主题系统集成
- 甘特图自研组件直接使用 TailwindCSS 类名
