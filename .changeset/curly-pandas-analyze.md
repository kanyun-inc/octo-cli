---
'octo-cli': minor
---

新增日志 Issue AI 分析能力。

- 新增 `octo-cli issues ai-analysis <issueId>` 命令，支持通过 `--context` 补充分析上下文。
- 新增 `octo_issues_ai_analysis` MCP 工具；分析结果通过企微通知，返回的 `sessionId` 仅用于任务关联。
