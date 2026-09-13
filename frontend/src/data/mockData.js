export const dashboard = {
  snapshotAt: '08:15 IST',
  dateLabel: '13 Sep 2026',
  metrics: [
    { label: 'Resilience score', value: '87.4%', detail: '8.2 pts across the demo period', tone: 'healthy', icon: 'pulse' },
    { label: 'Earliest stockout', value: '2.3', unit: 'days', detail: 'Chennai Central needs action', tone: 'critical', icon: 'clock' },
    { label: 'Critical count', value: '03', unit: '/ 8', detail: 'Facility stock coverage below 4 days', tone: 'critical', icon: 'alert' },
    { label: 'Patient-days at risk', value: '1,248', detail: 'Illustrative 7-day exposure', tone: 'watch', icon: 'people' },
  ],
  facilities: [
    { id: 'porur', name: 'Porur Community', x: 20, y: 62, risk: 'healthy', days: 14.2, medicine: 'Insulin 100 IU/mL' },
    { id: 'anna-nagar', name: 'Anna Nagar Medical', x: 34, y: 39, risk: 'watch', days: 6.4, medicine: 'Ceftriaxone 1 g' },
    { id: 'northside', name: 'Northside Medical', x: 55, y: 18, risk: 'critical', days: 2.8, medicine: 'Insulin 100 IU/mL' },
    { id: 'velachery', name: 'Velachery Hospital', x: 39, y: 82, risk: 'healthy', days: 12.9, medicine: 'Salbutamol 100 mcg' },
    { id: 'adyar', name: 'Adyar Health Centre', x: 67, y: 82, risk: 'critical', days: 3.1, medicine: 'Salbutamol 100 mcg' },
    { id: 'east-coast', name: 'East Coast Medical', x: 83, y: 61, risk: 'healthy', days: 9.7, medicine: 'Insulin 100 IU/mL' },
    { id: 'central', name: 'Chennai Central', x: 53, y: 57, risk: 'critical', days: 2.3, medicine: 'Ceftriaxone 1 g' },
    { id: 'tambaram', name: 'Tambaram PHC', x: 62, y: 44, risk: 'watch', days: 5.6, medicine: 'Ceftriaxone 1 g' },
  ],
  alerts: [
    { facility: 'Chennai Central', medicine: 'Ceftriaxone 1 g', summary: '2.3 days of stock remaining', status: 'Stockout risk within 4 days', tone: 'critical' },
    { facility: 'Northside Medical', medicine: 'Human Insulin 100 IU/mL', summary: '2.8 days of stock remaining', status: 'Stockout risk within 4 days', tone: 'critical' },
    { facility: 'Adyar Health Centre', medicine: 'Salbutamol 100 mcg', summary: '3.1 days of stock remaining', status: 'Stockout risk within 4 days', tone: 'critical' },
    { facility: 'Chennai Central', medicine: 'Demand spike +32%', summary: 'Ceftriaxone 1 g', status: 'Forecast divergence warning', tone: 'watch' },
  ],
};

export const facility = {
  id: 'central',
  name: 'Chennai Central',
  type: 'District hub',
  region: 'Chennai region',
  medicine: 'Ceftriaxone 1 g injection',
  presentation: '1 g vial',
  risk: 'critical',
  riskScore: 92,
  effectiveStock: 46,
  unit: 'vials',
  dailyDemand: 20,
  daysRemaining: 2.3,
  incomingSupply: { amount: 120, eta: 'in 6 days', status: 'Delayed 2 days' },
  cause: 'Demand shock',
  confidence: 'High confidence · 86%',
  freshness: 'Inventory synced 12 minutes ago',
  series: [89, 76, 65, 53, 46, 30, 10, 0, 0, 0, 0, 58, 38, 17],
  nextSteps: ['Review safe multi-source candidates', 'Verify the delayed replenishment', 'Send a plan for pharmacist approval'],
};

