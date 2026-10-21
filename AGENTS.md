# Project guardrails

- Continuing development repository: amuro33/dac-data-api-codex. Do not modify amuro33/dac-data-api.
- Approved visual baseline: upstream fee94f8; original/web contains untouched sources. Preserve screen geometry, colors, fonts and component styles. No unsolicited redesign.
- Current scope: fixed yield workflow with fixture-backed execution; persistent drafts/deployments/agents. External MCP, Job, LLM, free-form DAG editing are not implemented. Never present them as working.
- Default port 4177, loopback only. No runtime dependencies. Node.js >=22.
- Read README.md for contracts: latest event per lot+wafer, pre-aggregation row filter, wafer_cnt, KST half-open date range.
- Run npm test and scripts/verify-browser.cjs with available Playwright. Inspect actual screenshots in test-artifacts before claiming visual verification. Keep test state out of Git.
- Draft changes must not affect published snapshots; new deployment must be discoverable in both Tool and Agent. Saved state must survive restart.
