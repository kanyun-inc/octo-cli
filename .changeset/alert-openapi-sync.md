---
'octo-cli': minor
---

修复告警模块与 OpenAPI 文档的偏差，并补齐告警规则停用（disable）接口。

三个已确认的线上问题（均已用真实 API 复现和验证）：

- **带 query 的 GET 请求签名错误**：path 与 query 未分开签名、query 未按字母序排序，导致 `octo alerts timeseries` 一直返回 `401 Signature error`。现按签名规范拆分并排序，该命令恢复可用。
- **`alerts rules` 的环境/优先级过滤器完全失效**：后端 VO 字段是复数数组 `envs`/`priorities`，此前发送单数 `env`/`priority`，被静默忽略并返回未过滤结果（传一个不存在的环境值仍返回全量）。现已改为复数数组，CLI 的 `-e`/`-p` 支持逗号分隔多值。
- **`alerts silence` 完全不可用**：`scope` 发送大写 `ALL`/`SPECIFY`，被后端拒绝（400「静默范围不能为空」）。现改为小写 `all`/`specify`，并保留对大写输入的兼容转换。

新增告警规则停用能力（停用作用于规则本身，与只抑制单条告警通知的静默不同）：

- CLI：`octo alerts disable`、`octo alerts disables <ruleId>`、`octo alerts enable <disableId>`
- MCP：`octo_alerts_rule_disable_create`、`octo_alerts_rule_disable_list`、`octo_alerts_rule_disable_delete`

其他对齐：

- `alerts search` 新增 `--rule-type` 与 `--page`，MCP 同步新增 `alertRuleType`、`pageNo`
- `alerts search` 不再默认发送 `status=all`（文档明确该字面量非法，此前依赖后端枚举解析失败的兜底行为）；不传即查全部状态
- `silence` / `disable` 新增 `--specify-groups` 以支持按维度分组的范围
- 修正 DELETE 请求体为 `0` 时被当作 falsy 丢弃的边界问题

同步修正 README 与 skills 文档中会误导调用方的描述：`scope` 标为大写、告警规则过滤字段写成单数、示例使用 `-s all`，并补充停用接口与带 query 的 GET 签名要求。

MCP schema 保持向后兼容，未删除任何已发布的参数或枚举值：

- `octo_alerts_rules_search` 新增 `envs`/`priorities`（数组），原 `env`/`priority` 标记为 deprecated 但仍可用，会被自动合并进复数字段
- `octo_alerts_search` 的 `status` 保留 `all`，等价于不传
- `octo_alerts_silence_create` 的 `scope` 同时接受 `all`/`specify` 与旧的 `ALL`/`SPECIFY`
