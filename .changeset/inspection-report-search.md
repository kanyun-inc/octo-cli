---
'octo-cli': minor
---

新增巡检报告查询能力，CLI 与 MCP 双端可用。

- 新增 `octo inspection reports` 命令，支持按关键词、任务 ID、任务组名、结果（normal/abnormal）和创建时间范围过滤，带分页与 json/table/jsonl 输出。
- 新增 `octo_inspection_report_search` MCP 工具，供 AI Agent 查询巡检报告。
