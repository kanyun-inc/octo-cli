---
'octo-cli': minor
---

新增告警详情和告警时序数据查询命令

- `alerts detail <alertId>`: 获取告警详情（规则条件、触发维度、状态等）
- `alerts timeseries <alertId>`: 获取告警检测时序数据（时间点、值、标签、条件状态）
- MCP 工具: `octo_alerts_detail`、`octo_alerts_timeseries`
