-- Non-destructive hardening for the server-only PostgreSQL API.
-- Express/FastAPI use a server connection; the browser never reads tables
-- with an anon key. No permissive policies are installed here.
BEGIN;
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE replenishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_safety_stock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON facilities, medicines, batches, inventory, consumption,
  replenishments, routes, plans, transfers, audit_events, app_users,
  facility_safety_stock FROM anon, authenticated;
COMMIT;
