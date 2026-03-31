---
name: agent-cli-design
description: 如何设计一个 Agent 能真正用起来的 CLI 工具。不是技术实现指南，而是"工具怎么配合上下文和技能让 Agent 有效工作"的设计方法论。从 octo-cli 实践中提炼。触发："设计 CLI"、"给 Agent 做工具"、"xxx-cli 怎么做"、"Agent 工具设计"。
version: 1.0.0
author: kris
tags:
  - cli
  - agent
  - design
  - methodology
user-invocable: true
argument-hint: "设计一个 xxx-cli"
allowed-tools: Bash(*), Read, Write, Edit, Glob, Grep
---

# 给 Agent 造趁手的 CLI —— 设计方法论

## 核心问题

给 Agent 一堆 API 工具，它不会用。不是工具不好，是它不知道往哪查、怎么查、查到了怎么关联。

**工具只是最后一环。** 你得先解决两个前置问题：

1. **上下文** —— Agent 对这个项目的了解（跑了哪些服务、什么环境、上下游是谁）
2. **技能** —— Agent 对这个领域的了解（查询语法、排障流程、常见模式）

三层结构：**上下文 → 技能 → 工具**。工具是最容易做的，上下文是最容易忽略的。

## 设计原则

### 1. 工具是给 Agent 用的，不只是给人用

人用 CLI 会看 `--help`、翻文档、试错。Agent 不会。它需要：

- **可预测的输出** —— JSON stdout，不要混杂 log 和 spinner
- **管道友好** —— 输出能直接 pipe 到 `jq`、`grep`、`sort`，Agent 天然会组合 Unix 工具
- **错误信息机器可读** —— 非 0 退出码 + stderr 错误信息，不要只 `console.log("出错了")`
- **默认值合理** —— Agent 不应该每次都要传 20 个参数才能查到东西

### 2. 一条命令完成 onboarding

新用户（人或 Agent）的第一步应该尽可能少：

```bash
# 最多两步
npx xxx-cli login --key <KEY>      # 保存凭证 + 自动装 skill
npx xxx-cli init                   # 生成项目上下文 + 装项目级 skill
```

`login` 应该自动做的事：
- 保存凭证到 `~/.xxx-cli/config.json`
- 全局安装 skill（`npx reskill install ... -g`），这样所有项目的 Agent 都知道这个工具
- 提示可选的 MCP 安装（`npx xxx-cli mcp-install`）

`init` 应该自动做的事：
- 生成 `.claude/rules/xxx-observability.md`（或对应领域的上下文文件）
- 安装项目级 skill
- 输出指引，告诉 Agent 下一步该做什么

### 3. 上下文文件是给 Agent 写的，不是给人填的

`init` 生成的模板不应该是人填的表格，而是 Agent 的分析指令：

```markdown
<!-- AGENT: 扫描 package.json 找到服务名，查线上数据验证，填写到下面 -->
```

Agent 的优势是扫代码 + 调 API + 交叉验证。人的优势是判断和决策。让各自做擅长的事。

模板里应该按项目类型给出具体的扫描策略：
- Java 项目：扫 pom.xml、spring.application.name、javaagent 配置
- 前端项目：扫 SDK 导入、applicationName、环境变量
- Node.js：扫 env vars、package.json name
- Monorepo：逐个 workspace 扫描

### 4. 上下文要能保鲜，不能是一次性快照

项目在演进，上下文也要跟着更新。在 skill 里写清楚保鲜触发条件：

- 查到了上下文里没记录的服务 → 更新
- 拓扑变了 → 更新
- 代码里发现了新的 SDK 接入 → 更新
- 已知问题状态变了 → 更新

不需要人维护，Agent 在日常使用中自己发现、自己更新。

### 5. URL 就是共同语言

如果你的 CLI 对应一个 Web 平台，让 Agent 能解析平台 URL：

```
用户贴 URL → Agent 解析参数 → 转成 CLI 命令 → 查到同一份数据
```

