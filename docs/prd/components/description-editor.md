# Task Description Editor

## 格式选择
- 用户首次编辑 description 时，弹出选择对话框
- 选项：富文本 (Rich Text) / Markdown
- 选择后存储到 task.description_format
- 两种格式互不转换

## 富文本模式
- 使用 Tiptap 编辑器
- 支持：Heading 1/2/3、粗体、斜体、列表、代码块、引用、分割线
- 支持超链接：Slash 命令 /link 或工具栏按钮

## Markdown 模式
- 使用纯文本编辑器 + 实时预览
- 支持标准 Markdown 语法

## Heading 样式
- H1: text-xl font-bold
- H2: text-lg font-semibold
- H3: text-base font-medium
