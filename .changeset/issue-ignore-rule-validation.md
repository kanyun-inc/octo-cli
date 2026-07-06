---
'octo-cli': minor
---

octo-cli 现在会更严格地校验 issue ignore rule 参数，避免把非法规则和无效数字发送给后端。

- MCP 的 `octo_issues_update` 现在要求 `TIME` 规则必须提供 `timeRule.endTime`
- MCP 与 CLI 都会拒绝与 `type` 不匹配的额外规则子对象或非法数字阈值参数
