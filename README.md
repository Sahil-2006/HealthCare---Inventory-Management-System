# MEDRIPPLE

A prototype for making regional medicine shortages visible before they become emergencies. The current vertical slice is intentionally fixture-backed, so the frontend and intelligence service can integrate before the database and modelling contracts are frozen.

## What runs now

- Express API with consistent JSON success and error envelopes
- Regional summary, facilities, inventory, forecast, simulation, safe-plan, approval and audit routes
- Deterministic fixture data for the insulin golden scenario
- FastAPI intelligence adapter with timeout validation and an explicitly labelled fixture fallback
- Automated API tests and a GitHub Actions check

## Quick start

Requires Node.js 20+ and pnpm 9+.

```powershell
Copy-Item .env.example .env
pnpm install
pnpm dev
```

The API starts at `http://127.0.0.1:3001`; verify it with `GET /health`.

```powershell
pnpm test
pnpm check
```

## Important prototype boundaries

All data is simulated. Forecasts and plans are decision-support fixtures, not clinical advice or autonomous transfer instructions. Before release, replace the fixture store with Dhiren's frozen MySQL schema/seed, connect Druv's tested FastAPI service, and have Aaryan validate all safety wording and rules.

## Team handoffs

- API contract: [docs/api-contract.md](docs/api-contract.md)
- Sahil's task board: [docs/sahil-work.md](docs/sahil-work.md)
- Integration notes: [docs/integration-handoffs.md](docs/integration-handoffs.md)