Web 平台的 URL 参数通常是语义化的（env、query、time），Agent 天然能读懂。这创造了人和 Agent 之间的「指向能力」—— 你指着页面说"这里有问题"，Agent 立刻能看到同一个视角。

不需要写代码解析 URL，在 skill 里列出参数映射表就行。

### 6. 线上数据比代码分析靠谱

代码告诉你"可能会调谁"，线上数据告诉你"实际在调谁"。

在生成上下文时，优先用线上数据（trace 拓扑、RUM session、metrics）来验证，代码分析作为补充。典型流程：

```
扫描代码找到服务名 → 用 CLI 查线上数据验证 → 查 trace 拓扑拿真实依赖 → 写入上下文
```

### 7. Skill 不只是命令参考，更是排障流程

Skill 里最有价值的不是命令列表（`--help` 能看到），而是：

- **Onboarding 流程** —— Agent 第一次接触项目时该做什么
- **排障工作流** —— "告警 → 日志 → 链路 → 拓扑"的标准流程
- **交叉验证方法** —— 用多个数据源确认一个结论（RUM + trace + web trace）
- **领域知识** —— 查询语法、环境模型、命名规则等

## 项目结构参考

```
xxx-cli/
├── src/
│   ├── index.ts          # 入口 + 命令注册
│   ├── commands.ts       # 所有 CLI 命令
│   ├── client.ts         # HTTP 客户端 + 鉴权
│   ├── auth.ts           # 签名/认证算法
│   ├── config.ts         # ~/.xxx-cli/config.json 管理
│   ├── init.ts           # 项目接入（生成上下文 + 装 skill）
│   ├── mcp.ts            # MCP Server（lazy import）
│   ├── output.ts         # json/table/jsonl 输出
│   └── time.ts           # --last 15m 时间解析
├── skills/
│   ├── SKILL.md          # 主 skill（命令 + 语法 + 流程 + onboarding）
│   └── xxx-domain/       # 领域深度 skill（可选）
│       └── SKILL.md
├── package.json          # bin: {"xxx": ..., "xxx-cli": ...}
├── tsup.config.ts        # ESM + shebang + node22
└── README.md
```

### 技术选型

| 选择 | 原因 |
|------|------|
| TypeScript + ESM | 类型安全，现代 Node.js |
| tsup | 快，自动加 shebang，支持 code splitting（MCP lazy load） |
| commander | 成熟的 CLI 框架，子命令支持好 |
| 原生 fetch | Node 22 内置，不需要 axios |
| Biome | 快，lint + format 一体 |
| vitest | 快，ESM 原生支持 |

### 关键设计决策

- **`bin` 注册两个名字** —— `xxx` 和 `xxx-cli`，前者给全局安装用，后者给 npx
- **MCP lazy import** —— `mcp` 命令用动态 `import()`，不拖慢其他命令启动速度
- **init 检查登录** —— 因为 Agent 需要查线上数据来填上下文
- **login 自动装全局 skill** —— 解决鸡生蛋问题：Agent 要知道工具才能用，但 skill 得先装
- **`--output jsonl`** —— 逐行 JSON，方便 `| jq`、`| wc -l`、`| grep`

## 发布 checklist

- [ ] `npx xxx-cli --help` 能跑
- [ ] `npx xxx-cli login` 保存凭证 + 装 skill
- [ ] `npx xxx-cli init` 生成上下文模板 + 装项目 skill
- [ ] `npx xxx-cli mcp-install` 一键注册 MCP
- [ ] Skill 里有 onboarding 流程、排障工作流、上下文保鲜指引
- [ ] README 讲清楚为什么（三层结构），不只是怎么用
- [ ] 管道验证：`xxx-cli ... -o jsonl | jq | sort | grep` 能正常工作
- [ ] 上下文模板里有按项目类型分的 Agent 扫描指令

## 一句话

**不要给 Agent 一个望远镜让它在城市里找路。先给它地图（上下文），教它怎么看（技能），然后望远镜（工具）才有用。**
