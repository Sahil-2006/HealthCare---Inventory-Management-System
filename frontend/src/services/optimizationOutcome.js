// A safety rejection is a completed decision-support result, not an outage.
export function noSafePlanOutcome(error, { horizon, quantity }) {
  if (error.status !== 422 || error.code !== 'NO_SAFE_PLAN') throw error;
  return {
    noSafePlan: true,
    horizon,
    quantity,
    message: error.message,
    details: error.details || {},
  };
}
