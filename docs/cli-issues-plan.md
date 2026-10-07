# CLI 修复计划与验收记录

本轮来自 `kanyun-inc/octo-cli` 中 jianhong-li 提交的 12 个 open issues，代码基于 v1.6.0，在 `feature/cli-issues-and-help` 上迭代，先推送到 `jianhong-li/octo-cli`。2026-10-07 用户确认向源仓库提交第一阶段 PR；不重构主 skill 或子 skill 的组织，仅修正与当前 CLI 不一致的示例。

## 工作边界

CLI 的 help 承担命令、参数、默认值、限制、示例和输出契约；skill 后续只补最佳实践和任务工作流。无需额外依赖、skill 安装或项目初始化即可查询。保留原有命令与 JSON 响应结构，JSONL/table 修正为记录输出。

## 实施顺序

1. 参数与错误处理：RUM 环境、统一时间解析、Issue source 校验、环境/枚举/数值校验和干净的失败输出。
2. 分页与能力补齐：已由 client 支持的游标、方向、sort 值、排序、topology 入口过滤。
3. 聚合可信度：分组缺失提示、group limit 上限、分析字段语义。
4. 自解释 help：根命令、命令组、所有叶子命令，提供实际默认值、值域、示例和限制。
5. 回归测试、typecheck/lint/test/build、真实进程输出验证、changeset、提交到 fork feature 分支。

## Issue 对照

