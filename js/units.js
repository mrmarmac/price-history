/* Pure unit logic. Allowed units: g, kg, ml, l, pcs.
 * Only same-dimension comparisons are legal (kg↔g, l↔ml, pcs↔pcs);
 * mass is never compared with volume or count. */

import { roundMinor } from './money.js';

export const UNITS = ['g', 'kg', 'ml', 'l', 'pcs'];

const DIMENSION = { g: 'mass', kg: 'mass', ml: 'volume', l: 'volume', pcs: 'count' };

/* Reference units for unit_price normalisation: 1 kg, 1 l, 1 pc. */
const TO_REFERENCE = { g: 1 / 1000, kg: 1, ml: 1 / 1000, l: 1, pcs: 1 };
export const REFERENCE_UNIT = { mass: 'kg', volume: 'l', count: 'pcs' };

export function isValidUnit(u) {
  return UNITS.includes(u);
}

export function dimension(unit) {
  return DIMENSION[unit] || null;
}

export function comparable(unitA, unitB) {
  const a = dimension(unitA);
  return a !== null && a === dimension(unitB);
}

/* Convert a quantity in `unit` to reference units (kg / l / pcs). */
export function toReferenceQuantity(quantity, unit) {
  const f = TO_REFERENCE[unit];
  if (f === undefined) return null;
  return quantity * f;
}

export function referenceUnitFor(unit) {
  const dim = dimension(unit);
  return dim ? REFERENCE_UNIT[dim] : null;
}

/* unit_price = total price per 1 reference unit, in integer minor units,
 * rounded exactly once. `size` is the package size in `unit`, `quantity`
 * the number of packages (or measured amount for weighed goods where
 * size carries the measured quantity and quantity is 1).
 * Returns null when not computable (invalid input). */
export function computeUnitPrice(totalMinor, size, unit, quantity = 1) {
  if (!Number.isFinite(totalMinor)) return null;
  if (!Number.isFinite(size) || size <= 0) return null;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const refQty = toReferenceQuantity(size * quantity, unit);
  if (refQty === null || refQty <= 0) return null;
  return {
    unit_price: roundMinor(totalMinor / refQty),
    reference_quantity: 1,
    reference_unit: referenceUnitFor(unit),
  };
}

export function formatSize(size, unit) {
  return `${size}${unit === 'pcs' ? ' pcs' : ' ' + unit}`;
}
