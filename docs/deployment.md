# MEDRIPPLE deployment and release checklist

## Public prototype

The repository ships a public Vercel prototype with the React frontend and the
fixture-mode Express API. It exercises sign-up/login, protected data requests,
role-aware plan review, simulation, and the audit flow against synthetic data.

Set these backend Vercel environment variables before deployment:

```dotenv
AUTH_JWT_SECRET=<unique 48-byte base64url secret>
AUTH_TOKEN_TTL_MINUTES=480
CORS_ORIGINS=https://frontend-psi-plum-56.vercel.app
```

The Vercel entry point defaults to `DATA_SOURCE=fixture`. It uses managed
services only when its protected environment explicitly provides
`DATA_SOURCE=mysql`, `DATABASE_HOST`, database credentials, and
`INTELLIGENCE_SERVICE_URL`. Without those services it has no patient data, no
live hospital integration, and no durable user or audit storage across
serverless cold starts. The visible Demo Approver account is intended only for
the public synthetic-data review.

## Persistent integrated deployment

For a real team environment, deploy the services in `compose.yaml` to a host
that provides persistent MySQL storage and can reach the FastAPI service. The
included frontend container proxies `/api` to Express, so the browser has one
public origin.

1. Generate a unique `AUTH_JWT_SECRET`; do not use the development fallback.
2. Initialise `database/schema.sql`, then run migrations through
   `database/migrations/004_add_persistent_plans_and_lifecycle.sql` for an
   existing volume. Migration 004 adds durable plans, linked transfer items,
   lifecycle statuses, and deterministic reservation/delivery audit support.
3. Set `DATA_SOURCE=mysql`, `INTELLIGENCE_SERVICE_URL`, database credentials,
   strict `CORS_ORIGINS`, and the generated auth secret.
4. Copy `deploy/production.env.example` to `deploy/production.env`, replace
   every placeholder, and run
   `docker compose --env-file deploy/production.env -f compose.yaml -f compose.production.yaml up --build -d`.
   Wait for all health checks, then run the backend and intelligence tests
   against the live stack.
5. Remove or rotate the seeded Demo Approver password; create real approvers
   only after organisational identity verification.
6. Verify the golden flow: login, forecast, simulate, optimise twice (the ID
   must be identical), approve as an approver, dispatch, deliver, inspect the
   persisted audit event and recipient batch quantity, then sign out. Also
   verify that a second approval returns `409 PLAN_ALREADY_DECIDED` and a
   stale donor row returns `409 PLAN_STOCK_CHANGED` with no partial writes.

For an existing MySQL volume, take a tested backup first, then apply migration
004 once before deploying the new backend. It retains historical transfers;
old `COMPLETED` rows are renamed to `DELIVERED`, while legacy rows without a
`plan_id` remain readable. Do not point the production services at a database
until its schema version and backup/restore procedure have been verified.

## Release guardrails

- Keep all production secrets out of Git and rotate them after any exposure.
- Public registration grants `OPERATOR` only; it cannot grant approval rights.
- Confirm Aaryan's clinical wording and safety policy before any non-simulated
  use.
- Run a fresh-machine `pnpm install`, `pnpm stack:up`, and golden-flow check
  before final demonstration.
- Production uses MySQL 8.4, which enforces the non-negative inventory CHECK
  constraint. Do not deploy to an older MySQL version that ignores CHECKs.
