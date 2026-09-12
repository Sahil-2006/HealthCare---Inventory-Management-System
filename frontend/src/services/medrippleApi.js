import { audit as mockAudit, candidates, dashboard, facility, plan, simulation } from '../data/mockData';

const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '');
const useMocks = import.meta.env.VITE_USE_MOCKS === 'true' || !apiBase;
const destinationFacilityId = 'facility-navjeevan-phc';
const requestedQuantity = 45;
let facilityCache = null;
let planCache = null;
let auditEvents = [...mockAudit];

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const pause = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));
const riskTone = (label = '') => label === 'CRITICAL' ? 'critical' : label === 'LOW' ? 'healthy' : 'watch';
const displayRisk = (label = '') => ({ CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Watch', LOW: 'Healthy' }[label] || 'Watch');
const titleCase = (value = '') => value.toLowerCase().replace(/(^|_)([a-z])/g, (_, separator, char) => `${separator ? ' ' : ''}${char.toUpperCase()}`);
const safeNumber = (value) => Number.isFinite(value) ? value : 0;

function facilityPosition(id, index) {
  const positions = {
    'facility-central-store': [18, 28],
    'facility-district-hospital': [46, 22],
    'facility-river-chc': [65, 54],
    'facility-navjeevan-phc': [39, 76],
  };
  return positions[id] || [20 + (index * 18) % 65, 25 + (index * 23) % 55];
}

function createStockSeries(stock, demand, incoming) {
  let current = stock;
  return Array.from({ length: 14 }, (_, index) => {
    current = Math.max(0, current - demand);
    if (incoming && index + 1 === incoming.expectedInDays) current += incoming.quantity;
    return Math.min(100, Math.round(current));
  });
}

function formatTime(timestamp) {
  if (!timestamp) return 'Just now';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(payload?.error?.message || `Request failed (${response.status})`, response.status);
  return payload?.data;
}

async function getFacilities() {
  if (!facilityCache) facilityCache = await request('/facilities');
  return facilityCache;
}

function mapDashboard(summary, rawFacilities) {
  const facilities = rawFacilities.map((item, index) => {
    const [x, y] = facilityPosition(item.facilityId, index);
    return { id: item.facilityId, name: item.facilityName, x, y, risk: riskTone(item.riskLabel), days: item.daysRemaining, medicine: 'Human insulin 100 IU/mL' };
  });
  const alertFacilities = new Map(rawFacilities.map((item) => [item.facilityId, item]));
  return {
    snapshotAt: summary.dataFreshness || 'Live backend',
    dateLabel: 'Live fixture',
    metrics: [
      { label: 'Resilience score', value: `${summary.resilienceScore}%`, detail: 'Regional fixture calculation', tone: summary.resilienceScore >= 70 ? 'healthy' : 'watch', icon: 'pulse' },
      { label: 'Earliest stockout', value: summary.earliestStockout?.daysRemaining ?? '—', unit: 'days', detail: summary.earliestStockout?.facilityName || 'No critical facility', tone: 'critical', icon: 'clock' },
      { label: 'Critical count', value: String(summary.criticalFacilityCount).padStart(2, '0'), unit: `/ ${rawFacilities.length}`, detail: 'Facility stock coverage below 4 days', tone: 'critical', icon: 'alert' },
      { label: 'Patient-days at risk', value: String(summary.patientDaysAtRisk), detail: 'Fixture projection across the network', tone: 'watch', icon: 'people' },
    ],
    facilities,
    alerts: summary.alerts.map((alert) => {
      const source = alertFacilities.get(alert.facilityId);
      return {
        facility: source?.facilityName || alert.facilityId,
        medicine: 'Human insulin 100 IU/mL',
        summary: `${alert.daysRemaining} days of stock remaining`,
        status: `${titleCase(alert.cause)} · ${displayRisk(alert.riskLabel)} risk`,
        tone: riskTone(alert.riskLabel),
      };
    }),
  };
}

function mapPlan(rawPlan, rawFacilities) {
  const sources = new Map(rawFacilities.map((item) => [item.facilityId, item]));
  const destination = sources.get(rawPlan.transfers?.[0]?.toFacilityId) || sources.get(destinationFacilityId);
  const outcome = rawPlan.simulation?.intervention?.facilities?.find((item) => item.facilityId === destination?.facilityId);
  return {
    id: rawPlan.id,
    status: rawPlan.status.toLowerCase(),
    target: destination?.facilityName || 'Destination facility',
    medicine: `${rawPlan.medicine.genericName} ${rawPlan.medicine.strength}`,
    presentation: rawPlan.medicine.dosageForm,
    rationale: rawPlan.rationale,
    warning: 'Confirm cold-chain continuity and the exact medicine presentation before release. This prototype is decision support and does not replace pharmacist oversight.',
    transfers: rawPlan.transfers.map((transfer) => {
      const source = sources.get(transfer.fromFacilityId);
      return {
        source: source?.facilityName || transfer.fromFacilityId,
        quantity: transfer.quantity,
        remaining: Math.max(0, safeNumber(source?.effectiveStock) - transfer.quantity),
        distance: `${rawPlan.simulation?.transferEvaluations?.find((item) => item.fromFacilityId === transfer.fromFacilityId)?.route?.distanceKm ?? '—'} km`,
        constraint: 'Exact presentation match · cold-chain route required',
      };
    }),
    summary: {
      total: rawPlan.transfers.reduce((sum, transfer) => sum + transfer.quantity, 0),
      projectedLife: outcome ? `${outcome.daysRemaining} days` : 'Review simulation',
      uncertainty: 'Fixture model · low confidence',
      noNewStockouts: rawPlan.simulation?.comparison?.newRisks?.length === 0,
    },
  };
}

function mapAudit(event) {
  const approved = event.action === 'PLAN_APPROVED';
  return {
    id: event.id,
    event: approved ? 'Transfer plan approved' : 'Transfer plan rejected',
    detail: approved ? 'Recommended transfer plan released after human review' : 'Recommended transfer plan returned for re-routing',
    meta: event.note,
    actor: event.actor,
    at: formatTime(event.timestamp),
    status: approved ? 'approved' : 'rejected',
    source: 'Human approval',
  };
}

function buildScenario(title, source, result, tone, facilitiesBefore, facilitiesAfter, copy) {
  return {
    id: title === 'Single-donor pull' ? 'single' : 'recommended', title, source, status: tone === 'healthy' ? 'Passes safety constraints' : 'Fails safety constraints', tone, result, copy,
    before: facilitiesBefore.map((item) => ({ name: item.facilityName, days: item.daysRemaining, risk: riskTone(item.riskLabel) })),
    after: facilitiesAfter.map((item) => ({ name: item.facilityName, days: item.daysRemaining, risk: riskTone(item.riskLabel) })),
  };
}

async function liveSimulation(horizon) {
  const rawFacilities = await getFacilities();
  const destination = rawFacilities.find((item) => item.facilityId === destinationFacilityId);
  const unsafeSource = rawFacilities.find((item) => item.facilityId === 'facility-district-hospital') || rawFacilities.find((item) => item.facilityId !== destinationFacilityId);
  const [optimisedPlan, unsafe] = await Promise.all([
    request('/plans/optimize', { method: 'POST', body: JSON.stringify({ destinationFacilityId, medicineId: destination.medicineId, quantity: requestedQuantity, horizonDays: horizon }) }),
    request('/scenarios/simulate', { method: 'POST', body: JSON.stringify({ horizonDays: horizon, transfers: [{ fromFacilityId: unsafeSource.facilityId, toFacilityId: destinationFacilityId, medicineId: destination.medicineId, quantity: requestedQuantity, arrivalDay: 1 }] }) }),
  ]);
  const unsafeEvaluation = unsafe.transferEvaluations[0];
  const recommended = optimisedPlan.simulation;
  const recommendedSources = optimisedPlan.transfers.map((transfer) => rawFacilities.find((item) => item.facilityId === transfer.fromFacilityId)?.facilityName || transfer.fromFacilityId).join(' + ');
  const scopedUnsafe = unsafe.baseline.facilities.filter((item) => item.facilityId === destinationFacilityId || item.facilityId === unsafeSource.facilityId);
  const scopedUnsafeAfter = unsafe.intervention.facilities.filter((item) => item.facilityId === destinationFacilityId || item.facilityId === unsafeSource.facilityId);
  const recommendedIds = new Set([destinationFacilityId, ...optimisedPlan.transfers.map((item) => item.fromFacilityId)]);
  const scopedRecommended = recommended.baseline.facilities.filter((item) => recommendedIds.has(item.facilityId));
  const scopedRecommendedAfter = recommended.intervention.facilities.filter((item) => recommendedIds.has(item.facilityId));
  return {
    horizon,
    selected: 'recommended',
    scenarios: {
      single: buildScenario('Single-donor pull', unsafeSource.facilityName, unsafeEvaluation.eligible ? 'Transfer can proceed' : 'Blocked to protect donor safety stock', unsafeEvaluation.eligible ? 'watch' : 'critical', scopedUnsafe, scopedUnsafeAfter, unsafeEvaluation.eligible ? 'The simulator accepted this transfer.' : unsafeEvaluation.rejectionReasons[0]),
      recommended: buildScenario('Recommended multi-source split', recommendedSources, recommended.comparison.safeToRecommend ? 'All sites retain safe coverage' : 'Safety review required', recommended.comparison.safeToRecommend ? 'healthy' : 'watch', scopedRecommended, scopedRecommendedAfter, optimisedPlan.rationale),
    },
    impact: {
      saved: Math.max(0, (recommended.baseline.criticalFacilityCount - recommended.intervention.criticalFacilityCount) * horizon),
      warnings: recommended.comparison.newRisks.length,
      confidence: 'Fixture model · low confidence',
      notes: recommended.limitations.join(' '),
    },
  };
}

export const medrippleApi = {
  async getDashboard() {
    if (useMocks) { await pause(); return dashboard; }
    const [summary, rawFacilities] = await Promise.all([request('/region/summary'), getFacilities()]);
    return mapDashboard(summary, rawFacilities);
  },

  async getFacility(facilityId = destinationFacilityId) {
    if (useMocks) { await pause(); return { ...facility, id: facilityId }; }
    const [inventory, forecast, rawFacilities] = await Promise.all([
      request(`/facilities/${facilityId}/inventory`),
      request('/forecast', { method: 'POST', body: JSON.stringify({ facilityId, medicineId: 'med-insulin-100iu-vial', horizonDays: 14 }) }),
      getFacilities(),
    ]);
    const projected = rawFacilities.find((item) => item.facilityId === facilityId);
    const incoming = inventory.incomingReplenishment;
    return {
      id: facilityId, name: inventory.facility.name, type: titleCase(inventory.facility.type), region: 'Medripple District',
      medicine: `${inventory.medicine.genericName} ${inventory.medicine.strength}`, presentation: inventory.medicine.dosageForm,
      risk: riskTone(forecast.risk.label), riskScore: forecast.risk.score, effectiveStock: inventory.effectiveStock, unit: inventory.medicine.unit,
      dailyDemand: inventory.dailyConsumption, daysRemaining: forecast.stockout.daysRemaining,
      incomingSupply: incoming ? { amount: incoming.quantity, eta: `in ${incoming.expectedInDays} days`, status: incoming.status === 'EXPECTED' ? 'Scheduled replenishment' : incoming.status } : { amount: 0, eta: 'No incoming supply', status: 'No replenishment recorded' },
      cause: titleCase(forecast.cause), confidence: `${titleCase(forecast.confidence.label)} confidence · fixture fallback`, freshness: projected?.dataFreshness || 'Backend fixture',
      series: createStockSeries(inventory.effectiveStock, inventory.dailyConsumption, incoming),
      nextSteps: ['Review safe multi-source candidates', 'Verify replenishment timing and cold-chain routing', 'Send a plan for pharmacist approval'],
    };
  },

  async getCandidates({ facilityId = destinationFacilityId } = {}) {
    if (useMocks) { await pause(); return candidates; }
    const rawFacilities = await getFacilities();
    const destination = rawFacilities.find((item) => item.facilityId === facilityId);
    const sources = rawFacilities.filter((item) => item.facilityId !== facilityId);
    const rows = await Promise.all(sources.map(async (source) => {
      const transferQuantity = Math.min(requestedQuantity, Math.max(1, source.safeSurplus));
      const [scenario, inventory] = await Promise.all([
        request('/scenarios/simulate', { method: 'POST', body: JSON.stringify({ horizonDays: 14, transfers: [{ fromFacilityId: source.facilityId, toFacilityId: facilityId, medicineId: destination.medicineId, quantity: transferQuantity, arrivalDay: 1 }] }) }),
        request(`/facilities/${source.facilityId}/inventory`),
      ]);
      const evaluation = scenario.transferEvaluations[0];
      const usableBatch = inventory.batches.find((batch) => batch.status === 'USABLE');
      return {
        id: source.facilityId, facility: source.facilityName, distance: evaluation.route?.distanceKm === null ? 'Route unavailable' : `${evaluation.route?.distanceKm ?? '—'} km`, type: titleCase(source.type),
        stock: source.effectiveStock, surplus: source.safeSurplus, chain: evaluation.route?.coldChainAvailable ? 'Cold-chain available' : 'Cold-chain unavailable', expiry: usableBatch?.expiryDate || 'No usable batch', eligible: evaluation.eligible,
        reason: evaluation.eligible ? `Retains protected coverage after a ${transferQuantity}-vial transfer.` : evaluation.rejectionReasons.join(' '),
      };
    }));
    return { target: destination.facilityName, medicine: 'Human insulin 100 IU/mL', request: requestedQuantity, rows, safeCapacity: rows.filter((row) => row.eligible).reduce((total, row) => total + row.surplus, 0), protectedCount: rows.filter((row) => !row.eligible).length };
  },

  async simulate({ horizon = 14 } = {}) {
    if (useMocks) { await pause(240); return { ...simulation, horizon }; }
    return liveSimulation(horizon);
  },

  async getPlan() {
    if (useMocks) { await pause(); return plan; }
    const rawFacilities = await getFacilities();
    const destination = rawFacilities.find((item) => item.facilityId === destinationFacilityId);
    const rawPlan = await request('/plans/optimize', { method: 'POST', body: JSON.stringify({ destinationFacilityId, medicineId: destination.medicineId, quantity: requestedQuantity, horizonDays: 14 }) });
    planCache = rawPlan;
    return mapPlan(rawPlan, rawFacilities);
  },

  async decidePlan({ planId, decision, note }) {
    if (useMocks) {
      await pause(260);
      const event = { id: `LED-${Math.floor(100 + Math.random() * 899)}`, event: decision === 'approved' ? 'Transfer plan approved' : 'Transfer plan rejected', detail: decision === 'approved' ? 'Recommended multi-source plan released for operations' : 'Recommended plan returned for re-routing', meta: note || 'No approval note recorded', actor: 'Regional coordinator', at: 'Just now', status: decision, source: 'Human approval' };
      auditEvents = [event, ...auditEvents];
      return { ...plan, id: planId, status: decision, auditEvent: event };
    }
    const response = await request(`/plans/${planId}/approve`, { method: 'POST', body: JSON.stringify({ decision: decision === 'approved' ? 'APPROVE' : 'REJECT', actor: 'regional-coordinator', note: note.trim() || 'Decision recorded in the MEDRIPPLE workspace.' }) });
    planCache = { ...response.plan, simulation: planCache?.simulation };
    return mapPlan(planCache, await getFacilities());
  },

  async getAudit() {
    if (useMocks) { await pause(); return auditEvents; }
    return (await request('/audit')).map(mapAudit);
  },
};
