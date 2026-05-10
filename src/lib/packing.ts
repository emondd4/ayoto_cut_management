import type { PackItemInput, PackResult, PlacedPiece } from './types'

interface FreeRect {
  x: number
  y: number
  w: number
  h: number
}

function fits(w: number, h: number, fr: FreeRect): boolean {
  return w <= fr.w && h <= fr.h
}

/** Guillotine split: right strip + bottom strip */
function splitFreeRect(fr: FreeRect, pw: number, ph: number): FreeRect[] {
  const next: FreeRect[] = []
  const rw = fr.w - pw
  const rh = fr.h - ph
  if (rw > 0 && ph > 0) {
    next.push({ x: fr.x + pw, y: fr.y, w: rw, h: ph })
  }
  if (rh > 0) {
    next.push({ x: fr.x, y: fr.y + ph, w: fr.w, h: rh })
  }
  return next
}

function scoreFit(fr: FreeRect, pw: number, ph: number): number {
  const waste = fr.w * fr.h - pw * ph
  const shortSide = Math.min(fr.w - pw, fr.h - ph)
  return waste * 1000 + shortSide
}

/**
 * Single-pass guillotine packing. Items placed in given order.
 * Tries rotation when allowRotate is true.
 */
export function packGuillotine(
  sheetWidthMm: number,
  sheetHeightMm: number,
  items: PackItemInput[],
  allowRotate: boolean,
): Omit<PackResult, 'sheetWidthMm' | 'sheetHeightMm'> {
  const sorted = [...items].sort(
    (a, b) =>
      Math.max(b.widthMm, b.heightMm) - Math.max(a.widthMm, a.heightMm),
  )

  let free: FreeRect[] = [{ x: 0, y: 0, w: sheetWidthMm, h: sheetHeightMm }]
  const placed: PlacedPiece[] = []
  const unplaced: PackItemInput[] = []

  for (const item of sorted) {
    const orientations: Array<{
      w: number
      h: number
      cw: number
      ch: number
      rotated: boolean
    }> = [{ w: item.widthMm, h: item.heightMm, cw: item.cutWidthMm, ch: item.cutHeightMm, rotated: false }]
    if (
      allowRotate &&
      (item.widthMm !== item.heightMm ||
        item.kind === 'rectangle' ||
        item.kind === 'custom')
    ) {
      orientations.push({
        w: item.heightMm,
        h: item.widthMm,
        cw: item.cutHeightMm,
        ch: item.cutWidthMm,
        rotated: true,
      })
    }

    let bestFrIdx = -1
    let bestOri = orientations[0]
    let bestScore = Number.POSITIVE_INFINITY

    for (let i = 0; i < free.length; i++) {
      const fr = free[i]
      for (const o of orientations) {
        if (fits(o.w, o.h, fr)) {
          const sc = scoreFit(fr, o.w, o.h)
          if (sc < bestScore) {
            bestScore = sc
            bestFrIdx = i
            bestOri = o
          }
        }
      }
    }

    if (bestFrIdx < 0) {
      unplaced.push(item)
      continue
    }

    const fr = free[bestFrIdx]
    const { w: pw, h: ph, cw, ch, rotated } = bestOri
    free.splice(bestFrIdx, 1)
    free.push(...splitFreeRect(fr, pw, ph))

    free = mergeFreeRects(cleanFreeRects(free))

    placed.push({
      x: fr.x,
      y: fr.y,
      widthMm: pw,
      heightMm: ph,
      cutWidthMm: cw,
      cutHeightMm: ch,
      safeMarginMm: item.safeMarginMm,
      safeBorderColor: item.safeBorderColor,
      kerfMm: item.kerfMm,
      rotated,
      partId: item.partId,
      label: item.label,
      color: item.color,
      instanceKey: item.instanceKey,
      kind: item.kind,
      imageUrl: item.imageUrl,
    })
  }

  return { placed, unplaced }
}

function cleanFreeRects(free: FreeRect[]): FreeRect[] {
  return free.filter((r) => r.w > 0.01 && r.h > 0.01)
}

