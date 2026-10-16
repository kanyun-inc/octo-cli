<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="octo-cli — 让 AI Agent 真正看懂你的系统。终端会话示例：把一个 Octopus RUM 页面 URL 贴给 Agent，Agent 转成 octo-cli 命令，统计出某接口请求 41 次、平均间隔 120ms，判定为循环请求而非重试。">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/octo-cli"><img src="https://img.shields.io/npm/v/octo-cli.svg" alt="npm version"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg" alt="要求 Node.js 22 或更高版本">
</p>

## 一次真实排查

你在 Octopus RUM 页面看到某个项目的 fetch 请求异常多，把 URL 原样贴给 Agent：

```text
> 帮我看看这个页面的数据
> https://octopus.zhenguanyu.com/#/rum-explorer?env=test&rumExplorerQuery=
> ei81ddb36uku%20AND%20resource.type%20%3D%20fetch&rumExplorerQueryEventType=
> resource&rumExplorerSelectedApplication=rush-app&time=1d
```

Agent 解析 URL 参数，转成 octo-cli 命令，统计请求频次：

```bash
$ npx octo-cli rum list -e test \
    -q "application.name = rush-app AND resource.type = fetch AND ei81ddb36uku" \
    -l 1d -n 500 -o json \
    | jq '.rumItems[].event.resource.url' | sort | uniq -c | sort -rn | head -10

     41 "GET /api/ai-stream-v2?projectId=ei81ddb36uku&..."
     38 "GET /api/ai-stream/heart?projectId=ei81ddb36uku"
     37 "POST /api/chat/ei81ddb36uku/.../generate-title"
      8 "POST /api/chat/ei81ddb36uku/conversations/..."
      4 "GET /api/projects"
      3 "GET /api/version/list"
#    ^^^ 三个接口 40 次 vs 正常请求 3-8 次，明显异常
```

接着自己深挖时间分布，确认是循环而不是重试：

```bash
$ npx octo-cli rum list -e test \
    -q "application.name = rush-app AND resource.type = fetch AND ei81ddb36uku" \
    -l 1d -n 500 -o json \
    | jq '[.rumItems[] | select(.event.resource.url | contains("ai-stream-v2"))
           | .timestamp] | sort | [range(1;length) as $i
           | .[$i] - .[$i-1]] | (add / length)'
#  → 平均间隔 120ms，集中在 3 秒内，这是循环不是重试

$ # Agent 定位到代码：chat-view.tsx
$ # useChat resume → 流结束 → onFinish → generateTitle + 刷新状态 → transport 重建 → 再次 resume
$ # 根因：resume 机制 + onFinish 回调 + 状态刷新形成无限循环
```

**从贴 URL 到定位根因，一次对话。** 你在页面上看到「这个项目请求数量不对」，Agent 用同一份数据确认了你的直觉，然后做了你不想手动做的事：统计频次、分析时间分布、追到代码里找出循环。

## 为什么不是「给 Agent 几个查询工具」就够了

给 AI Agent 几个可观测工具（查日志、查指标），然后期望它能排查生产问题，就像给人一个望远镜让他在城市里找路 —— 工具能用，但不知道往哪看。

可观测数据又多又杂：日志、链路、指标、告警、RUM、LLM Span、错误追踪、服务拓扑……分散在不同服务、不同环境、不同命名规则里。Agent 不知道「这个项目跑了哪些服务」「该查哪个环境」「上下游依赖是谁」，要么反复问你，要么瞎猜。

octo-cli 的解法是三层结构：**上下文**（这个项目跑了什么、依赖谁、该查哪个环境）→ **技能**（查询语法、排障流程）→ **工具**（CLI 命令与 43 个 MCP 工具）。三层齐了，才是「Agent 会 grep 日志」和「Agent 能排查问题」之间的差距。

<p align="center">
  <img src="./assets/readme/architecture.svg" width="100%" alt="octo-cli 的三层结构。第一层上下文：记录项目跑了哪些服务、依赖什么、该查哪个环境，由 Agent 自动生成并保鲜，0 人工维护。第二层技能：7 个领域 Skill 提供查询语法和排障流程，让 Agent 知道怎么查。第三层工具：CLI 命令与 43 个 MCP 工具，Agent 有了前两层才能精准用对工具。">
</p>

上下文文件不是手写的 —— Agent 通过**代码分析**（SDK 导入、服务配置）和**线上链路数据**（真实拓扑、入口、依赖）自动生成。链路数据反映的是生产环境实际在跑什么，比看代码靠谱。

