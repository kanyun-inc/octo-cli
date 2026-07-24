---
'octo-cli': major
---

移除 Application Key 登录方式，octo-cli 仅支持 Personal Access Token 认证。

- `login` 仅保留 `--token`
- CLI 与 MCP 不再读取 `OCTOPUS_APP_ID` / `OCTOPUS_APP_SECRET` 或配置文件中的 `app_id` / `app_secret`
- 使用 Application Key 的现有用户需要设置 `OCTOPUS_TOKEN`，或重新执行 `octo-cli login --token <TOKEN>`