/** Merge adjacent rects with same y,h and touching x — simple cleanup */
function mergeFreeRects(free: FreeRect[]): FreeRect[] {
  let changed = true
  const rects = [...free]
  while (changed) {
    changed = false
    outer: for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]
        const b = rects[j]
        if (a.y === b.y && a.h === b.h && Math.abs(a.x + a.w - b.x) < 0.01) {
          rects[i] = { x: a.x, y: a.y, w: a.w + b.w, h: a.h }
          rects.splice(j, 1)
          changed = true
          break outer
        }
        if (a.x === b.x && a.w === b.w && Math.abs(a.y + a.h - b.y) < 0.01) {
          rects[i] = { x: a.x, y: a.y, w: a.w, h: a.h + b.h }
          rects.splice(j, 1)
          changed = true
          break outer
        }
      }
    }
  }
  return rects
}

const DEFAULT_SAFE_BORDER = '#b45309'

export function expandPatternsToItems(
  patterns: import('./types').CutPattern[],
  kerfMm: number,
): PackItemInput[] {
  const k = Math.max(0, kerfMm)
  const out: PackItemInput[] = []
  for (const p of patterns) {
    const n = Math.max(0, Math.floor(p.quantity))
    const s = Math.max(0, p.safeMarginMm ?? 0)
    const cw = p.widthMm
    const ch = p.heightMm
    const footprintW = cw + 2 * s + k
    const footprintH = ch + 2 * s + k
    for (let i = 0; i < n; i++) {
      out.push({
        widthMm: footprintW,
        heightMm: footprintH,
        cutWidthMm: cw,
        cutHeightMm: ch,
        safeMarginMm: s,
        safeBorderColor: p.safeBorderColor?.trim() || DEFAULT_SAFE_BORDER,
        kerfMm: k,
        partId: p.id,
        label: p.name,
        color: p.color,
        instanceKey: `${p.id}:${i}`,
        kind: p.kind,
        imageUrl: p.imageUrl,
      })
    }
  }
  return out
}

/** Greedy: add one piece at a time (any pattern), full repack each step */
export function packGreedyMaximum(
  sheetWidthMm: number,
  sheetHeightMm: number,
  templates: import('./types').CutPattern[],
  allowRotate: boolean,
  kerfMm: number,
): PackResult {
  if (!templates.length) {
    return {
      placed: [],
      unplaced: [],
      sheetWidthMm,
      sheetHeightMm,
    }
  }

  const active: import('./types').CutPattern[] = templates.map((t) => ({
    ...t,
    quantity: 0,
  }))
  const idToIdx = new Map(templates.map((t, i) => [t.id, i]))

  const minCell = Math.min(
    ...templates.map((t) => {
      const s = Math.max(0, t.safeMarginMm ?? 0)
      const k = Math.max(0, kerfMm)
      const fw = t.widthMm + 2 * s + k
      const fh = t.heightMm + 2 * s + k
      return Math.max(1, fw * fh)
    }),
  )

  const byArea = [...templates].sort(
    (a, b) => b.widthMm * b.heightMm - a.widthMm * a.heightMm,
  )

  let guard = 0
  const maxPieces =
    Math.ceil((sheetWidthMm * sheetHeightMm) / minCell) + templates.length * 20

  while (guard++ < maxPieces * templates.length) {
    let progressed = false
    for (const t of byArea) {
      const idx = idToIdx.get(t.id)!
      active[idx] = { ...active[idx], quantity: active[idx].quantity + 1 }
      const items = expandPatternsToItems(active, kerfMm)
      const r = packGuillotine(sheetWidthMm, sheetHeightMm, items, allowRotate)
      if (r.unplaced.length === 0) {
        progressed = true
        break
      }
      active[idx] = { ...active[idx], quantity: active[idx].quantity - 1 }
    }
    if (!progressed) break
  }

  const items = expandPatternsToItems(active, kerfMm)
  const finalPack = packGuillotine(sheetWidthMm, sheetHeightMm, items, allowRotate)

  return {
    ...finalPack,
    sheetWidthMm,
    sheetHeightMm,
  }
}

export function computePack(
  sheetWidthMm: number,
  sheetHeightMm: number,
  patterns: import('./types').CutPattern[],
  options: { allowRotate: boolean; kerfMm: number; mode: 'fixed' | 'greedy' },
): PackResult {
  if (options.mode === 'greedy') {
    return packGreedyMaximum(
      sheetWidthMm,
      sheetHeightMm,
      patterns,
      options.allowRotate,
      options.kerfMm,
    )
  }
  const items = expandPatternsToItems(patterns, options.kerfMm)
  const r = packGuillotine(sheetWidthMm, sheetHeightMm, items, options.allowRotate)
  return { ...r, sheetWidthMm, sheetHeightMm }
}