**持续保鲜** —— 上下文不是一次性快照。项目在演进，Agent 在日常排查中如果发现数据和上下文对不上（新 service 出现、拓扑变了、接入了新 SDK、Issue 变了），会当场更新上下文文件。不需要人维护，Agent 自己保鲜。

## 快速开始

```bash
# 一条命令完成所有准备（保存凭证 + 全局安装 Skill）
npx octo-cli login --token <YOUR_PERSONAL_ACCESS_TOKEN>
```

> Token 获取方式：Octopus Web 页面左下角用户菜单 →「Access Token」→ 创建，复制 `oct_pat_xxx`。

然后在任意项目里，对 AI Agent 说 **「帮我接入 Octopus 可观测」**，Agent 会自动完成：

1. 运行 `npx octo-cli init`（生成上下文模板 + 安装项目 Skill）
2. 扫描代码（服务名、SDK、配置、环境变量）
3. 查询线上 Octopus 数据（链路拓扑、入口、RUM、Issue）
4. 把可观测上下文写入 `.claude/rules/octopus-observability.md`

此后这个项目里的所有 Agent 会话都会自动加载该上下文。生成的文件会告诉 Agent：项目部署了哪些服务、分别在什么环境、接入了哪些数据采集、服务拓扑和上下游依赖、用实际服务名填好的查询命令、已知问题和监控查询。

## 页面 URL 即查询入口

