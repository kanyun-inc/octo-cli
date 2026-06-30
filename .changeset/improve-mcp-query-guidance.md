---
'octo-cli': patch
---

增强 MCP 工具的查询语法提示，避免 Agent 生成错误的 Octopus 查询条件。

- 在 MCP `query` 参数描述中补充 Octopus 搜索语法，明确使用 `field = value` 而不是 `field:value`
- 补充常用比较运算、逻辑运算、大小写规则、通配符规则和常用字段说明
- 补充 `from` / `to` 时间参数说明，明确默认时间范围和最近 1 小时查询的传参方式
