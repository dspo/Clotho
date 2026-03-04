# 数据模型设计

> 本节内容已整合到[产品概述](./overview.md)的第 4 节"数据模型设计"中。

## 快速参考

### 实体关系

```
Project 1──N Task
Task    1──N Task (子任务，parent_task_id)
Task    N──N Tag  (通过 TaskTag 关联表)
Task    1──N TaskDependency (甘特图依赖关系)
```

### 主要实体

- **Project**：项目，包含名称、描述、颜色、状态等
- **Task**：任务，核心实体，包含状态、优先级、日期等
- **Tag**：标签，用于分类和筛选任务
- **TaskDependency**：任务依赖关系，用于甘特图

### 任务状态

| 状态 | 说明 | 颜色 |
|------|------|------|
| backlog | 待规划，尚未决定何时处理 | #6B7280（灰） |
| todo | 已规划，准备开始 | #8B5CF6（紫） |
| in_progress | 进行中 | #F59E0B（琥珀） |
| done | 已完成 | #10B981（绿） |
| cancelled | 已取消 | #EF4444（红） |

### 任务优先级

| 优先级 | 颜色 |
|--------|------|
| urgent | #EF4444（红） |
| high | #F97316（橙） |
| medium | #EAB308（黄） |
| low | #3B82F6（蓝） |

详细字段定义请参阅 [overview.md](./overview.md) 第 4 节。
