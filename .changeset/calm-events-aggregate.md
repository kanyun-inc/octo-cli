---
"octo-cli": minor
---

Add CLI and MCP aggregation support for RUM and events.

- Add `rum aggregate` and `events aggregate` commands plus the corresponding MCP tools.
- Validate aggregation fields and group limits across logs, traces, RUM, and events, preventing malformed limits from being serialized as `null`.
- Rank CLI grouped top-N results by the first requested aggregation instead of always using `count(*)`, aligning CLI behavior with MCP.
