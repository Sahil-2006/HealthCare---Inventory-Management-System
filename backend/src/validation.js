const { AppError } = require('./errors');

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(400, 'INVALID_REQUEST', `${label} must be an object.`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError(400, 'INVALID_REQUEST', `${label} is required.`);
  }
  return value.trim();
}

function readHorizon(value) {
  if (value === undefined) return 14;
  if (![7, 14, 30].includes(value)) {
    throw new AppError(400, 'INVALID_HORIZON', 'horizonDays must be one of 7, 14, or 30.');
  }
  return value;
}

function validateForecastRequest(body) {
  const input = requireObject(body, 'Request body');
  return {
    facilityId: requireString(input.facilityId, 'facilityId'),
    medicineId: requireString(input.medicineId, 'medicineId'),
    horizonDays: readHorizon(input.horizonDays)
  };
}

function validateTransfers(body) {
  const input = requireObject(body, 'Request body');
  const horizonDays = readHorizon(input.horizonDays);
  if (!Array.isArray(input.transfers) || input.transfers.length === 0) {
    throw new AppError(400, 'INVALID_REQUEST', 'transfers must include at least one transfer.');
  }
  return {
    horizonDays,
    transfers: input.transfers.map((transfer, index) => {
      requireObject(transfer, `transfers[${index}]`);
      if (!Number.isFinite(transfer.quantity) || transfer.quantity <= 0) {
        throw new AppError(400, 'INVALID_REQUEST', `transfers[${index}].quantity must be a positive number.`);
      }
      const arrivalDay = transfer.arrivalDay === undefined ? 1 : transfer.arrivalDay;
      if (!Number.isInteger(arrivalDay) || arrivalDay < 1) {
        throw new AppError(400, 'INVALID_REQUEST', `transfers[${index}].arrivalDay must be a whole number of at least 1.`);
      }
      return {
        fromFacilityId: requireString(transfer.fromFacilityId, `transfers[${index}].fromFacilityId`),
        toFacilityId: requireString(transfer.toFacilityId, `transfers[${index}].toFacilityId`),
        medicineId: requireString(transfer.medicineId, `transfers[${index}].medicineId`),
        quantity: transfer.quantity,
        arrivalDay
      };
    })
  };
}

function validateOptimizeRequest(body) {
  const input = requireObject(body, 'Request body');
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new AppError(400, 'INVALID_REQUEST', 'quantity must be a positive number.');
  }
  return {
    destinationFacilityId: requireString(input.destinationFacilityId, 'destinationFacilityId'),
    medicineId: requireString(input.medicineId, 'medicineId'),
    quantity: input.quantity,
    horizonDays: readHorizon(input.horizonDays)
  };
}

function validateDecision(body) {
  const input = requireObject(body, 'Request body');
  if (!['APPROVE', 'REJECT'].includes(input.decision)) {
    throw new AppError(400, 'INVALID_DECISION', 'decision must be APPROVE or REJECT.');
  }
  return {
    decision: input.decision,
    note: requireString(input.note, 'note')
  };
}

module.exports = { validateForecastRequest, validateTransfers, validateOptimizeRequest, validateDecision };
