---
'octo-cli': patch
---

fix: init 命令支持个人 Access Token 认证

- init 凭据检查现在同时识别 config.token 和 OCTOPUS_TOKEN 环境变量
- 错误提示更新为推荐 `login --token` 方式
