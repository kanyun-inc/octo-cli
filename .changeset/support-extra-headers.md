---
'octo-cli': patch
---

支持通过 `OCTOPUS_EXTRA_HEADERS` 为所有 Octopus OpenAPI 请求附加自定义 Header。

- `OCTOPUS_EXTRA_HEADERS` 接收 JSON 对象字符串，例如 `{"X-Octopus-Tenant":"tenant-a"}`
- CLI 和 MCP 模式都会生效，因为二者最终都走同一个 `OctoClient`
- 自定义 Header 与内置 Header 按大小写不敏感规则合并，避免污染 `Authorization`、`Content-Type`、`User-Agent` 等内置 Header
