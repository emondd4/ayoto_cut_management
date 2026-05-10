import type { DisplayUnit } from './units'

export type ShapeKind = 'rectangle' | 'custom'

export interface CutPattern {
  id: string
  name: string
  kind: ShapeKind
  /** Bounding width for packing (mm) — actual cut */
  widthMm: number
  /** Bounding height for packing (mm) — actual cut */
  heightMm: number
  /** Declared area for custom shapes (mm²), optional */
  areaMm2?: number
  quantity: number
  color: string
  /** Optional reference image (data URL or blob URL) */
  imageUrl?: string
  /** Uniform clearance on each side around the cut (mm), included in sheet footprint */
  safeMarginMm: number
  /** Unit shown next to the safe-area input (value is always stored as mm) */
  safeMarginUnit: DisplayUnit
  /** Stroke color for safe-zone outline in previews / PDF */
  safeBorderColor: string
}

export interface PackItemInput {
  /** Footprint width on sheet (cut + 2×safe + kerf) */
  widthMm: number
  /** Footprint height on sheet */
  heightMm: number
  /** Cut width before safe/kerf (oriented like footprint) */
  cutWidthMm: number
  cutHeightMm: number
  safeMarginMm: number
  safeBorderColor: string
  /** Kerf added once per dimension (for drawing cut inset) */
  kerfMm: number
  partId: string
  label: string
  color: string
  instanceKey: string
  kind: ShapeKind
  imageUrl?: string
}

export interface PlacedPiece {
  x: number
  y: number
  /** Packed footprint */
  widthMm: number
  heightMm: number
  /** Actual cut size (oriented) */
  cutWidthMm: number
  cutHeightMm: number
  safeMarginMm: number
  safeBorderColor: string
  kerfMm: number
  rotated: boolean
  partId: string
  label: string
  color: string
  instanceKey: string
  kind: ShapeKind
  imageUrl?: string
}

export interface PackResult {
  placed: PlacedPiece[]
  unplaced: PackItemInput[]
  sheetWidthMm: number
  sheetHeightMm: number
}
