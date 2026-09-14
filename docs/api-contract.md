# MEDRIPPLE API contract - authenticated prototype v0.2

**Contract status:** provisional until Dhiren freezes the data contract, Druv freezes intelligence JSON, Samson supplies exact screen fields, and Aaryan approves healthcare wording. No client should silently rely on undocumented fields.

Base URL: `http://127.0.0.1:3001` in local development. All content is JSON.

## Envelopes

Every successful API response is shaped as:

```json
{
  "data": {},
  "meta": { "requestId": "uuid", "source": "FIXTURE_STORE" }
}
```

Every failure is shaped as:

```json
{
  "error": { "code": "INVALID_REQUEST", "message": "facilityId is required." },
  "meta": { "requestId": "uuid" }
}
```

`source` is important: `FIXTURE_*` means deterministic simulated data; `DATABASE_FALLBACK` means the active MySQL records were used while the intelligence service was unavailable; `INTELLIGENCE_SERVICE` means Druv's live service answered. Any fallback forecast is usable for integration only, not a release result.

When `DATA_SOURCE=mysql`, inventory, optimization, approval, lifecycle, and audit routes use Dhiren's seeded MySQL database. In this mode, an unavailable FastAPI optimizer returns `503 INTELLIGENCE_UNAVAILABLE`; it never falls back to the simpler Node planner to create an inventory-reserving plan. Facility IDs are stable database `facility_code` values such as `PHC-VLR-001`; medicine IDs are database medicine IDs, while the fixture alias `med-insulin-100iu-vial` remains accepted for the default insulin view.

## Authentication and access control

`POST /api/auth/signup` creates an `OPERATOR` account and returns a signed,
expiring bearer token. `POST /api/auth/login` returns the same session shape.
Pass it on all workspace requests as `Authorization: Bearer <token>`.

`GET /api/auth/me` returns the signed-in user; `POST /api/auth/logout` lets the
client end its stateless session locally. The API derives the audit actor from
the verified token, not from the request body. `APPROVER` and `ADMIN` roles can
approve/reject plans; public sign-up can never create either role.

The public Vercel fixture uses a visible simulated `APPROVER` account. Its
in-memory registrations and audit history may reset on a serverless cold start.
Persistent accounts require `DATA_SOURCE=mysql` and the `app_users` table.

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Server readiness and environment |
| `POST` | `/api/auth/signup` | Register an operator and start a signed session |
| `POST` | `/api/auth/login` | Start a signed session |
| `GET` | `/api/auth/me` | Read the current signed-in account |
| `POST` | `/api/auth/logout` | End the client-side stateless session |
| `GET` | `/api/region/summary` | Resilience score, alerts, earliest stockout, and patient-days at risk |
| `GET` | `/api/facilities` | Facility coordinates, simulated risk, supply coverage, and safe surplus |
| `GET` | `/api/facilities/:facilityId/inventory?medicineId=:medicineId` | Medicine identity, batches, effective/recorded stock, consumption, and incoming supply |
| `GET` | `/api/medicines` | Fixture medicine catalogue |
| `POST` | `/api/forecast` | Forecast, risk, stockout projection, cause, confidence, and source |
| `POST` | `/api/scenarios/simulate` | Evaluate proposed transfers and compare baseline vs intervention |
| `POST` | `/api/plans/optimize` | Produce and persist a deterministic safe plan with scenario comparison |
| `GET` | `/api/plans/:planId` | Read a proposed or decided plan |
| `POST` | `/api/plans/:planId/approve` | Approver-only reserve/reject action and immutable audit event |
| `POST` | `/api/plans/:planId/dispatch` | Mark a reserved plan in transit |
| `POST` | `/api/plans/:planId/deliver` | Add the reserved batch to recipient inventory and mark delivered |
| `POST` | `/api/plans/:planId/cancel` | Cancel a reserved plan and release donor stock |
| `GET` | `/api/audit` | Persistent MySQL audit trail, or fixture audit history offline |

## POST request shapes

### Sign up / login

```json
{
  "name": "Sahil Kumar",
  "email": "sahil@example.org",
  "password": "StrongPass2026"
}
```

Sign-up requires `name`, `email`, and a password with at least 10 characters,
one letter, and one number. Login accepts `email` and `password`. Both return:

```json
{
  "data": {
    "user": { "id": "uuid", "name": "Sahil Kumar", "email": "sahil@example.org", "role": "OPERATOR" },
    "token": "signed-session-token",
    "expiresAt": "2026-09-14T00:00:00.000Z"
  }
}
```

### Forecast

