# 贡献指南

感谢你贡献 octo-cli！本文说明如何开发、提 PR、自动发版。

## 快速开始

```bash
git clone https://github.com/kanyun-inc/octo-cli.git
cd octo-cli
pnpm install

# 验证环境
pnpm typecheck && pnpm lint && pnpm test && pnpm build

# 本地调试
node dist/index.js --help
```

需要 Node.js >= 22，包管理器用 pnpm（版本由 `package.json` 的 `packageManager` 字段锁定）。

## 开发流程

### 1. 开分支

```bash
git checkout -b feature-xxx     # 新功能（也支持 beta 预发布，见下文）
git checkout -b fix-xxx         # Bug 修复
```

`xxx` 换成主题简述，如 `feature-alerts-silence`。

### 2. 写代码 + 写测试

每个导出函数至少覆盖 happy path + 一个边界 case。改一个模块立刻跑 `pnpm test` 验证，不要攒到最后。

### 3. 提交前检查

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

四项全绿再 commit。CI 会重跑一遍。

### 4. 加 changeset（关键一步）

**没有 changeset，合入 main 后不会触发发版。**

两种方式任选其一：

**方式 A：浏览器（推荐，省事）**

直接 push 分支、开 PR。[changeset-bot](https://github.com/apps/changeset-bot) 会在 PR 下评论，点评论里的链接即可在 GitHub 网页编辑器里写 changeset，提交回 PR 分支——不用 clone、不用跑命令。

**方式 B：本地**

```bash
pnpm changeset
```

按提示选：
- 版本类型：
  - `patch` — Bug 修复、小调整（0.7.0 → 0.7.1）
  - `minor` — 新命令、新 MCP 工具、新功能（0.7.0 → 0.8.0）
  - `major` — Breaking change（0.7.0 → 1.0.0）
- 描述：一句话，会进 CHANGELOG，写给**终端用户**看

会在 `.changeset/<随机名>.md` 生成文件，**提交到你的 PR**。

**什么时候可以不加 changeset？**

- 纯文档改动（README、CONTRIBUTING、CLAUDE.md）
- 纯内部重构（行为不变）
- 纯测试代码
- CI / lint 配置

**不确定？加一个 `patch` 最保险。**

### 5. 开 PR

```bash
gh pr create
```

合入 `main` 后自动走发版流程（见下节）。

## 发版流程

octo-cli 用 [changesets](https://github.com/changesets/changesets) + GitHub Actions **全自动**发版。你不用改 `package.json` 的 version、不用打 tag、不用 `npm publish`、不用输 OTP。

### 稳定版（main 分支）

```
你的 PR（带 changeset）
   │
   ▼ merge 到 main
Release workflow 自动跑
   │
   ▼ 聚合所有 .changeset/*.md
自动开一个 "chore: version packages" PR
   │ 内容：bump package.json 版本、更新 CHANGELOG.md、删掉已消费的 changeset
   ▼ maintainer review 并 merge
自动 npm publish + 打 git tag + 建 GitHub Release
```

整个过程**不需要本地操作**，唯一的两次人工动作：

1. 在自己的 PR 里点 changeset-bot 的链接写一行 changeset
2. 合入 Version PR（确认版本和 changelog 后 merge）

### 第一次走一遍（示例）

```
1. git checkout -b feature-add-json-output
2. 改代码 + 跑 pnpm typecheck && pnpm lint && pnpm test && pnpm build
3. git commit + gh pr create
4. 等 CI 绿 + bot 评论 → 点链接，选 minor、写 "add --json output for logs search"
5. 等 review → merge PR
6. 稍等片刻，会出现一个 "chore: version packages" PR（#N）
7. 看一眼 CHANGELOG.md 和 bump 的版本 → 合并 PR #N
8. 结束。npm view octo-cli version 会看到新版本号
```

### Beta 预发布（feature-* 分支）

把还没准备合回 main 的改动发给用户灰度：

```bash
# 1. 进入 pre-release 模式
pnpm changeset pre enter beta
git add .changeset/pre.json
git commit -m "chore: enter beta pre-release mode"

# 2. 写代码 + changeset（正常流程）
pnpm changeset

# 3. push 到 feature-xxx 分支
git push

# CI 自动发 octo-cli@beta
# 用户可用 npm i octo-cli@beta 体验

# 4. 准备合回 main 前，退出 pre-release 模式
pnpm changeset pre exit
git add .changeset/pre.json
git commit -m "chore: exit beta pre-release mode"
```

> `pre exit` 只是写入"退出意图"。真正的版本号归一化在 PR 合入 `main` 后、Release workflow 执行 `changeset version` 时完成。

## 代码规范

### 工具链

- **TypeScript** 严格模式 — `pnpm typecheck` 必须过
- **Biome** lint + 格式化 — `pnpm lint:fix` 自动修
- **Vitest** 单元测试
- **tsup** 打包（ESM only，目标 Node 22）

### 目录结构

```
src/
├── index.ts         # CLI 入口，注册顶层命令
├── commands.ts      # 业务命令（logs/alerts/traces/...）
├── client.ts        # Octopus HTTP 客户端
├── auth.ts          # AppKey HMAC 签名
├── config.ts        # 配置读写、凭证管理（读环境变量与本地文件）
├── output.ts        # 统一输出格式（json/table/jsonl）
├── time.ts          # 时间范围解析
├── init.ts          # octo init（项目上下文生成）
└── mcp.ts           # MCP stdio server
```

### 一些约束

- **不要硬编码版本号** — `src/index.ts` 里用 `__PKG_VERSION__`（tsup `define` 在构建时注入）
- **鉴权统一走 `getCredentials()`** — `src/config.ts` 会按 token → appKey 优先级返回，业务命令不要自己去读 `OCTOPUS_TOKEN` / `OCTOPUS_APP_ID` / `OCTOPUS_APP_SECRET`
- **终端输出用 `printOutput()`** — 统一 json/table/jsonl 三种格式，别直接 `console.log(JSON.stringify(...))`
- **不要 mock 真实依赖** — 除非是网络 IO

### Commit 规范

用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat(logs): add --follow option for real-time tailing
fix(alerts): handle empty silence list
docs: clarify token vs appKey usage
chore: bump dependencies
```

中文可用于 body，但前缀保持英文。

## FAQ

### changeset-bot 在 PR 里没评论？

检查 bot 是否装到了本仓库：https://github.com/apps/changeset-bot 。如果没装，回退到本地 `pnpm changeset`。

### 忘了加 changeset 就 merge 了怎么办？

没关系，不影响已 merge 的代码，只是这次改动不会触发发版。下一次别人加 changeset 合入时，你的改动会一起发出去。如果是紧急发版，可以临时开一个空 PR 补个 changeset（`pnpm changeset` 生成文件后直接提交）。

### `pnpm install --frozen-lockfile` 失败

lockfile 漂移了。本地 `pnpm install`，把 `pnpm-lock.yaml` 一起提交。

### 发版 workflow 报 `NPM_TOKEN` 错误

Maintainer 需要在仓库 Settings → Secrets → Actions 配 npm automation token。贡献者不用关心。

### 本地预览一下发版效果

```bash
# 看当前 changeset 会产生什么 bump（不改文件）
pnpm changeset status

# 预演 version 步骤（改 package.json + CHANGELOG，git checkout . 还原）
pnpm changeset version

# ⚠️ 不要本地跑 pnpm release，那会真的发 npm
```

### PR 必须有 changeset 才能 merge 吗？

**不强制**。changeset-bot 只是提醒，没加 block 规则。

要真正强制，需要两步：(1) 在 `ci.yml` 里加一个 job 跑 `pnpm changeset status --since=main`（无 changeset 时退出非零），(2) 去 repo Settings → Branches → `main` 的 branch protection 里把这个 job 设为 required status check。单独开 branch protection 不能识别 changeset 文件是否存在。

## 反馈

- 提 Issue：https://github.com/kanyun-inc/octo-cli/issues
- 给 AI Agent 的速查：[CLAUDE.md](./CLAUDE.md)
