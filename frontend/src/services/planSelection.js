// Persist only the selection; the backend remains the source of truth for a plan.
export function createPlanSelection(storage) {
  const key = 'medripple.selectedPlan';
  let current;
  try { current = JSON.parse(storage?.getItem(key) || 'null'); } catch { current = null; }
  if (!current || (typeof current.planId !== 'string' && current.noSafePlan !== true)) current = null;
  return {
    get: () => current,
    set(value) {
      current = value;
      try {
        if (value) storage?.setItem(key, JSON.stringify(value));
        else storage?.removeItem(key);
      } catch { /* A blocked storage API must not prevent in-session review. */ }
    },
  };
}

export async function loadSelectedPlan(selection, fetchPlan) {
  const selected = selection.get();
  if (!selected) return { noSelectedPlan: true };
  if (selected.noSafePlan) return selected;
  try { return await fetchPlan(selected.planId); }
  catch (error) {
    if (error.status !== 404) throw error;
    selection.set(null);
    return { noSelectedPlan: true, missingPlan: true };
  }
}