```json
{
  "facilityId": "facility-navjeevan-phc",
  "medicineId": "med-insulin-100iu-vial",
  "horizonDays": 14
}
```

`horizonDays` must be `7`, `14`, or `30`.

### Simulate a transfer

```json
{
  "horizonDays": 14,
  "transfers": [
    {
      "fromFacilityId": "facility-district-hospital",
      "toFacilityId": "facility-navjeevan-phc",
      "medicineId": "med-insulin-100iu-vial",
      "quantity": 45,
      "arrivalDay": 1
    }
  ]
}
```

Each returned `transferEvaluation` includes `eligible`, `rejectionReasons`, and route details. Clients must display rejected reasons rather than treating an ineligible transfer as a recommendation.

### Ask for a plan

```json
{
  "destinationFacilityId": "facility-navjeevan-phc",
  "medicineId": "med-insulin-100iu-vial",
  "quantity": 45,
  "horizonDays": 14
}
```

The return includes a deterministic `id`, `status`, `transfers`, `rationale`, `assumptions`, and a full `simulation`. MySQL-mode plans are persisted by `plan_id`; the transfer items reference that plan and its exact batch IDs.

### Record a human decision

```json
{
  "decision": "APPROVE",
  "note": "Reviewed simulated protected-stock impact."
}
```

`decision` must be `APPROVE` or `REJECT`. In MySQL mode an approval atomically creates transfer items, deducts the donor's available batch quantity subject to a safety-stock conditional update, changes the plan to `RESERVED`, and writes an audit event. The recipient inventory changes only at `DELIVER`. A stale donor row returns `409 PLAN_STOCK_CHANGED`; the client must re-run the optimizer. The verified signed-in account becomes the audit actor.

### Lifecycle actions

`POST /api/plans/:planId/dispatch`, `/deliver`, and `/cancel` each take
`{"note":"..."}` and require `APPROVER` or `ADMIN`. Valid states are
`RESERVED → IN_TRANSIT → DELIVERED`, or `RESERVED → CANCELLED`. Delivery adds
the exact reserved batch to the recipient inventory; cancellation restores the
donor quantity. Every action is transactional and appends an audit event.

## Error codes

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_REQUEST`, `INVALID_HORIZON`, `INVALID_DECISION` | Request schema is invalid |
| 400 | `INVALID_EMAIL`, `WEAK_PASSWORD` | Account registration input is invalid |
| 401 | `AUTH_REQUIRED`, `INVALID_SESSION`, `INVALID_CREDENTIALS` | Sign in is missing, expired, invalid, or rejected |
| 403 | `INSUFFICIENT_ROLE` | The signed-in account is not an approver/admin |
| 409 | `ACCOUNT_EXISTS` | The email address is already registered |
| 409 | `PLAN_ALREADY_DECIDED`, `PLAN_STOCK_CHANGED`, `PLAN_STATE_CHANGED`, `INVALID_PLAN_TRANSITION` | A plan was already handled, inventory changed, or a lifecycle transition is no longer valid |
| 422 | `PLAN_QUANTITY_MISMATCH` | Optimizer transfer items do not sum to the requested quantity |
| 503 | `INTELLIGENCE_UNAVAILABLE` | MySQL mode cannot reach the safe allocation service; no reserving plan is created |
| 404 | `NOT_FOUND`, `FACILITY_NOT_FOUND`, `FORECAST_TARGET_NOT_FOUND`, `OPTIMIZATION_TARGET_NOT_FOUND`, `PLAN_NOT_FOUND` | Resource or target is unavailable |
| 409 | `PLAN_ALREADY_DECIDED` | A final decision already exists |
| 422 | `NO_SAFE_PLAN` | No compliant fixture plan could be produced |
| 422 | `TRANSFER_PERSISTENCE_FAILED` | A decision could not be mapped to the seeded transfer records |
| 503 | `DATABASE_UNAVAILABLE` | MySQL is not reachable or has not been seeded |
| 500 | `INTERNAL_ERROR` | Unexpected server failure |

## Integration requirements

- Keep IDs stable; do not rename JSON fields without a documented version change.
- Quantities must arrive with exact medicine identity and unit meaning from Dhiren's contract.
- Forecast/simulation results must retain `cause`, `confidence`, freshness, and a human-readable limitation from Druv's contract.
- Recommendation and rejection language remains pending Aaryan's safety review.
- Treat bearer tokens as credentials; use HTTPS and a unique `AUTH_JWT_SECRET` outside local development.
- Frontend display needs from Samson should be added to this file before client implementation changes.
