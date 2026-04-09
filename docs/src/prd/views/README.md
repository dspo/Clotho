<a id="zh"></a>

# 视图设计

[English](#en)

Clotho 提供 5 种核心视图，满足不同场景下的任务管理需求。

## 视图概览

| 视图 | 用途 | 主要交互 |
|------|------|----------|
| [项目列表](./project-list.md) | 所有项目的概览 | 卡片 / 行列表、进度统计 |
| [看板视图](./kanban.md) | 按状态管理任务 | 卡片拖拽、状态流转 |
| [列表视图](./list.md) | 表格式任务管理 | 排序、筛选、批量操作 |
| [甘特图视图](./gantt.md) | 时间轴规划 | 任务条拖拽、依赖关系 |
| [日历视图](./calendar.md) | 日程安排 | 月 / 周 / 日视图 |

## 视图切换

在项目内，通过顶部 Tab 栏切换视图：

```
[看板] [列表] [甘特图] [日历]
```

快捷键：

- `Cmd+1`：切换到看板视图
- `Cmd+2`：切换到列表视图
- `Cmd+3`：切换到甘特图视图
- `Cmd+4`：切换到日历视图

## 数据同步

所有视图共享同一数据源，在任何视图中的修改会实时同步到其他视图。

---

<a id="en"></a>

# View design

[简体中文](#zh)

Clotho exposes five core views so task management can adapt to different workflows.

## View overview

| View | Purpose | Primary interactions |
|------|---------|----------------------|
| [Project list](./project-list.md) | Overview of all projects | Cards / rows, progress stats |
| [Kanban view](./kanban.md) | Manage tasks by status | Card drag-and-drop, status transitions |
| [List view](./list.md) | Table-style task management | Sorting, filtering, batch actions |
| [Gantt view](./gantt.md) | Timeline planning | Bar drag-and-drop, dependencies |
| [Calendar view](./calendar.md) | Schedule management | Month / week / day views |

## Switching views

Inside a project, use the top tab bar to switch views:

```
[Kanban] [List] [Gantt] [Calendar]
```

Keyboard shortcuts:

- `Cmd+1`: switch to Kanban
- `Cmd+2`: switch to List
- `Cmd+3`: switch to Gantt
- `Cmd+4`: switch to Calendar

## Data synchronization

All views share the same data source, so edits made in one view immediately appear in the others.
