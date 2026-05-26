---
'octo-cli': patch
---

修复 --from/--to 参数被 --last 默认值覆盖的问题

- resolveTimeRange 中 --from/--to 优先级提升至 --last 之前
- 修复 alerts search、issues search、trace search 等 11 个命令的时间范围参数失效问题
