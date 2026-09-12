# Intelligence handoff area

Druv's FastAPI service should expose `POST /forecast` using the request shape in `../docs/api-contract.md`. Sahil's backend reads `INTELLIGENCE_SERVICE_URL`, validates live responses, and falls back to labelled fixtures when the service is unavailable.

