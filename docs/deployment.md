# MEDRIPPLE deployment and release checklist

## Public prototype

The repository ships a public Vercel prototype with the React frontend and the
fixture-mode Express API. It exercises sign-up/login, protected data requests,
role-aware plan review, simulation, and the audit flow against synthetic data.

Set these backend Vercel environment variables before deployment:

```dotenv
AUTH_JWT_SECRET=<unique 48-byte base64url secret>
AUTH_TOKEN_TTL_MINUTES=480
```

The Vercel entry point deliberately forces `DATA_SOURCE=fixture` and disables
the FastAPI URL. It therefore has no patient data, no live hospital integration,
and no durable user or audit storage across serverless cold starts. The visible
Demo Approver account is intended only for the public synthetic-data review.

## Persistent integrated deployment

For a real team environment, deploy the services in `compose.yaml` to a host
that provides persistent MySQL storage and can reach the FastAPI service.

1. Generate a unique `AUTH_JWT_SECRET`; do not use the development fallback.
2. Initialise `database/schema.sql`, then run migrations including
   `database/migrations/003_add_application_users.sql` for an existing volume.
3. Set `DATA_SOURCE=mysql`, `INTELLIGENCE_SERVICE_URL`, database credentials,
   strict `CORS_ORIGINS`, and the generated auth secret.
4. Run `pnpm stack:up`, wait for all health checks, then run the backend and
   intelligence tests against the live stack.
5. Remove or rotate the seeded Demo Approver password; create real approvers
   only after organisational identity verification.
6. Verify the golden flow: login, forecast, simulate, optimise, approve as an
   approver, inspect the persisted audit event, and sign out.

## Release guardrails

- Keep all production secrets out of Git and rotate them after any exposure.
- Public registration grants `OPERATOR` only; it cannot grant approval rights.
- Confirm Aaryan's clinical wording and safety policy before any non-simulated
  use.
- Run a fresh-machine `pnpm install`, `pnpm stack:up`, and golden-flow check
  before final demonstration.