export const candidates = {
  target: 'Chennai Central',
  medicine: 'Insulin 100 IU/mL',
  request: 35,
  rows: [
    { id: 'north', facility: 'North PHC', distance: '14.2 km', type: 'Rural PHC', stock: 105, surplus: 70, chain: 'Compliant Tier-2', expiry: 'Nov 2026', eligible: false, reason: 'Would deplete donor to a critical level on day 9.' },
    { id: 'east', facility: 'East Clinic', distance: '6.5 km', type: 'Sub-hub', stock: 60, surplus: 25, chain: 'Compliant Tier-2', expiry: 'Oct 2026', eligible: true, reason: 'Retains protected coverage after a 20-vial transfer.' },
    { id: 'west', facility: 'West Station', distance: '22.8 km', type: 'Outpost', stock: 42, surplus: 15, chain: 'Transit log pending', expiry: 'Jan 2027', eligible: true, reason: 'Feasible with a cold-chain log confirmation.' },
    { id: 'south', facility: 'South General', distance: '17.1 km', type: 'Hospital', stock: 39, surplus: 4, chain: 'Compliant Tier-1', expiry: 'Sep 2026', eligible: false, reason: 'Insufficient usable shelf life for the route and receiver buffer.' },
  ],
};

export const simulation = {
  horizon: 14,
  scenarios: {
    single: {
      id: 'single', title: 'Single-donor pull', source: 'North PHC', status: 'Fails resilience threshold', tone: 'critical', result: 'North PHC stockout', copy: 'Pulling 35 vials triggers a critical donor risk on day 9.', before: [{ name: 'Chennai Central', days: 2.3, risk: 'critical' }, { name: 'North PHC', days: 10.6, risk: 'healthy' }], after: [{ name: 'Chennai Central', days: 7.0, risk: 'healthy' }, { name: 'North PHC', days: 0, risk: 'critical' }],
    },
    recommended: {
      id: 'recommended', title: 'Recommended multi-source split', source: 'East Clinic + West Station', status: 'Passes resilience threshold', tone: 'healthy', result: 'All sites retain safe coverage', copy: 'Split sourcing resolves the destination risk without creating a new donor stockout in 30 days.', before: [{ name: 'Chennai Central', days: 2.3, risk: 'critical' }, { name: 'East Clinic', days: 12.0, risk: 'healthy' }, { name: 'West Station', days: 8.8, risk: 'healthy' }], after: [{ name: 'Chennai Central', days: 7.0, risk: 'healthy' }, { name: 'East Clinic', days: 8.0, risk: 'healthy' }, { name: 'West Station', days: 5.8, risk: 'watch' }],
    },
  },
  impact: { saved: 142, warnings: 0, confidence: '82% confidence', notes: 'Projection considers current inventory buffers, regional vehicle availability, and weather status parameters.' },
};

export const plan = {
  id: 'PLAN-241', status: 'proposed', target: 'Chennai Central', medicine: 'Human Insulin 100 IU/mL', presentation: '100 IU/mL vial', rationale: 'A 20/15 split meets the target buffer while preserving protected coverage at both source facilities.', warning: 'Ensure cold-chain continuity during both transfers. This decision support does not replace licensed pharmacist oversight.', transfers: [
    { source: 'East Clinic', quantity: 20, remaining: 40, distance: '6.5 km', constraint: 'Cold-chain compliant · expires Oct 2026' },
    { source: 'West Station', quantity: 15, remaining: 27, distance: '22.8 km', constraint: 'Confirm transit temperature log · expires Jan 2027' },
  ],
  summary: { total: 35, projectedLife: '7 days', uncertainty: '18% · low', noNewStockouts: true },
};

export const audit = [
  { id: 'LEG-082', event: 'Simulation simulated', detail: 'Sourced 35 vials safely for Chennai Central', meta: 'East Clinic (20) and West Station (15) split', actor: 'Dr. A. Vance', at: '12 minutes ago', status: 'proposed', source: 'Scenario engine' },
  { id: 'LED-884', event: 'Alert overridden', detail: 'Bypassed single-donor sourcing route', meta: 'North PHC downstream warning flagged', actor: 'System auto-audit', at: '3 hours ago', status: 'bypass', source: 'Safety rule' },
  { id: 'LMD-411', event: 'Inventory logged', detail: 'Chennai Central stock reported below threshold', meta: 'Insulin count reached 12 vials', actor: 'Sensor node CH-A1', at: '4 hours ago', status: 'critical', source: 'IoT gateway' },
  { id: 'LED-620', event: 'Replenishment delayed', detail: 'Supplier arrival moved by two days', meta: 'Ceftriaxone 1 g · ETA now in 6 days', actor: 'Ops desk', at: '7 hours ago', status: 'watch', source: 'Inventory API' },
];
