const { AppError } = require('./errors');
const { getFacility, medicine, projectFacility } = require('./fixture-store');

function validateIntelligenceResponse(payload) {
  if (!payload || typeof payload !== 'object' || !payload.risk || !payload.forecast) {
    throw new Error('The intelligence response is missing forecast or risk data.');
  }
  if (!Number.isFinite(payload.risk.score) || typeof payload.risk.label !== 'string') {
    throw new Error('The intelligence response contains an invalid risk object.');
  }
  return payload;
}

function createFixtureForecast({ facilityId, medicineId, horizonDays }) {
  const facility = getFacility(facilityId);
  if (!facility || medicineId !== medicine.id) {
    throw new AppError(404, 'FORECAST_TARGET_NOT_FOUND', 'The requested facility or medicine was not found.');
  }
  const projection = projectFacility(facility);
  return {
    forecast: {
      dailyDemand: facility.dailyDemand,
      lowerBound: Math.max(0, facility.dailyDemand - 1),
      upperBound: facility.dailyDemand + 2,
      horizonDays
    },
    risk: { score: projection.riskScore, label: projection.riskLabel },
    stockout: { daysRemaining: projection.daysRemaining, projectedWithinHorizon: projection.daysRemaining <= horizonDays },
    confidence: { label: 'LOW', reason: 'Deterministic fixture fallback; awaiting the tested intelligence service.' },
    cause: facility.id === 'facility-navjeevan-phc' ? 'SUPPLY_DELAY' : 'INVENTORY_IMBALANCE',
    explanation: facility.id === 'facility-navjeevan-phc'
      ? 'Simulated stock will deplete before the scheduled replenishment arrives.'
      : 'Simulated coverage is based on effective stock and daily demand.',
    source: 'FIXTURE_FALLBACK',
    decisionSupportOnly: true
  };
}

function createIntelligenceAdapter(config) {
  return {
    async forecast(input) {
      if (!config.intelligenceServiceUrl) return createFixtureForecast(input);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.intelligenceTimeoutMs);
      try {
        const response = await fetch(`${config.intelligenceServiceUrl}/forecast`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`Intelligence service returned ${response.status}.`);
        const payload = validateIntelligenceResponse(await response.json());
        return { ...payload, source: 'INTELLIGENCE_SERVICE', decisionSupportOnly: true };
      } catch (error) {
        return {
          ...createFixtureForecast(input),
          fallbackReason: error.name === 'AbortError' ? 'INTELLIGENCE_TIMEOUT' : 'INTELLIGENCE_UNAVAILABLE'
        };
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

module.exports = { createIntelligenceAdapter, validateIntelligenceResponse };

