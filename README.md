<div align="center">

# octo-cli

**让 AI Agent 真正看懂你的系统 —— 不只是工具，更是上下文**

[![npm version](https://img.shields.io/npm/v/octo-cli.svg)](https://www.npmjs.com/package/octo-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

---

## 为什么需要 octo-cli

给 AI Agent 几个可观测工具（查日志、查指标），然后期望它能排查生产问题，就像给人一个望远镜让他在城市里找路 —— 工具能用，但不知道往哪看。

可观测数据又多又杂：日志、链路、指标、告警、RUM、LLM Span、错误追踪、服务拓扑……分散在不同服务、不同环境、不同命名规则里。Agent 不知道「这个项目跑了哪些服务」「该查哪个环境」「上下游依赖是谁」，要么反复问你，要么瞎猜。

**octo-cli 的解法是三层结构：**

```
┌─────────────────────────────────────────────────────────────┐
│  上下文 (.claude/rules/octopus-observability.md)              │
│  "这个项目跑了 service X（test 环境）和 Y（线上环境），                │
│   X 依赖 Redis + PostgreSQL + service Z，查询要用 -e test"       │
│  → Agent 遇到排查任务时自动加载，知道往哪看                         │
├─────────────────────────────────────────────────────────────┤
│  技能 (Skill)                                                │
│  查询语法、排障流程（告警→日志→链路→拓扑）、接入引导                    │
│  → Agent 知道怎么查，不只是知道有工具                               │
├─────────────────────────────────────────────────────────────┤
│  工具 (CLI + MCP)                                            │
│  npx octo-cli logs search / trace search / metrics query ... │
│  → Agent 有了上下文和技能，才能精准地用对工具                        │
└─────────────────────────────────────────────────────────────┘
```

**上下文 + 技能 + 工具**，这是「Agent 会 grep 日志」和「Agent 能排查问题」之间的差距。

## 快速开始

```bash
# 一条命令完成所有准备（保存凭证 + 全局安装 Skill）
npx octo-cli login --app-id <APP_ID> --app-secret <APP_SECRET>

# 然后在任意项目里，对 AI Agent 说：
#   "帮我接入 Octopus 可观测"
#
# Agent 会自动完成：
#   1. 运行 npx octo-cli init（生成上下文模板 + 安装项目 Skill）
#   2. 扫描代码（服务名、SDK、配置、环境变量）
#   3. 查询线上 Octopus 数据（链路拓扑、入口、RUM、Issue）
#   4. 将可观测上下文写入 .claude/rules/
#
# 此后，这个项目里的所有 Agent 都能精准查询 Octopus 数据。
```

## 工作原理

上下文文件不是手写的 —— Agent 通过**代码分析**（SDK 导入、服务配置）和**线上链路数据**（真实拓扑、入口、依赖）自动生成。链路数据反映的是生产环境实际在跑什么，比看代码靠谱。

一次对话完成接入，之后每次 Agent 会话自动加载上下文。

## 功能特性

- **Agent 原生接入** —— `login` 全局装 Skill，`init` 生成项目上下文，Agent 自己填写
- **全量 Octopus OpenAPI 覆盖** —— 日志、告警、Issue、链路、指标、服务、LLM、RUM、事件、大盘
- **人性化时间范围** —— `--last 15m`、`--last 2h`、`--last 7d`
- **多种输出格式** —— `--output json`、`--output table`、`--output jsonl`
- **MCP Server** —— 内置 stdio MCP Server，支持 Claude Code、Cursor 等
- **安全鉴权** —— OC-HMAC-SHA256-2 请求签名，凭证本地存储
- **配套 Skill** —— 8 个深度 Skill，覆盖查询语法、指标 QL、RUM、LLM 追踪、数据采集

## 安装

**要求：** Node.js >= 22.0.0

```bash
npx octo-cli <command>          # 通过 npx 直接使用
npm install -g octo-cli         # 或全局安装，使用 octo 简写
```

## 认证

1. 在 Octopus 平台创建 ApplicationKey
2. 获取 `appId` 和 `appSecret`

```bash
# 登录（同时全局安装 Skill）
octo-cli login --app-id <APP_ID> --app-secret <APP_SECRET>

# 或通过环境变量（CI/CD、容器场景）
export OCTOPUS_APP_ID=<APP_ID>
export OCTOPUS_APP_SECRET=<APP_SECRET>
```

## 项目接入

```bash
# 在项目目录下执行：
octo-cli init
# → 生成 .claude/rules/octopus-observability.md（带 AGENT 指令的模板）
# → 安装项目级 Skill
# → Agent 读取模板 → 扫描代码 → 查询 Octopus → 填写上下文
```

生成的上下文文件会告诉 Agent：
- 这个项目部署了哪些服务，分别在什么环境
- 接入了哪些数据采集（日志、链路、指标、RUM、LLM）
- 用实际服务名填好的查询命令
- 服务拓扑和上下游依赖（来自线上链路数据）
- 已知问题和监控查询

## 命令

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
octo-cli alerts search -s firing -p P0,P1 -l 1h         # 正在触发的 P0/P1 告警
octo-cli alerts search --service myapp -s all             # 某个服务的所有告警
octo-cli alerts rules --group-id 123                      # 搜索告警规则
octo-cli alerts silence --rule-id 1 --alert-id 2 --duration 2h  # 静默告警
```

### 错误追踪 (Issue)

```bash
octo-cli issues search --status unresolved -l 1h         # 未解决的 Issue
octo-cli issues detail <issueId>                          # Issue 详情
octo-cli issues assign --user 123 --ids id1,id2          # 分配 Issue
octo-cli issues update --ids id1,id2 -s resolved          # 解决 Issue
```

### 链路 (Trace)

```bash
octo-cli trace search -q "service = myapp" -l 15m        # 搜索 Span
octo-cli trace aggregate -a "duration:p95" -g service     # 按服务聚合 P95 延迟
```

### 指标 (Metrics)

```bash
octo-cli metrics query "sum(http_requests{}.as_count)" -l 1h       # 时序查询
octo-cli metrics query "avg(cpu_usage{service=myapp})" --points 50  # 指定数据点数
octo-cli metrics point "sum(error_count{}.as_count)"                 # 单点查询
```

### 服务 / APM

```bash
octo-cli services list -l 1h                              # 列出活跃服务
octo-cli services entries myapp -l 1h                     # 服务入口列表
octo-cli services topo myapp                              # 服务拓扑图
```

### LLM / RUM / 事件

```bash
octo-cli llm -l 1h -q "model.name = gpt-4"              # LLM 可观测
octo-cli rum list -e test -q "application.name = myapp" -l 1d   # RUM 会话
octo-cli rum detail <id>                                  # RUM 事件详情
octo-cli events -l 1d                                     # 部署事件
```

### 用户

```bash
octo-cli users alice bob                                  # 按姓名搜索用户
```

## 命令速查

| 命令 | 说明 |
|------|------|
| `login` | 配置凭证 + 全局安装 Skill |
| `init` | 项目接入：生成上下文模板 + 安装 Skill |
| `logs search` | 搜索日志 |
| `logs aggregate` | 日志聚合 |
| `alerts search` | 搜索告警 |
| `alerts rules` | 搜索告警规则 |
| `alerts silence` | 创建告警静默 |
| `issues search` | 搜索错误追踪 Issue |
| `issues detail` | Issue 详情 |
| `issues assign` | 批量分配 Issue |
| `issues update` | 批量更新 Issue 状态 |
| `trace search` | 搜索链路 Span |
| `trace aggregate` | 链路聚合 |
| `metrics query` | 指标时序查询 |
| `metrics point` | 指标单点查询 |
| `services list` | 服务列表 |
| `services entries` | 服务入口列表 |
| `services topo` | 服务拓扑图 |
| `llm` | LLM Span 查询 |
| `rum list` | RUM 事件列表 |
| `rum detail` | RUM 事件详情 |
| `events` | 事件查询 |
| `users` | 用户搜索 |
| `mcp` | 启动 MCP Server |

## 通用选项

所有查询命令支持：

| 选项 | 说明 | 示例 |
|------|------|------|
| `-l, --last <duration>` | 相对时间范围 | `15m`、`1h`、`2d`、`1w` |
| `--from <time>` | 绝对起始时间 | 毫秒时间戳或 ISO 字符串 |
| `--to <time>` | 绝对结束时间 | 毫秒时间戳或 ISO 字符串 |
| `-e, --env <env>` | 环境 | `online`、`test` |
| `-q, --query <query>` | 查询语句 | `level = ERROR` |
| `-o, --output <fmt>` | 输出格式 | `json`、`table`、`jsonl` |
| `-n, --limit <n>` | 最大返回条数 | `50` |

## 管道

输出对 stdout 友好，可以和 `jq`、`grep` 等 Unix 工具组合：

```bash
# 按服务统计错误数
octo-cli logs aggregate -q "level = ERROR" -g service -o json | jq '.[].fields.service'

# 触发中的告警标题
octo-cli alerts search -s firing -o jsonl | jq -r '.title'

# 统计错误 Span 数量
octo-cli trace search -q "status = error" -o jsonl | wc -l
```

## MCP Server

内置 MCP Server，支持 Claude Code、Cursor 等 AI Agent 直接调用。

### 配置

在 MCP 配置文件中添加（如 `~/.claude/claude_desktop_config.json`）：

```json
{
  "mcpServers": {
    "octo-mcp": {
      "command": "npx",
      "args": ["-y", "octo-cli", "mcp"],
      "env": {
        "OCTOPUS_APP_ID": "<your-app-id>",
        "OCTOPUS_APP_SECRET": "<your-app-secret>"
      }
    }
  }
}
```

### MCP 工具列表

| 工具 | 说明 |
|------|------|
| `octo_logs_search` | 搜索日志 |
| `octo_logs_aggregate` | 日志聚合 |
| `octo_alerts_search` | 搜索告警 |
| `octo_issues_search` | 搜索错误追踪 Issue |
| `octo_trace_search` | 搜索链路 Span |
| `octo_metrics_query` | 指标时序查询 |
| `octo_services_list` | 服务列表 |
| `octo_services_topology` | 服务拓扑图 |
| `octo_llm_list` | LLM Span 查询 |
| `octo_rum_list` | RUM 事件查询 |
| `octo_events_list` | 事件查询 |

## 配套 Skill

面向特定 Octopus 领域的深度知识，`login` 和 `init` 时自动安装，也可单独安装：

```bash
npx reskill install github:kanyun-inc/octo-cli/skills/octopus-log-query -a claude-code cursor -y
```

| Skill | 领域 |
|-------|------|
| `octo` | CLI 命令、查询语法、接入引导、排障流程 |
| `octopus-log-query` | 日志搜索语法、绘图分析、日志生成指标、分词策略 |
| `octopus-metrics` | 指标类型（Count/Gauge/Histogram）、QL 语法、as_count/as_rate |
| `octopus-rum` | RUM 概念（Session/View/Action/Error）、Web SDK、Core Web Vitals |
| `octopus-llm-trace` | LLM Trace SDK（Java/TS/Python）、Span 类型、成本追踪 |
| `octopus-data-collection` | 日志/链路/指标采集（HTTP、Kafka、javaagent、Node.js、Python） |
| `octopus-openapi` | OpenAPI 签名（V1/V2）、SDK 集成、全量 HTTP 接口 |
| `octopus-web-sdk-helper` | Web SDK 排障、配置指导、Source Map 上传 |

## API 参考

octo-cli 封装了 [Octopus OpenAPI](https://www.notion.so/OpenAPI-1b42090d16b681749335c62b3ed505be)：

| 领域 | 接口 |
|------|------|
| 日志 | `/v1/logs/search`、`/v1/logs/aggregate` |
| 告警 | `/v1/alerts/search`、`/v1/alert/rules/search`、`/v1/alert/rules`、`/v1/alerts/silences/*` |
| Issue | `/v1/log-error-tracking/issues/*` |
| 链路 | `/v1/trace/span/list`、`/v1/trace/aggregate` |
| 指标 | `/v1/metrics/query/timeseries`、`/v1/metrics/query/queryMetric` |
| 服务 | `/v1/apm/query/*`、`/v1/apm/topology/*` |
| LLM | `/v1/llm/span/list` |
| RUM | `/v1/rum/list`、`/v1/rum/{id}`、`/v1/rum/aggregate` |
| 事件 | `/v1/event/list` |
| 大盘 | `/v1/dashboards`（CRUD） |
| 用户 | `/v1/users/search` |

鉴权：OC-HMAC-SHA256-2 请求签名。默认地址：`https://octopus-app.zhenguanyu.com`。

## License

MIT
