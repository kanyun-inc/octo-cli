---
'octo-cli': patch
---

OctoClient 所有请求带上 `User-Agent: octo-cli/<version> (node <ver>; <platform>)`，方便在网关日志里统计 CLI 调用量与版本分布。
