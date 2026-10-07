---
'octo-cli': minor
---

Make the CLI usable through its own help and expose supported query continuation and topology filters.

- Fix record-per-line JSONL and record tables for paginated responses; preserve complete JSON responses and send continuation warnings to stderr.
- Add trace cursors, log sort cursors, LLM/RUM/event scroll and sort flags, and topology entry filters.
- Add opt-in `--cursor-file` to log/trace/LLM/RUM/event list queries for atomic, machine-readable continuation metadata with true/false/unknown completeness. Preserve old files on failures and keep continuation explicit; forward paired trace sort values in CLI and MCP.
- Expose the documented log/RUM Issue source for search and detail in CLI and MCP; link built-in help to the official OpenAPI reference and clarify log sort cursors and trace end-time ordering.
- Send the required environment and event timestamp for CLI and MCP RUM detail; accept epoch milliseconds/seconds for metric point timestamps.
- Reject invalid environments, enum values, malformed limits, orphan end times, and excessive aggregation dimensions. Warn when requested group fields are missing from aggregate results.
- Report failures without Node stack traces; add global `--json-errors` with HTTP status and API code on stderr.
- Add query-indexed hints for misplaced Metric QL grouping and unsupported PromQL `=~` filters, preserving original failures and QL; expose optional `error.hints` in JSON errors.
- Explain Metric QL grouping, output parsing, common query recipes, and HTTP error aggregation in CLI help; align MCP and bundled skill Count examples with current function syntax.
- Document actual defaults, value domains, examples, query/aggregation constraints, pagination, and the backend-confirmed 99-Issue cap without pagination controls in built-in help and truncation warnings.

JSONL now emits records instead of page envelopes; use `--cursor-file` for separate continuation metadata or `--output json` for consumers that require the prior envelope shape.

RUM detail now requires `--timestamp` (CLI) or `timestamp` in epoch milliseconds (MCP), taken from the list record; the backend searches within one hour on either side of that event time.
