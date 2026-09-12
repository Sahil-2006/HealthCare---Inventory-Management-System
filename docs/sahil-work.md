# Sahil's work board - Software Engineer & Integration Lead

Status as of this workspace setup: **the repository was empty, so all live data and downstream contracts remain pending.** The items below separate work that can move now from handoffs that need named owners.

## Completed now

- [x] Create the shared repository layout: `frontend`, `backend`, `intelligence`, `database`, `docs`, `tests`, and `demo`.
- [x] Add a runnable Node.js/Express API skeleton with config loading, CORS, request IDs, JSON logging, `/health`, standard success envelopes, and useful errors.
- [x] Publish a versioned fixture-backed API contract for facility, inventory, forecast, simulation, plan, approval, and audit flows.
- [x] Build a deterministic insulin golden fixture flow, including excluded expired stock, a PHC supply delay, an unsafe donor rejection, a safe multi-source plan, and approval/audit persistence.
- [x] Add a FastAPI intelligence adapter with response validation, timeout handling, and a clearly labelled fixture fallback.
- [x] Add automated API tests, one-command local start/test commands, `.env.example`, and a CI workflow.

## Next work, ordered by dependency

### Can continue immediately

- [ ] Confirm the exact screen payload fields with Samson and record any additions in `docs/api-contract.md`.
- [ ] Build a demo-user stub only if it stays separate from the core flow.
- [ ] Add deployment configuration after the application host is chosen; keep secrets outside Git.
- [ ] Keep integration tests and README instructions current as interfaces change.

### Waiting for Dhiren - database/data contract

- [ ] Replace `backend/src/fixture-store.js` with a repository that reads Dhiren's frozen MySQL schema.
- [ ] Add migrations, deterministic seed/reset, and validation for table names, units, exact medicine identity, batch state, expiry, routes, and replenishments.
- [ ] Re-test all inventory, region-summary, effective-stock, and audit APIs against the real seed.

### Waiting for Druv - intelligence contract

- [ ] Set `INTELLIGENCE_SERVICE_URL` and connect the tested `/forecast` service.
- [ ] Validate the final risk, confidence, cause, stockout, regional-fragility, simulator, and optimizer response schemas.
- [ ] Replace the fixture optimiser and scenario calculation with Druv's test-verified outputs while retaining backend input/error validation and timeouts.

### Waiting for Aaryan - healthcare/safety acceptance

- [ ] Replace all provisional safety-stock and equity assumptions with Aaryan-approved rules.
- [ ] Apply approved disclaimer, warning, approval, and rejected-donor wording in API response text and frontend copy.
- [ ] Run and record Aaryan's acceptance cases on the integrated golden flow.

### Waiting for Samson - frontend contract/integration

- [ ] Reconcile each endpoint with the dashboard, facility, candidates, simulator, plan review, and audit screen requirements.
- [ ] Replace frontend mocks with live API calls and jointly test loading, error, and empty states.
- [ ] Rehearse the five-click golden demo against the deployed API.

## Release responsibility

- [ ] Fix integration defects only after every owner marks their handoff stable.
- [ ] Production environment variables and stable public URL.
- [ ] Fresh-clone verification: install, seed/reset, start, test, and complete the golden scenario without manual edits.
- [ ] Release freeze, accessible README, and public repository/app checks.

## Scope guardrails

Do not spend the prototype window on enterprise authentication, unnecessary microservices, real hospital integrations, unneeded admin screens, or deployment experiments after the release candidate stabilizes.

