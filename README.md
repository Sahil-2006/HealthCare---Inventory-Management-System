# MEDRIPPLE

A prototype for making regional medicine shortages visible before they become emergencies. It can run from deterministic fixtures during development or from the seeded MySQL database for the integrated backend flow.

## What runs now

- Express API with consistent JSON success and error envelopes
- Regional summary, facilities, inventory, forecast, simulation, safe-plan, approval and audit routes
- Seeded MySQL schema, deterministic insulin golden scenario, and switchable fixture fallback
- Source-aware simulator, constrained safe-plan generator, and human approve/reject audit persistence
- FastAPI intelligence service for forecasting and ripple simulation, with a timeout-bound Node fallback
- Sign-up/login, signed expiring sessions, and server-enforced operator/approver roles
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

Open the frontend in a second terminal with `pnpm dev:frontend`. The seeded
simulation approver is `demo.approver@medripple.demo` with password
`MedrippleDemo!2026`. Public sign-up creates an `OPERATOR` account; only an
organisation-assigned `APPROVER` or `ADMIN` can approve or reject a plan.

## Integrated local stack

With Docker Desktop running, start the MySQL database and backend together:

```powershell
pnpm stack:up
```

Wait for the backend and intelligence health checks, then open `http://127.0.0.1:3001/health`. It should report `"dataSource": "MYSQL"`; the intelligence health endpoint is `http://127.0.0.1:8000/health`. The backend sends forecast and ripple-simulation requests to that service, and uses its labelled local fallback only when the service is unavailable. Use `pnpm stack:logs` to inspect services and `pnpm stack:down` to stop them. The data is intentionally simulated.

For a backend process running outside Docker, use `pnpm db:up`, set `DATA_SOURCE=mysql` in `.env`, and then run `pnpm dev`.

## Public prototype deployment

The public Vercel prototype uses two standard projects from this repository: deploy `backend/` first for the fixture API, then deploy `frontend/` with `VITE_API_BASE_URL` set to that API deployment's `/api` URL. The backend project deliberately uses a Vercel serverless catch-all rather than the development `listen()` entry point. This gives the public React UI real authenticated API calls without hard-coded localhost URLs.

Set a unique `AUTH_JWT_SECRET` in the backend Vercel project before deploying. The Vercel service intentionally uses deterministic fixture data, and new public registrations/approval history live only for a warm serverless instance. It is a public prototype, not a persistent clinical production system.

The MySQL-backed intelligence flow and persistent accounts need the Docker stack or another persistent Node/MySQL/FastAPI host. See [docs/deployment.md](docs/deployment.md) for the production cutover checklist. Do not label the Vercel fixture deployment as a clinical system.

## Important prototype boundaries

All data is simulated. Forecasts and plans are decision support, not clinical advice or autonomous transfer instructions. The backend validates exact medicine identity, route cold-chain capability, protected stock over the selected horizon, and human approval/audit data. Before release, have Aaryan validate the final safety wording, equity rules, and acceptance cases.

## Team handoffs

- API contract: [docs/api-contract.md](docs/api-contract.md)
- Sahil's task board: [docs/sahil-work.md](docs/sahil-work.md)
- Integration notes: [docs/integration-handoffs.md](docs/integration-handoffs.md)