| Issue | 本轮处理 | 验证入口 |
| --- | --- | --- |
| [#47](https://github.com/kanyun-inc/octo-cli/issues/47) | JSONL 每行记录，table 按记录列显示，JSON 保留原始包装，分页提醒在 stderr | `src/output.test.ts` |
| [#48](https://github.com/kanyun-inc/octo-cli/issues/48) | 文档说明 record id 游标；补齐 scroll/sort 和 Trace sort 值；按确认评论实现 cursor 文件，分页元数据无需另请求 JSON | `src/cli-regressions.test.ts`、`src/cursor.test.ts` |
| [#49](https://github.com/kanyun-inc/octo-cli/issues/49) | RUM detail 增加显式/默认 env 和必填事件 timestamp，CLI/MCP 均携带参数，记录 id 做 URL 编码 | `src/cli-regressions.test.ts`、`src/mcp.test.ts` |
| [#50](https://github.com/kanyun-inc/octo-cli/issues/50) | `--at` 与范围时间共享 epoch ms/seconds/ISO 解析，非法输入在 HTTP 前失败 | `src/time.test.ts`、`src/cli-regressions.test.ts` |
| [#51](https://github.com/kanyun-inc/octo-cli/issues/51) | 非法环境报错；孤立 `--to` 报错；`alerts -s all` 是明确别名；有数据但未返回请求分组时警告 | `src/aggregate.test.ts`、`src/cli-regressions.test.ts` |
| [#52](https://github.com/kanyun-inc/octo-cli/issues/52) | async 顶层错误捕获、单行 stderr、退出码 1；`--json-errors` 保留 HTTP status/API code | `src/errors.test.ts` |
| [#53](https://github.com/kanyun-inc/octo-cli/issues/53) | assign/update 共用 log/rum 校验，shared client 也保护非 CLI 调用者 | `src/cli-regressions.test.ts` |
| [#54](https://github.com/kanyun-inc/octo-cli/issues/54) | 补 topology filters、scroll/sort；额外暴露 services list 的 service filter。源码确认 Issue search 固定最多 99 条且没有分页契约，见下方限制 | `src/cli-regressions.test.ts`、`src/output.test.ts` |
| [#55](https://github.com/kanyun-inc/octo-cli/issues/55) | 主 skill 工作流重构留到第二阶段；本轮 events help 已提供具体变更事件类型 | 后续 skill 验收 |
| [#56](https://github.com/kanyun-inc/octo-cli/issues/56) | 分析字段、group probe、操作/类型、JSONL、字段实名语义移入 help；主 skill 的本地路由留到第二阶段 | help 覆盖测试；后续 skill 验收 |
| [#57](https://github.com/kanyun-inc/octo-cli/issues/57) | 全命令层级 help；叶子参数值域、真实默认值、实例、语义、API 限制和完整手册入口 | `src/cli-regressions.test.ts` |
| [#58](https://github.com/kanyun-inc/octo-cli/issues/58) | 产品/协议手册与操作 skill 的目录分层留到第二阶段 | 后续 skill 验收 |

## 明确的接口限制

- **Issue search 分页**：2026-10-04 已核对 [错误追踪接口页](https://octopus-docs.zhenguanyu.com/1b42090d16b681a4b2b5f600cd9a7ba7) 和用户提供的后端源码。请求对象没有 limit/page/scroll，Logic 固定查询 100 条并最多返回 99 条，额外一条仅用于判断 hasMore。help 与 JSONL/table 警告说明截断限制及缩小查询窗口的办法。需要后端新增分页契约后才能完成 #54 的这一项。
- **分组缺失**：可能是字段不可分组，也可能是当前匹配记录不含此字段。因此使用警告而非认定字段非法；已知零条总计和空数组不告警。不额外请求巨大的字段目录，目录成员也不能证明可分组。
- **服务端掩盖故障**：HTTP 失败/API 非零 code 可靠报错；若服务端输出 code=0 的正常空响应，CLI 无法区分内部故障与真实零命中。不声称修复了 #42 的所有后端行为。
- **限流**：本轮文档化 HTTP 429/API -17，但不自动重试，尤其避免重放写操作。
- **线上验证范围**：本轮使用网络 IO mock 与本地 HTTP 服务验证请求和实际 CLI 输出，不对生产数据执行写入。线上跨页结果的完整性仍取决于后端游标实现。

## 第二阶段方向

把主 skill 收敛为短的 CLI 使用/工作流指导：从用户给出的错误/告警/日志/trace id 进入，固定时间窗与环境，确认错误签名，再看 Pod/实例分布和变更时间线；仅证据需要时扩展链路/拓扑。移除必跑的全项目 onboarding、固定宏观巡检路径和重复的 flag 清单。产品/协议参考与操作工作流分层，必要参考通过本地相对链接发现。具体实现留待第一阶段验收后进行。

## 本轮验证

- `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build` 全部通过；cursor 契约补充后为 10 个测试文件，288 个测试（原有 171 个，新增 117 个）。
- 构建后的真实 CLI 通过本地 HTTP 服务验证：无认证/请求的 help、JSONL 逐记录、JSON 包装和游标透传、RUM detail env、metric epoch 参数、API 错误的普通/JSON stderr、HTTP 前非法环境校验、嵌套命令解析错误的退出码和 JSON 格式。
- 真实进程验收发现 Commander 的子命令需要分别设置退出捕获器；已修正并增加嵌套解析错误回归测试。
- `git diff --check` 通过；包含 minor changeset，不手动修改版本号。

## 官方 OpenAPI 对照补充（2026-10-04）

用户提供 [官方入口](https://octopus-docs.zhenguanyu.com/1b42090d16b681749335c62b3ed505be) 后，已核对错误追踪、日志、Trace、LLM、RUM 和事件接口正文：

- Issue search/detail 支持 dataSource=log|rum，未传默认 log；此前 client/CLI 未暴露，现补 `--source` 与内置 MCP 的 dataSource。search 的 legacy service 参数也可传，help 推荐 query 字段过滤。
- 日志翻页使用最后一条记录 id；serializedSortValues 通过独立参数与 scrollId 配合。单独传 sort 值会在 HTTP 前报错。
- Trace 翻页使用记录 id，order 按 Span 结束时间排序。
- LLM/RUM/事件的 scrollType=pre|next、serializedSortValues 和 sort 对象与已补齐能力一致；文档没有声明 scrollType 默认值，help 改为要求翻页时明确指定。
- sort operationEnum 的文档值域补入 help；自定义 percentile 还需要当前 CLI 未暴露的额外参数，help 明确限制并推荐具名 percentile。
- RUM 文档示例没有列出 detail 的 env 参数；#49 的真实 400 证明当前服务要求 env，保留实测修复。接口文档与线上行为存在差异时在此记录，不从示例缺字段反推字段不需要。
- 所有 help 层级加入官方入口/领域链接；不修改主 skill 和子 skill。
- 官方文档对照补充新增 5 个回归用例，234 个测试及四项检查通过；实际 CLI 进程还验证了 RUM Issue search 的 dataSource 和 detail 的 query 参数、Issue ID URL 编码。

## 后端源码对照补充（2026-10-04）

- 只读核对后端默认分支的 OpenAPI Controller、请求对象、Logic 与既有测试；未修改后端或执行部署。源码契约尚未与生产部署版本逐一核对。
- Issue search 没有隐藏的分页字段，hasMore 仅标记超过 99 条的截断；不添加无法工作的 CLI 翻页参数。
- RUM detail Controller 同时要求 env 和 timestamp，按 timestamp 前后各一小时设置查询范围。此前仅依据 #49 报错补 env 不完整，现增加必填 `--timestamp`，支持毫秒/秒/ISO；MCP 同样要求 epoch 毫秒 timestamp，shared client 校验缺失或非法数值。
- help/README 提供从 RUM list 记录取得 id/timestamp 的流程；不使用当前时间默认值。changeset 记录 RUM detail 参数变化。
- 内部源码地址和专有实现不写入开源仓库，只记录 CLI 所需的接口行为。
- 新增 6 个回归用例，240 个测试通过。构建后的真实进程验证 RUM 秒时间转换为毫秒、缺少 timestamp 的 JSON 错误且不发 HTTP、无认证依赖的 detail help，以及 Issue 截断时 stdout 逐记录和 stderr 的上限提示。

## Cursor 文件契约补充（2026-10-04）

实现依据：[用户确认的 #48 评论](https://github.com/kanyun-inc/octo-cli/issues/48#issuecomment-5981320092)。

- 日志、Trace、LLM、RUM、事件的列表查询可通过 `--cursor-file` 写单行 JSON，与 json/jsonl/table 共用。只写不自动读取；Issue search 不支持。
- 每次成功均原子覆盖；终页保留 hasMore=false/count 并清除旧游标。接口没有完整性字段时写 hasMore=null，不根据记录数推断；未知空页不带游标。
- 日志/Trace 与 next 取最后一条，pre 取第一条；sort 值与 id 同源，原样保存。Trace client/CLI/MCP 补透传 serializedSortValues。
- HTTP/API 或文件失败均非零退出；临时文件失败时清理，旧文件不变。文件成功写入后才输出数据；脚本只在退出码 0 后读元数据。父目录必须已存在，各查询独立使用 cursor 文件。
- help/README 说明三态、成功与失败行为、固定绝对窗口和排序方向、显式参数续页、可选字段存在性判断；JSONL stdout 不掺入 metadata。
- 新增 48 个回归用例，288 个测试及四项检查通过。构建后的实际 CLI 进程验证每页一次请求、JSONL 逐记录、续页参数与固定窗口、终页/未知空页覆盖、pre 边界、Trace sort 值、HTTP 失败和真实目录权限导致的文件失败保留旧文件，以及无残留临时文件。原有实际进程 smoke 同样通过。

## 第一阶段 PR 前复查（2026-10-07）

- Metric QL help 补充 `by` 归属、正反例、9 类场景、两级 labelList/values 解析和指标发现线索；语法失败后追加定向 `by` / PromQL `=~` 提示，保留原始错误、非零退出码和空 stdout，JSON 错误可选带 `hints`。
- 清理内置 MCP 工具描述／参数示例及主 skill 中的 6 处旧 `.as_count` 示例，统一为 `as_count(空间聚合 + by)`；主 skill 的 RUM detail 加列表 timestamp，部署事件示例使用前缀通配，不改变整体工作流或子 skill 组织。
- 两个新增 MCP 回归用例从工具元数据取得真实示例，验证按原样发送并保留分组响应；全量 351 个测试、typecheck、lint、build 通过。历史上的 288 等数字是各阶段验证快照，不代表当前总数。
- 原有实际 CLI 进程／cursor smoke 和构建后 MCP stdio 的时序／点查分组查询均通过。
- 严格 Codex skill 校验器提示主 skill 原有 `version/author/tags/user-invocable/argument-hint` frontmatter 不在其允许列表；已确认与上游 main 基线完全相同，此次 frontmatter 不变，兼容性调整留到第二阶段。
- 后续保留：#54 的 Issue 分页依赖后端；#55/#58 及 #56 的主 skill 路由／工作流部分仍未完成；限流退避、日志时间分桶、指标名称目录和保留期警告尚未实现。独立 OCT-MCP 的 `octopus_*` Java 工具问题不属于本仓库 `octo_*` 服务。