你在 Octopus 页面上看到一个问题，想让 Agent 帮你分析 —— 不需要翻译成查询语句，直接把 URL 贴给它（[上面的排查案例](#一次真实排查)就是这么开始的）。

Octopus 的 URL 参数是语义化的（`env`、`query`、`time`、`application`），Agent 天然能读懂，不需要额外代码。日志页面、链路页面、RUM 页面、告警页面、大盘页面 —— 任何 Octopus URL 都能直接贴。

这个能力的价值在于：**你在页面上看到的和 Agent 查到的是同一份数据。** 你和 Agent 之间有了共同的「指向能力」—— 你指着页面说「这里有问题」，Agent 立刻能看到同一个视角的数据，然后用它擅长的方式（关联日志、追踪链路、聚合分析）去深挖。

## 命令

所有查询命令共享这些选项：

| 选项 | 说明 | 示例 |
|------|------|------|
| `-l, --last <duration>` | 相对时间范围 | `15m`、`1h`、`2d`、`1w` |
| `--from` / `--to <time>` | 绝对时间 | 毫秒时间戳或 ISO 字符串 |
| `-e, --env <env>` | 环境 | `online`、`test` |
| `-q, --query <query>` | 查询语句 | `level = ERROR` |
| `-o, --output <fmt>` | 输出格式 | `json`、`table`、`jsonl` |
| `-n, --limit <n>` | 最大返回条数 | `50` |

```bash
octo-cli logs search -q "level = ERROR" -l 15m       # 搜索日志
octo-cli alerts search -s firing -p P0,P1 -l 1h      # 正在触发的 P0/P1 告警
octo-cli trace aggregate -a "duration:p95" -g service # 按服务聚合 P95 延迟
octo-cli services topo myapp                          # 服务拓扑图
```

<details>
<summary><b>按领域展开全部命令</b></summary>

### 日志

```bash
octo-cli logs search -q "level = ERROR" -l 15m          # 搜索日志
octo-cli logs search -q "service = myapp" --last 1h -n 100
octo-cli logs search --from 2024-01-01T00:00:00Z --to 2024-01-01T01:00:00Z

octo-cli logs aggregate -q "level = ERROR" -g service    # 按服务聚合
octo-cli logs aggregate -a "*:count" -g level:5 -l 30m   # 按 level 聚合 Top 5
```

### 告警

```bash
octo-cli alerts search -s firing -p P0,P1 -l 1h           # 正在触发的 P0/P1 告警
octo-cli alerts search --service myapp                    # 某个服务的所有告警（不传 -s 即全部状态）
octo-cli alerts search --rule-type metric -l 1h           # 只看指标类告警
octo-cli alerts detail <alertId>                          # 告警详情（含触发规则与维度）
octo-cli alerts timeseries <alertId> -l 1h                # 告警检测时序数据
octo-cli alerts rules --group-id 123                      # 搜索告警规则
octo-cli alerts rules -e online -p P0,P1                  # 按环境/优先级过滤规则
octo-cli alerts groups                                    # 查询全部告警组
octo-cli alerts rule-details --ids 101,102                # 批量查询规则详情（最多 100 个）
octo-cli alerts history <ruleId>                          # 操作记录及各次历史快照
octo-cli alerts create --file rule.json                   # 从 JSON 创建告警规则
octo-cli alerts update <ruleId> --file full-rule.json      # 完整更新已有规则
octo-cli alerts delete <ruleId>                           # 删除告警规则

# 处理已触发的告警
octo-cli alerts close <alertId>                          # 手动关闭
octo-cli alerts assign <alertId> --user-id 123            # 按用户 ID 指派
octo-cli alerts assign <alertId> --ldap alice             # 按 LDAP 指派
octo-cli alerts unassign <alertId>                       # 取消指派
octo-cli alerts claim <alertId>                          # 当前 PAT 用户认领

# 静默：只抑制某条已触发告警的通知
octo-cli alerts silence --rule-id 1 --alert-id 2 --duration 2h
octo-cli alerts unsilence <ruleId>

# 停用：让规则本身在时间段内不参与检测（不需要 alertId）
octo-cli alerts disable --rule-id 1 --duration 2h --reason "节假日维护"
octo-cli alerts disables <ruleId>                         # 查看该规则的停用记录
octo-cli alerts enable <disableId>                        # 删除停用记录（传停用记录 id）
```

`alerts history` 返回与页面操作记录一致的数组，每项包含 `id`、`alertRuleId`、`datetime`、`userVO`、`operationType`、`version` 和完整原始 `snapshot`。`operationType` 与 `version` 表示页面的变更详情，例如 `update` + `7` 对应“更新 V7”；启停记录可能没有版本和快照，用户信息也可能为空。该命令只读，不计算字段差异或恢复规则。

`alerts update` 使用完整 PUT：先通过 `alerts rule-details --ids <ruleId>` 获取当前详情，从返回数组中取出目标规则对象，修改后保存为 `full-rule.json`，再提交更新。文件是单个规则对象，包含当前完整的条件、通知和其他可编辑配置；不是数组，也不是局部补丁。`conditions` 中保留的旧条件须带原 ID，新增条件不带 ID，未提交的旧条件会被删除。规则类型不能修改。

`extInfo` 和 `alertAnalysisMetadata` 省略或为 null 时保留后端旧值；`closeAlert` 默认 false，设为 true 会同时关闭旧版本正在触发的告警。更新接口不提供版本冲突检查，提交前应重新读取当前配置，避免覆盖其他人的修改。成功返回更新后的规则详情。

告警指派至少提供 `--user-id` 或 `--ldap`，同时提供时 ID 优先。认领使用当前 PAT 用户身份，已有处理人的告警不能认领；关联 Case 的告警由 Case 管理处理人。

### 错误追踪 (Issue)

```bash
octo-cli issues search --status unresolved -l 1h         # 未解决的 Issue
octo-cli issues detail <issueId>                          # Issue 详情
octo-cli issues ai-analysis <issueId> \
  --context "发布后开始报错"                              # 启动 AI 分析并返回 sessionId
octo-cli issues assign --user-id 123 --ids id1,id2        # 按用户 ID 批量分配（--user 仍可用）
octo-cli issues assign --ldap alice --ids id1,id2 --source rum  # 按 LDAP 分配 RUM Issue
octo-cli issues unassign <issueId> --source log           # 取消单个 Issue 的分配
octo-cli issues update --ids id1,id2 -s resolved          # 解决 Issue
octo-cli issues merge --ids id1,id2                       # 合并 Issue，返回 mergeIssueId
octo-cli issues merge-children <issueId>                  # 查询 children 或 canonical parent
octo-cli issues unmerge <mergeIssueId> --ids child1       # 移出 child，可能触发 dissolve
octo-cli issues update --ids id1,id2 -s ignored \
  --ignore-type TIME \
  --ignore-end-time 2026-07-31T23:59:59Z              # 忽略到指定时间

octo-cli issues update --ids id1,id2 -s ignored \
  --ignore-type APPEAR_COUNT \
  --appear-count 100 \
  --start-timestamp 2026-07-06T00:00:00Z \
  --time-window-ms 3600000                            # 在时间窗口内按发生次数忽略

octo-cli issues update --ids id1,id2 -s ignored \
  --source log \
  --ignore-type USER_COUNT \
  --user-count 50 \
  --user-field uid \
  --start-timestamp 2026-07-06T00:00:00Z \
  --time-window-ms 3600000                            # 在时间窗口内按影响用户数忽略

octo-cli issues update --ids id1,id2 -s unresolved       # 取消忽略
```

`issues ai-analysis` 返回的 `sessionId` 仅用于关联分析任务。OpenAPI 没有查询分析状态或结果的接口，REST 会话查询接口需要 SSO，不能使用 OpenAPI token；分析结果最终通过企微通知。任务运行期间可安全重试，后端会通过 `running_key` 幂等保护避免重复执行。

`issues assign` 至少提供用户 ID（`--user-id`，兼容旧 `--user`）或 `--ldap`；`--user-id` 优先于 `--user`，ID 优先于 LDAP。`--ids` 传一个 ID 即分配单个 Issue。`issues unassign` 每次取消一个 Issue 的分配；两者的 `--source` 均为 `log|rum`，默认 `log`。取消分配要求 PAT 对应有效用户，后端还会验证 Issue 的数据源与合并状态；已合并 child 不能直接修改处理人。

### 错误追踪聚合规则

```bash
octo-cli issues aggregation-rules list --source log
octo-cli issues aggregation-rules create --source log --file step.json
octo-cli issues aggregation-rules create --source log --file process.json --parent-id 100
octo-cli issues aggregation-rules update 101 --source log --file process.json
octo-cli issues aggregation-rules disable 101 --source log
octo-cli issues aggregation-rules enable 101 --source log
octo-cli issues aggregation-rules duplicate 100 --source log
octo-cli issues aggregation-rules move 101 --source log --parent-id 200 --previous-id 201
octo-cli issues aggregation-rules delete 101 --source log
```

所有聚合规则命令必须显式指定 `--source log|rum`。`list` 返回有序的 `pipelineElementVOS` 树，后续操作使用其中的节点 ID。`create` / `update` 的文件是单个节点的可编辑内容，不包含 `issuePipelineElement` 外壳。步骤文件 `step.json`：

```json
{
  "pipelineType": "pipeline",
  "issuePipeline": {"name": "支付服务", "filter": "service = payment"}
}
```

规则文件 `process.json`：

```json
{
  "pipelineType": "process",
  "issuePipelineProcess": {
    "name": "运行时错误",
    "type": 0,
    "rule": "error.type:RuntimeException -> runtime-error"
  }
}
```

- `pipelineType=pipeline` 是步骤，`process` 是规则，两类配置互斥。规则类型 `0/1/2` 分别为 Fingerprint、错误栈预处理、栈帧深度；RUM 仅支持 `0`。DSL 原文提交给后端校验。
- 步骤最多两层，规则必须有父步骤。`--parent-id` 省略或为 `0` 表示顶层步骤；`--previous-id` 省略表示置于目标同级列表最前，提供时必须是目标父节点下的同级节点 ID。
- 更新完整替换节点可编辑内容，保持种类、位置和状态；步骤 `filter` 省略或 null 会清空筛选。`id/status/children/author/updateTime` 是输出字段；子树需逐个节点创建。
- `duplicate` 只复制步骤及后代，副本紧随源步骤；成功后重新查询树获取新 ID。`delete` 删除单个规则或空步骤，非空步骤需先删除子节点。
- 聚合规则写入要求 PAT 对应有效用户，且该用户 LDAP 满足后端 `issue-pipeline-white-list` 编辑权限；查询不要求编辑白名单。保存成功不代表采集或聚合运行实例已加载配置，实际生效仍需检查运行时。

### Case

```bash
octo-cli cases list --status todo --priority P1           # 待处理 Case
octo-cli cases create --name "线上故障" --group-id 1 --priority P0
octo-cli cases detail <caseId>                            # Case 详情
octo-cli cases link <caseId> --type alert --target-id 123 # 关联告警
octo-cli cases note <caseId> --text "已通知负责人"          # 添加备注
```

### 巡检 (Inspection)

```bash
octo-cli inspection reports -q db                         # 按关键词搜索巡检报告
octo-cli inspection reports --result abnormal -l 1d       # 近一天的异常报告
octo-cli inspection reports --task-id 7 --page 2 -n 20    # 按任务 ID 翻页
octo-cli inspection reports --task-group infra-db         # 按任务组名过滤
```

### 链路 (Trace) / 指标 (Metrics)

```bash
octo-cli trace search -q "service = myapp" -l 15m        # 搜索 Span
octo-cli trace aggregate -a "duration:p95" -g service     # 按服务聚合 P95 延迟

octo-cli metrics query "sum(http_requests{}.as_count)" -l 1h       # 时序查询
octo-cli metrics query "avg(cpu_usage{service=myapp})" --points 50  # 指定数据点数
octo-cli metrics point "sum(error_count{}.as_count)"                 # 单点查询
```

指标时序查询（`metrics query` / MCP `octo_metrics_query`）默认使用 UTC+8（北京时间）对齐日聚合边界，查询时间戳保持不变。

### 大盘配置

```bash
# 读取完整配置，默认输出可直接保存的 JSON 对象
octo-cli dashboards detail <dashboardId> > dashboard.json

# 编辑 dashboard.json 后提交完整配置
octo-cli dashboards update <dashboardId> --file dashboard.json

# 也可以从标准输入读取
cat dashboard.json | octo-cli dashboards update <dashboardId> --file -

# 保存后再次读取核对
octo-cli dashboards detail <dashboardId>
```

`detail` 返回保存的 `title/parent/time/variableList/widgetList/info` 配置及 `id/version/isSystem` 元信息，保留后端返回的嵌套结构、扩展字段、显式 `null` 和空数组。读取使用 `GET /infra-octopus-openapi/v1/dashboards/{id}`，需要目标站点先部署该新增 OpenAPI。

`update` 的文件必须是单个非空 JSON 对象。先读取，在完整配置上修改目标字段，再提交；它沿用既有 PUT，不是 PATCH，遗漏字段可能清空原内容。CLI 和 MCP 不自动读取合并、补默认值或重试请求。两条命令都支持 `-o json/table/jsonl`，需要保存后再提交时使用默认 `json`。

读写都使用当前配置的 PAT；读取按凭证租户和目录访问权限判断，读取成功不代表具备更新权限。已有更新接口只允许 PAT 所属用户修改其通过 PAT 创建或复制的大盘；`parent` 应沿用读取值，不能用于移动目录，`version` 不参与并发校验。更新返回 `id/title/parent`，完整保存结果需再次读取。读取和客户端转发保留扩展字段，但现有后端 PUT 仍按其配置 DTO 解析，不能保证契约之外的未知字段在保存后保留。

### 服务 / LLM / RUM / 事件 / 用户

```bash
octo-cli services list -l 1h                              # 列出活跃服务
octo-cli services entries myapp -l 1h                     # 服务入口列表
octo-cli services topo myapp                              # 服务拓扑图

octo-cli llm -l 1h -q "model.name = gpt-4"              # LLM 可观测
octo-cli rum list -e test -q "application.name = myapp" -l 1d   # RUM 会话
octo-cli rum detail <id>                                  # RUM 事件详情
octo-cli rum aggregate -q "type = view" -a "*:count" -g "view.name:10" -l 1h
octo-cli events -l 1d                                     # 部署事件
octo-cli events aggregate -a "*:count" -g "type:10" -l 1d
octo-cli users alice bob                                  # 按姓名搜索用户
```

</details>

<details>
<summary><b>命令速查表</b></summary>

| 命令 | 说明 |
|------|------|
| `login` | 配置凭证 + 全局安装 Skill |
| `init` | 项目接入：生成上下文模板 + 安装 Skill |
| `logs search` / `logs aggregate` | 搜索日志 / 日志聚合 |
| `alerts search` / `alerts rules` | 搜索告警 / 搜索告警规则 |
| `alerts detail` / `alerts timeseries` | 告警详情 / 检测时序数据 |
| `alerts groups` / `alerts rule-details` | 查询告警组 / 批量查询告警规则详情 |
| `alerts history` | 告警规则操作记录及历史快照 |
| `alerts create` / `alerts update` / `alerts delete` | 创建 / 完整更新 / 删除告警规则 |
| `alerts close` / `alerts assign` / `alerts unassign` / `alerts claim` | 手动关闭 / 指派 / 取消指派 / 认领告警 |
| `alerts silence` / `alerts unsilence` | 创建 / 解除告警静默（抑制单条告警通知） |
| `alerts disable` / `alerts disables` / `alerts enable` | 停用规则 / 查看停用记录 / 删除停用记录 |
| `issues search` / `issues detail` | 搜索 Issue / Issue 详情 |
| `issues ai-analysis` | 启动日志 Issue AI 分析；结果通过企微通知，sessionId 仅用于关联；不支持 RUM Issue |
| `issues assign` / `issues unassign` / `issues update` | 按用户 ID 或 LDAP 分配 / 取消单个分配 / 批量更新状态 |
| `issues aggregation-rules list/create/update/delete` | 查询聚合规则树 / 创建 / 完整更新 / 删除节点 |
| `issues aggregation-rules enable/disable/duplicate/move` | 启停 / 复制步骤 / 移动或排序节点 |
| `issues merge` / `issues unmerge` / `issues merge-children` | 合并 / 移出 child / 查询合并关系 |
| `cases list` / `cases create` | 查询 / 创建 Case |
| `cases detail` / `cases detail-key` | Case 详情 |
| `cases update` / `cases delete` | 更新或删除 Case |
| `cases link` / `cases unlink` | 关联或取消关联告警/Issue |
| `cases note` / `cases note-update` | 添加或修改 Case 备注 |
| `cases groups` / `cases group-create` | 查询或创建 Case 分组 |
| `inspection reports` | 搜索巡检报告（关键词 / 任务 / 任务组 / 结果 / 时间范围过滤） |
| `trace search` / `trace aggregate` | 搜索链路 Span / 链路聚合 |
| `metrics query` / `metrics point` | 指标时序查询 / 单点查询 |
| `services list` / `services entries` / `services topo` | 服务列表 / 入口列表 / 拓扑图 |
| `llm` | LLM Span 查询 |
| `rum list` / `rum detail` / `rum aggregate` | RUM 事件列表 / 详情 / 聚合 |
| `events` / `events list` / `events aggregate` | 事件查询 / 聚合（`list` 为默认子命令） |
| `dashboards detail` / `dashboards update` | 读取大盘完整配置 / 从 JSON 文件或 stdin 完整更新 |
| `users` | 用户搜索 |
| `mcp` / `mcp-install` | 启动 MCP Server / 一键注册到 Claude Code |

</details>

## Unix 管道

所有命令输出到 stdout，支持 `json` 和 `jsonl` 两种格式，天然适配 `jq`、`grep`、`sort`、`awk`。这不是附加功能，而是核心设计 —— 可观测数据的价值在于**组合和关联**，而不是一条条孤立地看。

```bash
# 按 ERROR 数量排序找出最严重的服务
octo-cli logs aggregate -q "level = ERROR" -g service:10 -l 1h -o json \
  | jq -r '.[] | select(.fields.service) | "\(.values["count(*)"]) \(.fields.service)"' \
  | sort -rn

# 告警 → 提取 service tag → 去重
octo-cli alerts search -s firing -l 1h -o json | jq -r '.[].tags[]?' | grep 'service:' | sort -u

# 逐条告警带优先级格式化
octo-cli alerts search -s firing -l 1h -o jsonl | jq -r '"[\(.priority)] \(.title)"'

# Issue 里 grep Redis 相关错误
octo-cli issues search --status unresolved -e test -l 7d -o json \
  | jq -r '.issues[].errorMsg' | grep -i redis

# 找出最慢的 API 请求
octo-cli trace search -q "service = myapp AND operation = http.server" -l 1h -n 50 -o json \
  | jq -r '.spanItems[] | "\(.duration)ms \(.name)"' | sort -rn | head -10
```

Agent 也是这么用的 —— 把输出 pipe 到 `jq` 做二次提取、pipe 到 `sort` 排序、pipe 到 `grep` 过滤。CLI 输出越干净，Agent 的组合能力越强。

## MCP Server

内置 stdio MCP Server，支持 Claude Code、Cursor 等 AI Agent 直接查询和管理 Octopus 数据。

```bash
# 前提：已执行 octo-cli login
npx octo-cli mcp-install
```

自动读取已保存的 Personal Access Token 并注册到 Claude Code。也可以手动配置：

```json
{
  "mcpServers": {
    "octo-mcp": {
      "command": "npx",
      "args": ["-y", "octo-cli", "mcp"],
      "env": {
        "OCTOPUS_TOKEN": "<your-personal-access-token>"
      }
    }
  }
}
```

<details>
<summary><b>MCP 工具列表</b></summary>

| 工具 | 说明 |
|------|------|
| `octo_logs_search` / `octo_logs_aggregate` | 搜索日志 / 日志聚合 |
| `octo_alerts_search` / `octo_alerts_rules_search` | 搜索告警 / 搜索告警规则 |
| `octo_alerts_detail` / `octo_alerts_timeseries` | 告警详情 / 检测时序数据 |
| `octo_alerts_groups_list` / `octo_alerts_rules_details_search` | 查询告警组 / 批量查询告警规则详情 |
| `octo_alerts_rules_history` | 告警规则操作记录及历史快照（只读，参数 `ruleId`） |
| `octo_alerts_rules_create` / `octo_alerts_rules_update` / `octo_alerts_rules_delete` | 创建 / 完整更新 / 删除告警规则 |
| `octo_alerts_close` / `octo_alerts_assign` / `octo_alerts_assign_cancel` / `octo_alerts_claim` | 手动关闭 / 指派 / 取消指派 / 认领告警 |
| `octo_alerts_silence_create` / `octo_alerts_silence_delete` | 创建 / 解除告警静默（抑制单条告警通知） |
| `octo_alerts_rule_disable_create` | 停用告警规则（规则本身不再检测） |
| `octo_alerts_rule_disable_list` / `octo_alerts_rule_disable_delete` | 查看 / 删除停用记录 |
| `octo_issues_search` / `octo_issues_detail` | 搜索 Issue / Issue 详情 |
| `octo_issues_ai_analysis` | 启动日志 Issue AI 分析；结果通过企微通知，sessionId 仅用于关联；不支持 RUM Issue |
| `octo_issues_assign` / `octo_issues_assign_cancel` / `octo_issues_update` | 按 ID 或 LDAP 批量分配 / 取消单个分配 / 批量更新状态 |
| `octo_issues_aggregation_rules_list` / `octo_issues_aggregation_rules_create` | 查询聚合规则树 / 创建节点 |
| `octo_issues_aggregation_rules_update` / `octo_issues_aggregation_rules_delete` | 完整更新 / 删除节点 |
| `octo_issues_aggregation_rules_status` | 启用或停用节点（`enable` 布尔值） |
| `octo_issues_aggregation_rules_duplicate` / `octo_issues_aggregation_rules_move` | 复制步骤及后代 / 移动或排序节点 |
| `octo_issues_merge` / `octo_issues_unmerge` | 合并 Issue / 从 merge Issue 移出 child |
| `octo_issues_merge_children` | 查询 merge children 或 frozen child 的 canonical parent |
| `octo_cases_list` / `octo_cases_create` | 查询 / 创建 Case |
| `octo_cases_detail` / `octo_cases_detail_by_key` | Case 详情 |
| `octo_cases_update` / `octo_cases_delete` | 更新或删除 Case |
| `octo_cases_link` / `octo_cases_unlink` | 关联或取消关联告警/Issue |
| `octo_cases_note_add` / `octo_cases_note_update` | 添加或修改 Case 备注 |
| `octo_cases_groups_all` / `octo_cases_group_create` | 查询或创建 Case 分组 |
| `octo_inspection_report_search` | 搜索巡检报告（关键词 / 任务 / 任务组 / 结果 / 时间范围过滤） |
| `octo_trace_search` / `octo_trace_aggregate` | 搜索链路 Span / 链路聚合 |
| `octo_metrics_query` / `octo_metrics_point` | 指标时序 / 单点查询 |
| `octo_services_list` / `octo_services_entries` / `octo_services_topology` | 服务列表 / 入口 / 拓扑 |
| `octo_llm_list` | LLM Span 查询 |
| `octo_rum_list` / `octo_rum_detail` / `octo_rum_aggregate` | RUM 事件查询 / 详情 / 聚合 |
| `octo_events_list` / `octo_events_aggregate` | 事件查询 / 聚合 |
| `octo_dashboards_detail` | 按 dashboardId 读取完整大盘配置，只读 |
| `octo_dashboards_update` | 按 dashboardId 和完整 dashboard 对象更新配置 |
| `octo_users_search` | 用户搜索 |

</details>

大盘工具 `octo_dashboards_detail` 仅接收正整数 `dashboardId`；`octo_dashboards_update` 接收 `dashboardId` 与非空完整配置对象 `dashboard`。读取工具标记为只读，更新工具标记为写入；更新后使用读取工具核对结果。

MCP 写工具沿用上述 CLI 的完整更新、数据源和权限语义。`octo_alerts_rules_update` 接收 `ruleId` 与完整 `rule` 对象；告警指派接收 `assigneeUserId` / `assigneeLdap`，Issue 分配接收 `userId` / `assigneeLdap`，ID 优先。聚合工具的 `dataSource` 必填，创建和更新的节点放在 `issuePipelineElement`，位置字段为 `parentElementId` / `previousElementId`。写入错误原样报告，不自动重试；成功后可通过详情或列表工具核对当前状态。

## 配套 Skill

面向特定 Octopus 领域的深度知识，`login` 和 `init` 时自动安装，也可单独安装：

```bash
npx reskill install github:kanyun-inc/octo-cli/skills/octopus-log-query -a claude-code cursor -y
```

| Skill | 领域 |
|-------|------|
| `octopus-log-query` | 日志搜索语法、绘图分析、日志生成指标、分词策略 |
| `octopus-metrics` | 指标类型（Count/Gauge/Histogram）、QL 语法、as_count/as_rate |
| `octopus-rum` | RUM 概念（Session/View/Action/Error）、Web SDK、Core Web Vitals |
| `octopus-llm-trace` | LLM Trace SDK（Java/TS/Python）、Span 类型、成本追踪 |
| `octopus-data-collection` | 日志/链路/指标采集（HTTP、Kafka、javaagent、Node.js、Python） |
| `octopus-openapi` | OpenAPI 签名（V1/V2）、SDK 集成、全量 HTTP 接口 |
| `octopus-web-sdk-helper` | Web SDK 排障、配置指导、Source Map 上传 |

## 安装与认证

**要求：** Node.js >= 22.0.0

```bash
npx octo-cli <command>          # 通过 npx 直接使用
npm install -g octo-cli         # 或全局安装，使用 octo 简写
```

octo-cli 仅支持 Personal Access Token（PAT）认证：

```bash
octo-cli login --token <YOUR_PERSONAL_ACCESS_TOKEN>

# 或通过环境变量
export OCTOPUS_TOKEN=<YOUR_PERSONAL_ACCESS_TOKEN>

# 可选：为所有 OpenAPI 请求附加自定义 Header（JSON 对象）
export OCTOPUS_EXTRA_HEADERS='{"X-Octopus-Tenant":"tenant-a"}'
```

> 旧版 Application Key 登录方式（`--app-id` / `--app-secret`、`OCTOPUS_APP_ID` / `OCTOPUS_APP_SECRET`）不再生效。请改用 `--token` 或 `OCTOPUS_TOKEN`。

## API 参考

octo-cli 封装了 Octopus OpenAPI，默认地址 `https://octopus-app.zhenguanyu.com`：

| 领域 | 接口 |
|------|------|
| 日志 | `/v1/logs/search`、`/v1/logs/aggregate` |
| 告警 | `/v1/alerts/search`、`/v1/alert/rules/search`、`/v1/alert/rules/groups`、`/v1/alert/rules/details/search`、`/v1/alert/rules`、`/v1/alert/rules/{ruleId}`、`/v1/alerts/{alertId}/{close,assign,assign/cancel,claim}`、`/v1/alerts/silences/*` |
| 告警规则历史 | `GET /v1/alert/rules/{ruleId}/history` |
| Issue | `/v1/log-error-tracking/issues/*`（含 batch-assign / assign / ai-analysis / merge / unmerge / merge-children） |
| 错误追踪聚合规则 | `/v1/error-tracking/process/pipelines`、`/{id}`、`/{id}/status`、`/duplicate`、`/move` |
| Case | `/v1/cases/*`、`/v1/cases/groups/*` |
| 巡检 | `/v1/inspection/reports/search` |
| 链路 | `/v1/trace/span/list`、`/v1/trace/aggregate` |
| 指标 | `/v1/metrics/query/timeseries`、`/v1/metrics/query/queryMetric` |
| 服务 | `/v1/apm/query/*`、`/v1/apm/topology/*` |
| LLM | `/v1/llm/span/list` |
| RUM | `/v1/rum/list`、`/v1/rum/{id}`、`/v1/rum/aggregate` |
| 事件 | `/v1/event/list`、`/v1/event/aggregate` |
| 大盘 | `/v1/dashboards/{id}`（读取 / 更新）；`/v1/dashboards`（底层客户端创建） |
| 用户 | `/v1/users/search` |

## 贡献

详见 [CONTRIBUTING.md](./CONTRIBUTING.md)，给 AI Agent 的速查见 [CLAUDE.md](./CLAUDE.md)。流程大致是：

1. 开分支、写代码 + 测试、`pnpm typecheck && pnpm lint && pnpm test && pnpm build` 全绿
2. 提 PR，点 [changeset-bot](https://github.com/apps/changeset-bot) 评论的链接，在浏览器里写一行 changeset 提交回 PR 分支（也可以本地 `pnpm changeset`）
3. 合入 `main` → CI 自动开一个 "chore: version packages" PR → 合并该 PR 即自动 `npm publish`，无需手动打 tag / 输 OTP

## License

MIT
