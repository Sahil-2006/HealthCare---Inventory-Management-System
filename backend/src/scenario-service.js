const { AppError } = require('./errors');
const { medicine, getFacility, getRoute, listFacilities, projectFacility } = require('./fixture-store');

function evaluateTransfer(transfer) {
  const source = getFacility(transfer.fromFacilityId);
  const destination = getFacility(transfer.toFacilityId);
  const reasons = [];
  if (!source || !destination) reasons.push('A source or destination facility does not exist.');
  if (transfer.medicineId !== medicine.id) reasons.push('Medicine identity does not exactly match the simulated inventory.');
  if (source && source.id === destination?.id) reasons.push('A transfer cannot use the same source and destination.');
  const route = source && destination ? getRoute(source.id, destination.id) : null;
  if (!route?.coldChainAvailable) reasons.push('The route cannot maintain the required simulated cold-chain condition.');
  if (source && projectFacility(source, -transfer.quantity).effectiveStock < source.dailyDemand * source.protectedDays) {
    reasons.push('The donor would fall below protected safety stock.');
  }
  if (transfer.arrivalDay < 1) reasons.push('arrivalDay must be at least 1.');

  return { ...transfer, eligible: reasons.length === 0, rejectionReasons: reasons, route };
}

function simulateScenario({ transfers, horizonDays }) {
  const evaluations = transfers.map(evaluateTransfer);
  const adjustments = new Map();
  for (const evaluation of evaluations) {
    if (!evaluation.eligible) continue;
    adjustments.set(evaluation.fromFacilityId, (adjustments.get(evaluation.fromFacilityId) || 0) - evaluation.quantity);
    adjustments.set(evaluation.toFacilityId, (adjustments.get(evaluation.toFacilityId) || 0) + evaluation.quantity);
  }
  const before = listFacilities().map((facility) => projectFacility(facility));
  const after = listFacilities().map((facility) => projectFacility(getFacility(facility.facilityId), adjustments.get(facility.facilityId) || 0));
  const beforeCritical = before.filter((facility) => facility.riskLabel === 'CRITICAL').length;
  const afterCritical = after.filter((facility) => facility.riskLabel === 'CRITICAL').length;
  const newRisks = after.filter((facility) => {
    const previous = before.find((item) => item.facilityId === facility.facilityId);
    return previous.riskLabel !== 'CRITICAL' && facility.riskLabel === 'CRITICAL';
  });

  return {
    scenarioType: 'SIMULATED_FIXTURE',
    horizonDays,
    transferEvaluations: evaluations,
    baseline: { facilities: before, criticalFacilityCount: beforeCritical },
    intervention: { facilities: after, criticalFacilityCount: afterCritical, appliedTransferCount: evaluations.filter((item) => item.eligible).length },
    comparison: {
      criticalFacilityDelta: afterCritical - beforeCritical,
      newRisks,
      safeToRecommend: evaluations.every((item) => item.eligible) && newRisks.length === 0
    },
    limitations: ['Fixture model projects only the selected medicine.', 'Replace with the tested intelligence service and database data before release.']
  };
}

function optimisePlan(input, createPlan) {
  const destination = getFacility(input.destinationFacilityId);
  if (!destination || input.medicineId !== medicine.id) {
    throw new AppError(404, 'OPTIMIZATION_TARGET_NOT_FOUND', 'The requested facility or medicine was not found.');
  }
  const plan = createPlan(input);
  const simulation = simulateScenario({ transfers: plan.transfers, horizonDays: input.horizonDays });
  if (!simulation.comparison.safeToRecommend) {
    throw new AppError(422, 'NO_SAFE_PLAN', 'The fixture optimiser could not produce a safe plan.');
  }
  return { ...plan, simulation, decisionSupportOnly: true };
}

module.exports = { simulateScenario, optimisePlan };

