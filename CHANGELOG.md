# octo-cli

## 0.8.2

### Patch Changes

- f63e9e9: 支持通过 `OCTOPUS_EXTRA_HEADERS` 为所有 Octopus OpenAPI 请求附加自定义 Header。

  - `OCTOPUS_EXTRA_HEADERS` 接收 JSON 对象字符串，例如 `{"X-Octopus-Tenant":"tenant-a"}`
  - CLI 和 MCP 模式都会生效，因为二者最终都走同一个 `OctoClient`
  - 自定义 Header 与内置 Header 按大小写不敏感规则合并，避免污染 `Authorization`、`Content-Type`、`User-Agent` 等内置 Header

## 0.8.1

### Patch Changes

- 4534f99: 修复 `octo users` 命令报错「用户名称列表不能为空」的问题。

  - `usersSearch` 请求体字段名从 `name` 改为 `names`，与后端 API 实际期望一致
  - 同步修正 SKILL.md 中的错误示例（`"name"` → `"names"`）

## 0.8.0

### Minor Changes

- a882e44: 新增告警详情和告警时序数据查询命令

  - `alerts detail <alertId>`: 获取告警详情（规则条件、触发维度、状态等）
  - `alerts timeseries <alertId>`: 获取告警检测时序数据（时间点、值、标签、条件状态）
  - MCP 工具: `octo_alerts_detail`、`octo_alerts_timeseries`

## 0.7.5

### Patch Changes

- cf42e2d: OctoClient 所有请求带上 `User-Agent: octo-cli/<version> (node <ver>; <platform>)`，方便在网关日志里统计 CLI 调用量与版本分布。

## 0.7.4

### Patch Changes

- 9c6b991: 验证 npm Trusted Publishing (OIDC) 发布链路。

  - 无功能变更，仅触发一次 patch 发版以确认 GitHub Actions 通过 OIDC 成功发布到 npm 且带 provenance

## 0.7.3

### Patch Changes

- 8799e49: 修复 --from/--to 参数被 --last 默认值覆盖的问题

  - resolveTimeRange 中 --from/--to 优先级提升至 --last 之前
  - 修复 alerts search、issues search、trace search 等 11 个命令的时间范围参数失效问题

## 0.7.2

### Patch Changes

- 53f632d: fix: init 命令支持个人 Access Token 认证

  - init 凭据检查现在同时识别 config.token 和 OCTOPUS_TOKEN 环境变量
  - 错误提示更新为推荐 `login --token` 方式

## 0.7.1

### Patch Changes

- c73f056: 接入 changesets + GitHub Actions 自动发版流水线。

  - `main` 分支合入后，changesets action 自动开 "chore: version packages" PR 聚合改动
  - 合并 Version Packages PR 触发 `npm publish`，带 npm provenance
  - `feature-*` 分支在 `.changeset/pre.json` tag 为 `beta` 时支持 beta 预发布
  - 新增 `pnpm release` 脚本用于 CI 调用
  - 新增 CI workflow 在 PR 上跑 typecheck / lint / test / build
