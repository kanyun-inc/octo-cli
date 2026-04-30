# 贡献指南

感谢你对 octo-cli 的贡献！本文档说明如何参与开发、提 PR、发版。

## 快速开始

```bash
# 克隆 + 装依赖
git clone https://github.com/kanyun-inc/octo-cli.git
cd octo-cli
pnpm install

# 验证环境
pnpm typecheck && pnpm lint && pnpm test && pnpm build

# 本地调试
node dist/index.js --help
```

需要 Node.js >= 22，包管理器用 pnpm。

## 开发流程

### 1. 开分支

从 `main` 拉新分支：

```bash
git checkout -b feature-xxx     # 新功能
git checkout -b fix-xxx         # Bug 修复
```

（`xxx` 换成你的主题简述，如 `feature-alerts-silence`。）

`feature-*` 分支后续还支持 beta 预发布（见下文）。

### 2. 写代码 + 写测试

每个公开函数至少 happy path + 边界 case。改完一个模块立刻跑 `pnpm test` 验证，不要攒到最后。

### 3. 提交前检查

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

四项全绿再 commit。CI 会重跑一遍。

### 4. 加 changeset

**影响用户可见行为的 PR 必须加 changeset，漏了不会自动发版。**

可以跳过的情况：

- 纯文档改动（README、CLAUDE.md 等）
- 纯内部重构（行为不变）
- 纯测试代码
- CI / lint 配置

不确定？加一个 `patch` 最保险。

```bash
pnpm changeset
```

按提示选：
- 哪个包：`octo-cli`（单包仓库，直接回车）
- 版本类型：
  - `patch` — Bug 修复、小幅调整（0.7.0 → 0.7.1）
  - `minor` — 新功能、新命令、新 MCP 工具（0.7.0 → 0.8.0）
  - `major` — Breaking change（0.7.0 → 1.0.0）
- 描述：一句话总结（会进 CHANGELOG，请用终端用户能读懂的语言）

工具会在 `.changeset/` 生成一个 `xxx-xxx.md`，**提交它到你的 PR**。

### 5. 开 PR

```bash
gh pr create
```

PR 合并到 `main` 后会自动触发发版流程（见下节）。

## 发版流程

octo-cli 用 [changesets](https://github.com/changesets/changesets) + GitHub Actions 自动发版。**你不需要手动改 `package.json` 的 version、不需要打 tag、不需要 `npm publish`**。

### 正式版（main 分支）

```
你的 PR（带 changeset）
   │
   ▼ 合并到 main
Release workflow 自动跑
   │
   ▼ 聚合所有 .changeset/*.md
开一个 "chore: version packages" PR
   │ 内容：bump package.json 版本、更新 CHANGELOG.md、删掉已消费的 changeset 文件
   ▼ 由 maintainer 审查并合并
自动 npm publish + 打 git tag + 建 GitHub Release
```

### Beta 预发布（feature-* 分支）

用于把还没准备合入 main 的改动先发给用户灰度：

```bash
# 1. 进入 pre-release 模式
pnpm changeset pre enter beta
git add .changeset/pre.json
git commit -m "chore: enter beta pre-release mode"

# 2. 写代码 + changeset
pnpm changeset

# 3. push 到 feature-xxx 分支
git push

# CI 会自动发 octo-cli@beta
# 用户可以 npm i octo-cli@beta 体验

# 4. 准备合回 main 时，退出 pre-release 模式
pnpm changeset pre exit
git add .changeset/pre.json
git commit -m "chore: exit beta pre-release mode"
```

> `pre exit` 本身只是写入 "退出意图"。真正的正式版本号归一化会在 PR 合入 `main` 后，由 Release workflow 执行 `changeset version` 时完成。

## 代码规范

### 工具链

- **TypeScript**：严格模式，`pnpm typecheck` 必须过
- **Biome**：lint + 格式化，`pnpm lint:fix` 自动修
- **Vitest**：单元测试
- **tsup**：打包（ESM only，目标 Node 22）

### 目录结构

```
src/
├── index.ts         # CLI 入口，注册顶层命令
├── commands.ts      # 业务命令（logs/alerts/traces/...）
├── client.ts        # Octopus HTTP 客户端 + 签名
├── config.ts        # 配置读写、凭证管理
├── output.ts        # 统一输出格式（json/table/jsonl）
├── time.ts          # 时间范围解析
├── init.ts          # octo init（项目上下文生成）
└── mcp.ts           # MCP stdio server
```

### 一些约束

- **不要硬编码版本号**：`src/index.ts` 里用 `__PKG_VERSION__`（tsup `define` 注入）
- **不要绕过 getCredentials()**：鉴权信息统一从 `src/config.ts` 读
- **不要 mock 真实依赖**：除非是网络 IO
- **不要写 `process.env.OCTOPUS_*`** 在业务代码里：走 `src/config.ts`
- **终端输出用 `printOutput()`**：别直接 `console.log(JSON.stringify(...))`

### Commit 信息

用 [Conventional Commits](https://www.conventionalcommits.org/) 风格：

```
feat(logs): add --follow option for real-time tailing
fix(alerts): handle empty silence list
docs: clarify token vs appKey usage
chore: bump dependencies
```

中文也可以，前缀保持英文。

## 常见问题

### PR CI 失败：changeset bot 评论 "add a changeset"

漏加 changeset 了。本地跑 `pnpm changeset` 后提交新文件推上去。

### `pnpm install --frozen-lockfile` 失败

lockfile 没同步。本地跑 `pnpm install` 后把 `pnpm-lock.yaml` 一起提交。

### 发版 workflow 失败：`NPM_TOKEN` 错误

Maintainer 需要在仓库 Settings → Secrets → Actions 配 npm automation token。贡献者不需要关心。

### 本地想试一下发版流程

```bash
# 看一下当前 changeset 会造成什么 bump（不改任何文件）
pnpm changeset status

# 预演 version 步骤（会改 package.json 和 CHANGELOG，改完可以 git checkout . 还原）
pnpm changeset version

# 不要本地 pnpm release，那会真的发 npm
```

## 有问题？

- 发 Issue：https://github.com/kanyun-inc/octo-cli/issues
- 读 [CLAUDE.md](./CLAUDE.md)：给 AI Agent 的速查，也适合人类
