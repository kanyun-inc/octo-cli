---
'octo-cli': patch
---

修复 `octo users` 命令报错「用户名称列表不能为空」的问题。

- `usersSearch` 请求体字段名从 `name` 改为 `names`，与后端 API 实际期望一致
- 同步修正 SKILL.md 中的错误示例（`"name"` → `"names"`）
