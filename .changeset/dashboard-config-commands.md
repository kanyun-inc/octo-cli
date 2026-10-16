---
'octo-cli': minor
---

新增大盘配置读取与完整更新命令及内置 MCP 工具。

- 支持 `dashboards detail <dashboardId>` 读取配置，`dashboards update <dashboardId> --file <path>` 更新完整配置，`--file -` 可从标准输入读取。
- 新增 `octo_dashboards_detail` 和 `octo_dashboards_update`，保留嵌套 JSON、显式 null 与空数组，校验大盘 ID 和配置对象。
- 读取需要目标站点部署新增大盘读取 OpenAPI；更新沿用后端已有 PAT 归属限制及完整 PUT 语义。
