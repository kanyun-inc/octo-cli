# octo-cli

## 1.0.0

### Major Changes

- 84e6528: 移除 Application Key 登录方式，octo-cli 仅支持 Personal Access Token 认证。

  - `login` 仅保留 `--token`
  - CLI 与 MCP 不再读取 `OCTOPUS_APP_ID` / `OCTOPUS_APP_SECRET` 或配置文件中的 `app_id` / `app_secret`
  - 使用 Application Key 的现有用户需要设置 `OCTOPUS_TOKEN`，或重新执行 `octo-cli login --token <TOKEN>`

## 0.11.0

### Minor Changes

- daa851a: 修复告警模块与 OpenAPI 文档的偏差，并补齐告警规则停用（disable）接口。

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

## 0.10.0

### Minor Changes

- 3fbc150: octo-cli 现在会更严格地校验 issue ignore rule 参数，避免把非法规则和无效数字发送给后端。

  - MCP 的 `octo_issues_update` 现在要求 `TIME` 规则必须提供 `timeRule.endTime`
  - MCP 与 CLI 都会拒绝与 `type` 不匹配的额外规则子对象或非法数字阈值参数

## 0.9.0

### Minor Changes

- ddbbc38: Add OpenAPI Case support across CLI, MCP tools, client wrappers, docs, and tests.

## 0.8.3

### Patch Changes

- 31ecc4d: 增强 MCP 工具的查询语法提示，避免 Agent 生成错误的 Octopus 查询条件。

  - 在 MCP `query` 参数描述中补充 Octopus 搜索语法，明确使用 `field = value` 而不是 `field:value`
  - 补充常用比较运算、逻辑运算、大小写规则、通配符规则和常用字段说明
  - 补充 `from` / `to` 时间参数说明，明确默认时间范围和最近 1 小时查询的传参方式

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
