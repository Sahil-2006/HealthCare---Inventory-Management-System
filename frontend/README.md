# MEDRIPPLE frontend

Responsive React/Vite interface for the MEDRIPPLE regional medicine-resilience prototype. It covers the full reviewer flow:

1. Regional dashboard with a schematic coverage map and accessible risk states.
2. Facility evidence view with effective stock, replenishment, risk cause, confidence, freshness, and forecast.
3. Candidate assessment with an explicit reason for every unsafe donor.
4. Ripple simulation comparing an unsafe single-donor pull with the backend optimiser's safe multi-source plan.
5. Human plan approval/rejection and immutable audit history.

## Run with the local API

From the repository root:

```powershell
Copy-Item frontend/.env.example frontend/.env
pnpm install
pnpm dev
```

In a second terminal:

```powershell
pnpm dev:frontend
```

Open the address Vite reports, normally `http://127.0.0.1:5173`.

The default `.env.example` connects to the fixture backend at `http://127.0.0.1:3001/api`. The API's exact envelope and routes are documented in [`../docs/api-contract.md`](../docs/api-contract.md).

To show the deterministic built-in demo without a backend, set `VITE_USE_MOCKS=true` in `frontend/.env`.

## Integration boundary

All HTTP calls and response mapping live in [`src/services/medrippleApi.js`](src/services/medrippleApi.js). Screens do not contain direct `fetch` calls. This keeps the backend handoff isolated while the database and intelligence payloads are still evolving.

The UI preserves the prototype's safety boundaries:

- risk has a textual label, not only colour;
- incompatible or unsafe donors expose a concrete rejection reason;
- recommendations remain decision support;
- a human decision with a note is required before a plan changes status.
