/** Internal numeric values are always in millimeters (mm). */

export type DisplayUnit = 'mm' | 'cm' | 'in' | 'ft'

const MM_PER_IN = 25.4
const MM_PER_FT = 304.8

export function toMm(value: number, unit: DisplayUnit): number {
  switch (unit) {
    case 'mm':
      return value
    case 'cm':
      return value * 10
    case 'in':
      return value * MM_PER_IN
    case 'ft':
      return value * MM_PER_FT
    default:
      return value
  }
}

export function fromMm(mm: number, unit: DisplayUnit): number {
  switch (unit) {
    case 'mm':
      return mm
    case 'cm':
      return mm / 10
    case 'in':
      return mm / MM_PER_IN
    case 'ft':
      return mm / MM_PER_FT
    default:
      return mm
  }
}

export function formatMm(mm: number, unit: DisplayUnit, decimals = 2): string {
  const v = fromMm(mm, unit)
  const d = unit === 'mm' ? Math.min(decimals, 1) : decimals
  return `${v.toFixed(d)} ${unit}`
}

export function unitLabel(unit: DisplayUnit): string {
  switch (unit) {
    case 'mm':
      return 'Millimeters'
    case 'cm':
      return 'Centimeters'
    case 'in':
      return 'Inches'
    case 'ft':
      return 'Feet'
  }
}

/** Convert a numeric area in **unit²** (e.g. ft² when unit is ft) into mm². */
export function areaToMm2(value: number, unit: DisplayUnit): number {
  const sideMm = toMm(1, unit)
  return value * sideMm * sideMm
}

export function formatAreaMm2(mm2: number, unit: DisplayUnit): string {
  switch (unit) {
    case 'mm':
      return `${mm2.toFixed(0)} mm²`
    case 'cm':
      return `${(mm2 / 100).toFixed(2)} cm²`
    case 'in':
      return `${(mm2 / (MM_PER_IN * MM_PER_IN)).toFixed(2)} in²`
    case 'ft':
      return `${(mm2 / (MM_PER_FT * MM_PER_FT)).toFixed(4)} ft²`
  }
}
