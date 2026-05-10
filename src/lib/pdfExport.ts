import { jsPDF } from 'jspdf'
import type { PackResult } from './types'
import { formatAreaMm2, formatMm } from './units'
import type { DisplayUnit } from './units'

function drawLayoutPdf(
  doc: jsPDF,
  result: PackResult,
  displayUnit: DisplayUnit,
  title: string,
): void {
  const margin = 14
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  let y = margin

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(title, margin, y)
  y += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const sw = result.sheetWidthMm
  const sh = result.sheetHeightMm
  const sheetArea = sw * sh
  const used = result.placed.reduce((s, p) => s + p.widthMm * p.heightMm, 0)
  const yieldPct = sheetArea > 0 ? ((used / sheetArea) * 100).toFixed(1) : '0'

  doc.text(`Sheet: ${formatMm(sw, displayUnit)} × ${formatMm(sh, displayUnit)}`, margin, y)
  y += 5
  doc.text(
    `Yield ≈ ${yieldPct}% • Used ${formatAreaMm2(used, displayUnit)} • Sheet ${formatAreaMm2(sheetArea, displayUnit)}`,
    margin,
    y,
  )
  y += 5
  doc.text(`Pieces placed: ${result.placed.length} • Unplaced requests: ${result.unplaced.length}`, margin, y)
  y += 12

  const innerW = pageW - margin * 2
  const innerH = pageH - y - margin
  const scale = Math.min(innerW / sw, innerH / sh)
  const drawW = sw * scale
  const drawH = sh * scale
  const ox = margin + (innerW - drawW) / 2
  const oy = y + (innerH - drawH) / 2

  doc.setDrawColor(40, 40, 40)
  doc.setLineWidth(0.4)
  doc.rect(ox, oy, drawW, drawH)

  for (const p of result.placed) {
    const px = ox + p.x * scale
    const py = oy + p.y * scale
    const pw = p.widthMm * scale
    const ph = p.heightMm * scale
    const k = p.kerfMm * scale
    const s = p.safeMarginMm * scale
    const cutPx = px + k / 2 + s
    const cutPy = py + k / 2 + s
    const cutPw = p.cutWidthMm * scale
    const cutPh = p.cutHeightMm * scale
    const safePx = px + k / 2
    const safePy = py + k / 2
    const safePw = Math.max(0, pw - k)
    const safePh = Math.max(0, ph - k)

    if (p.safeMarginMm > 0.001) {
      const sRgb = hexToRgb(p.safeBorderColor)
      doc.setDrawColor(sRgb.r, sRgb.g, sRgb.b)
      doc.setLineWidth(0.35)
      doc.setLineDashPattern([1.2, 0.8], 0)
      doc.roundedRect(safePx, safePy, safePw, safePh, 0.8, 0.8, 'S')
      doc.setLineDashPattern([], 0)
    }

    const rgb = hexToRgb(p.color)
    doc.setFillColor(rgb.r, rgb.g, rgb.b)
    doc.setDrawColor(20, 20, 20)
    doc.roundedRect(cutPx, cutPy, cutPw, cutPh, 0.8, 0.8, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(Math.max(6, Math.min(10, scale * 2)))
    doc.setTextColor(255, 255, 255)
    const label = truncate(p.label, 24)
    doc.text(label, cutPx + 2, cutPy + 4)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.text(
      `${formatMm(p.cutWidthMm, displayUnit)} × ${formatMm(p.cutHeightMm, displayUnit)}`,
      cutPx + 2,
      cutPy + 8,
    )
    if (p.rotated) {
      doc.text('↻', cutPx + cutPw - 6, cutPy + 5)
    }
  }

  doc.setTextColor(0, 0, 0)
  doc.setFontSize(9)
  doc.text(
    'Legend: dashed outline = safe margin around cut; solid fill = cut. Arrow = rotated.',
    margin,
    pageH - 8,
  )
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const n = parseInt(full, 16)
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  }
}

/** Summary-only second page with table */
function drawSummaryPdf(
  doc: jsPDF,
  result: PackResult,
  displayUnit: DisplayUnit,
): void {
  doc.addPage()
  const margin = 14
  let y = margin
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('Cut summary', margin, y)
  y += 10

  const byPart = new Map<
    string,
    { label: string; count: number; w: number; h: number }
  >()
  for (const p of result.placed) {
    const prev = byPart.get(p.partId)
    if (prev) prev.count += 1
    else
      byPart.set(p.partId, {
        label: p.label,
        count: 1,
        w: p.cutWidthMm,
        h: p.cutHeightMm,
      })
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  for (const row of byPart.values()) {
    doc.text(
      `${row.label}: ${row.count}× @ ${formatMm(row.w, displayUnit)} × ${formatMm(row.h, displayUnit)}`,
      margin,
      y,
    )
    y += 6
  }

  if (result.unplaced.length > 0) {
    y += 6
    doc.setFont('helvetica', 'bold')
    doc.text('Could not place (insufficient space)', margin, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    const unBy = new Map<string, number>()
    for (const u of result.unplaced) {
      unBy.set(u.partId, (unBy.get(u.partId) ?? 0) + 1)
    }
    for (const [pid, c] of unBy) {
      const sample = result.unplaced.find((x) => x.partId === pid)
      doc.text(`${sample?.label ?? pid}: ${c} missing`, margin, y)
      y += 6
    }
  }
}

export function exportPackPdf(
  result: PackResult,
  displayUnit: DisplayUnit,
  filename = 'ayoto-sheet-layout.pdf',
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  drawLayoutPdf(doc, result, displayUnit, 'Ayoto Furniture — CNC sheet layout')
  drawSummaryPdf(doc, result, displayUnit)
  doc.save(filename)
}

/** Raster fallback via canvas id — optional richer PDF */
export function exportPackPdfFromCanvas(
  canvas: HTMLCanvasElement,
  result: PackResult,
  displayUnit: DisplayUnit,
): void {
  const img = canvas.toDataURL('image/png')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const iw = canvas.width
  const ih = canvas.height
  const scale = Math.min(pageW / iw, pageH / ih) * 0.95
  const dw = iw * scale
  const dh = ih * scale
  doc.addImage(img, 'PNG', (pageW - dw) / 2, (pageH - dh) / 2, dw, dh)
  drawSummaryPdf(doc, result, displayUnit)
  doc.save('ayoto-sheet-visual.pdf')
}
