import { useEffect, useRef, type RefObject } from 'react'
import { clampLayoutZoom } from '../lib/layoutZoom'
import type { PackResult } from '../lib/types'
import { formatAreaMm2, formatMm } from '../lib/units'
import type { DisplayUnit } from '../lib/units'

interface SheetCanvasProps {
  result: PackResult | null
  displayUnit: DisplayUnit
  showGrid?: boolean
  zoom?: number
  /** Ctrl / ⌘ + scroll wheel on the layout panel */
  onZoomDelta?: (delta: number) => void
  className?: string
  canvasRef?: RefObject<HTMLCanvasElement | null>
}

export function SheetCanvas({
  result,
  displayUnit,
  showGrid = true,
  zoom: zoomProp = 1,
  onZoomDelta,
  className = '',
  canvasRef,
}: SheetCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const zoom = clampLayoutZoom(zoomProp)

  useEffect(() => {
    const el = containerRef.current
    if (!el || !onZoomDelta) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.15 : 0.15
      onZoomDelta(delta)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onZoomDelta])

  useEffect(() => {
    const container = containerRef.current
    const surface = canvasRef?.current
    if (!container || !surface || !result) return

    const paint = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const vw = container.clientWidth
      const vh = container.clientHeight
      if (vw < 8 || vh < 8) return

      const sw = result.sheetWidthMm
      const sh = result.sheetHeightMm
      const padX = 12
      const padTop = 12
      const sheetCaptionGap = 24
      const captionBand = 22
      const insetBottom = 10
      const footerStuff = sheetCaptionGap + captionBand + insetBottom

      const sheetBandH_fit = Math.max(1, vh - padTop - footerStuff)
      const baseScale = Math.min(
        (vw - padX * 2) / sw,
        sheetBandH_fit / sh,
      )
      const scale = baseScale * zoom

      const sheetW = sw * scale
      const sheetH = sh * scale
      const canvasW = Math.max(vw, padX * 2 + sheetW)
      const canvasH = Math.max(vh, padTop + sheetH + footerStuff)

      // Canvas bitmap/CSS size must update when zoom or layout changes (not React state).
      /* eslint-disable react-hooks/immutability */
      surface.style.width = `${canvasW}px`
      surface.style.height = `${canvasH}px`
      surface.width = Math.floor(canvasW * dpr)
      surface.height = Math.floor(canvasH * dpr)
      /* eslint-enable react-hooks/immutability */

      const ctx = surface.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const originX = padX + (canvasW - padX * 2 - sheetW) / 2
      const sheetBandH = canvasH - padTop - footerStuff
      const originY = padTop + (sheetBandH - sheetH) / 2

      ctx.fillStyle = '#e8e4dc'
      ctx.fillRect(0, 0, canvasW, canvasH)

      ctx.strokeStyle = '#b8aea2'
      ctx.lineWidth = 1
      ctx.strokeRect(originX, originY, sheetW, sheetH)

      if (showGrid) {
        ctx.save()
        ctx.strokeStyle = '#d4cdc2'
        ctx.lineWidth = 0.5
        const step = Math.max(sw, sh) / 12
        for (let gx = 0; gx <= sw; gx += step) {
          ctx.beginPath()
          ctx.moveTo(originX + gx * scale, originY)
          ctx.lineTo(originX + gx * scale, originY + sheetH)
          ctx.stroke()
        }
        for (let gy = 0; gy <= sh; gy += step) {
          ctx.beginPath()
          ctx.moveTo(originX, originY + gy * scale)
          ctx.lineTo(originX + sheetW, originY + gy * scale)
          ctx.stroke()
        }
        ctx.restore()
      }

      const sheetArea = sw * sh
      const usedArea = result.placed.reduce((s, p) => s + p.widthMm * p.heightMm, 0)
      const wasteArea = Math.max(0, sheetArea - usedArea)

      for (const p of result.placed) {
        const px = originX + p.x * scale
        const py = originY + p.y * scale
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
          ctx.strokeStyle = p.safeBorderColor
          ctx.lineWidth = 2
          ctx.setLineDash([6, 4])
          roundRect(ctx, safePx, safePy, safePw, safePh, 4)
          ctx.stroke()
          ctx.setLineDash([])
        }

        ctx.fillStyle = p.color
        ctx.globalAlpha = 0.92
        roundRect(ctx, cutPx, cutPy, cutPw, cutPh, 3)
        ctx.fill()
        ctx.globalAlpha = 1

        ctx.strokeStyle = 'rgba(0,0,0,0.35)'
        ctx.lineWidth = 1
        roundRect(ctx, cutPx, cutPy, cutPw, cutPh, 3)
        ctx.stroke()

        ctx.fillStyle = '#fafafa'
        ctx.shadowColor = 'rgba(0,0,0,0.35)'
        ctx.shadowBlur = 3
        ctx.font = `600 ${Math.min(14, Math.max(10, scale * 1.2))}px "DM Sans", sans-serif`
        ctx.fillText(p.label.slice(0, 18), cutPx + 6, cutPy + 18)

        ctx.fillStyle = 'rgba(255,255,255,0.92)'
        ctx.font = `400 ${Math.min(11, scale)}px "JetBrains Mono", monospace`
        ctx.fillText(
          `${formatMm(p.cutWidthMm, displayUnit)} × ${formatMm(p.cutHeightMm, displayUnit)}`,
          cutPx + 6,
          cutPy + 34,
        )
        if (p.rotated) {
          ctx.fillText('↻ rotated', cutPx + 6, cutPy + 48)
        }
        ctx.shadowBlur = 0
      }

      ctx.shadowBlur = 0
      ctx.shadowColor = 'transparent'

      const yieldPct = sheetArea > 0 ? (usedArea / sheetArea) * 100 : 0
      ctx.fillStyle = '#6d645a'
      ctx.font = '11px "JetBrains Mono", monospace'
      const footerBaseline = canvasH - insetBottom
      ctx.fillText(
        `Yield ${yieldPct.toFixed(1)}% • Used ${formatAreaMm2(usedArea, displayUnit)} • Remaining ${formatAreaMm2(wasteArea, displayUnit)}`,
        padX,
        footerBaseline,
      )
    }

    paint()
    const ro = new ResizeObserver(() => paint())
    ro.observe(container)
    return () => ro.disconnect()
  }, [result, displayUnit, showGrid, canvasRef, zoom])

  return (
    <div
      ref={containerRef}
      className={`box-border h-[min(70vh,520px)] w-full min-w-0 max-w-full overflow-auto overscroll-contain rounded-xl border border-ayoto-border bg-ayoto-canvas shadow-inner ${className}`}
      tabIndex={0}
      aria-label="Sheet layout — scroll when zoomed; Ctrl or ⌘ + scroll wheel to zoom"
    >
      <canvas ref={canvasRef} className="block" aria-hidden />
    </div>
  )
}

function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  c.beginPath()
  c.moveTo(x + rr, y)
  c.arcTo(x + w, y, x + w, y + h, rr)
  c.arcTo(x + w, y + h, x, y + h, rr)
  c.arcTo(x, y + h, x, y, rr)
  c.arcTo(x, y, x + w, y, rr)
  c.closePath()
}
