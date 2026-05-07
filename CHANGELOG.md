# octo-cli

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
