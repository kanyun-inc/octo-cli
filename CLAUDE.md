# CLAUDE.md

本文件提供给 Claude Code / Cursor / Codex 等 AI Agent 使用。

## 项目简介

octo-cli 是 Octopus 可观测平台的 CLI 工具，给人类和 AI Agent 查询日志、告警、链路、指标、Issue 等数据。同时内置 MCP Server（`octo mcp`）。

## 核心开发命令

```bash
pnpm install          # 装依赖
pnpm dev              # 监听构建
pnpm build            # tsup 构建
pnpm typecheck        # tsc --noEmit
pnpm lint             # biome check
pnpm lint:fix         # biome check --write
pnpm test             # vitest run
pnpm release          # = pnpm build && changeset publish（CI 用）
```

## 提交前必检

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

四项全绿才能 commit。新代码必须同步写单测，不要"全部写完再补"。

## Changeset 规则（必读）

本项目用 [changesets](https://github.com/changesets/changesets) 管版本号和 CHANGELOG。**改了用户可见行为的 PR 必须带 changeset 文件**，否则版本不会 bump。

### 何时必须加 changeset

- **新功能**（minor bump）
- **Bug 修复**（patch bump）
- **Breaking change**（major bump）
- 任何影响 CLI 行为、MCP 接口、配置格式的改动

### 不需要加

- 纯文档（README/CLAUDE.md）
- 纯重构（行为不变）
- 纯测试代码补充
- CI / lint 配置调整

### 如何创建

```bash
pnpm changeset
```

交互式选 patch / minor / major，写一句简述。工具会在 `.changeset/` 下生成 `xxx.md`，**和代码一起提交到 PR**。

### Changeset 文件格式

```markdown
---
'octo-cli': patch
---

一句话总结这次改动。

- 具体变更点 1
- 具体变更点 2
```

版本类型判断：

| 类型 | 版本变化 | 适用场景 |
|------|---------|----------|
| `patch` | 0.7.0 → 0.7.1 | Bug 修复、小幅文案调整 |
| `minor` | 0.7.0 → 0.8.0 | 新增命令、新增 MCP 工具、向后兼容的新特性 |
| `major` | 0.7.0 → 1.0.0 | Breaking change（参数签名变化、删除命令等） |

## 发版流程（自动）

1. 写代码 + 加 changeset → 提 PR
2. PR 合入 `main` → Release workflow 自动开 "chore: version packages" PR，聚合所有 changeset，bump 版本，写 CHANGELOG
3. 合并 Version Packages PR → 自动 `npm publish`（带 provenance）

**Agent 永远不要手动改 `package.json` 的 version 字段**——由 changesets 托管。

## 代码约束

### 版本号

`src/index.ts` 里的版本由 tsup `define` 在构建时从 `package.json` 注入（`__PKG_VERSION__`）。不要再手动硬编码版本字符串。

### 认证

配置读取统一走 `src/config.ts` 的 `getCredentials()`，它会按优先级返回 `{ mode: 'token' }` 或 `{ mode: 'appKey' }`。新命令不要直接读环境变量。

### 输出

所有命令的终端输出走 `src/output.ts` 的 `printOutput()`，支持 `--output json/table/jsonl`。

### 时间参数

命令行时间相关的 flag 用 `src/time.ts` 的 `resolveTimeRange()` 解析，支持 `now-1h`、绝对时间戳等。

## 测试要求

- 每个公开函数至少 happy path + 边界 case
- `src/client.test.ts` 是 HTTP 客户端的集成测试，覆盖鉴权签名和请求体构造
- 不 mock 真实依赖除非是网络 IO

## 常见坑

| 问题 | 原因 | 解决 |
|------|------|------|
| "No changesets found" | 忘了加 changeset | `pnpm changeset` 后提交新文件 |
| `octo --version` 输出老版本号 | dist 没重新构建 | `pnpm build` |
| CI publish 失败 | `NPM_TOKEN` secret 未配或过期 | 仓库 Settings → Secrets → Actions |
| `pnpm install --frozen-lockfile` 失败 | 依赖变更没同步 lockfile | 本地 `pnpm install` 后提交 `pnpm-lock.yaml` |
