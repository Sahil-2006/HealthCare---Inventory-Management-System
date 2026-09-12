# MEDRIPPLE MySQL database

`schema.sql` is Dhiren's deterministic schema-and-seed script. It creates the `medripple` database with 10 facilities, 12 medicines, batches, 75 days of consumption history, safety stock, replenishments, routes, transfers, and audit events. All records are simulated.

## Start locally

Requires Docker Desktop. From the repository root:

```powershell
pnpm db:up
```

The first startup runs `schema.sql` automatically and exposes MySQL on port `3306`. The credentials match `.env.example`. To inspect startup state:

```powershell
pnpm db:logs
```

To connect the backend, copy `.env.example` to `.env` and change:

```dotenv
DATA_SOURCE=mysql
```

Then run `pnpm dev`. `/health` should report `"dataSource": "MYSQL"`. The current MySQL read model powers regional summary, facilities, medicines, and facility inventory. Forecast, simulation, optimisation, and approval endpoints still retain deterministic integration fixtures until Druv's intelligence contract and the final scenario rules are connected.

## Resetting the database

The seed is deterministic. To reset, stop the Compose stack, remove its `mysql_data` volume, then start it again. This deletes local simulated database data only; do not use the command against a shared or production database.
