export const LAYOUT_ZOOM_MIN = 0.25
export const LAYOUT_ZOOM_MAX = 4

export function clampLayoutZoom(z: number): number {
  return Math.min(LAYOUT_ZOOM_MAX, Math.max(LAYOUT_ZOOM_MIN, z))
}
