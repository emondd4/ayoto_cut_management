import { useCallback, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { SheetCanvas } from './components/SheetCanvas'
import {
  clampLayoutZoom,
  LAYOUT_ZOOM_MAX,
  LAYOUT_ZOOM_MIN,
} from './lib/layoutZoom'
import { computePack } from './lib/packing'
import type { CutPattern, PackResult, ShapeKind } from './lib/types'
import {
  areaToMm2,
  formatAreaMm2,
  formatMm,
  fromMm,
  toMm,
  unitLabel,
} from './lib/units'
import type { DisplayUnit } from './lib/units'
import { exportPackPdf, exportPackPdfFromCanvas } from './lib/pdfExport'

/** Distinct cut colors in Ayoto’s warm wood / showroom palette */
const PALETTE = [
  '#9a6b3d',
  '#5c7a6e',
  '#7d4f3a',
  '#4a6670',
  '#8b7355',
  '#6b5344',
  '#5d6b4a',
  '#805e45',
]

function nextColor(i: number): string {
  return PALETTE[i % PALETTE.length]
}

const DEFAULT_SAFE_BORDER = '#b45309'

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>('ft')
  const [sheetW, setSheetW] = useState('12')
  const [sheetH, setSheetH] = useState('12')

  const [kerfMm, setKerfMm] = useState('3')
  const [allowRotate, setAllowRotate] = useState(true)
  const [showGrid, setShowGrid] = useState(true)
  const [packMode, setPackMode] = useState<'fixed' | 'greedy'>('fixed')

  const [patterns, setPatterns] = useState<CutPattern[]>(() => [
    {
      id: nanoid(),
      name: 'Cabinet side',
      kind: 'rectangle',
      widthMm: toMm(22, 'in'),
      heightMm: toMm(30, 'in'),
      quantity: 2,
      color: nextColor(0),
      safeMarginMm: 0,
      safeMarginUnit: 'mm',
      safeBorderColor: DEFAULT_SAFE_BORDER,
    },
    {
      id: nanoid(),
      name: 'Shelf',
      kind: 'rectangle',
      widthMm: toMm(20, 'in'),
      heightMm: toMm(12, 'in'),
      quantity: 4,
      color: nextColor(1),
      safeMarginMm: 0,
      safeMarginUnit: 'mm',
      safeBorderColor: DEFAULT_SAFE_BORDER,
    },
  ])

  const [draft, setDraft] = useState({
    name: '',
    kind: 'rectangle' as ShapeKind,
    width: '24',
    height: '18',
    quantity: '1',
    areaNote: '',
    safeMargin: '0',
    safeUnit: 'mm' as DisplayUnit,
    safeBorderColor: DEFAULT_SAFE_BORDER,
  })

  const [packResult, setPackResult] = useState<PackResult | null>(null)
  const [layoutZoom, setLayoutZoom] = useState(1)

  const sheetMm = useMemo(() => {
    const w = Number.parseFloat(sheetW)
    const h = Number.parseFloat(sheetH)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0)
      return null
    return { wMm: toMm(w, displayUnit), hMm: toMm(h, displayUnit) }
  }, [sheetW, sheetH, displayUnit])

  const kerfParsed = Number.parseFloat(kerfMm)
  const kerfOk = Number.isFinite(kerfParsed) && kerfParsed >= 0

  const runPack = useCallback(() => {
    if (!sheetMm || !kerfOk) return
    const res = computePack(sheetMm.wMm, sheetMm.hMm, patterns, {
      allowRotate,
      kerfMm: kerfParsed,
      mode: packMode,
    })
    setPackResult(res)
  }, [
    sheetMm,
    patterns,
    allowRotate,
    kerfParsed,
    kerfOk,
    packMode,
  ])

  const stats = useMemo(() => {
    if (!packResult || !sheetMm) return null
    const area = sheetMm.wMm * sheetMm.hMm
    const used = packResult.placed.reduce((s, p) => s + p.widthMm * p.heightMm, 0)
    return {
      yieldPct: area > 0 ? (used / area) * 100 : 0,
      used,
      waste: Math.max(0, area - used),
      placed: packResult.placed.length,
      unplaced: packResult.unplaced.length,
    }
  }, [packResult, sheetMm])

  const addPattern = () => {
    const w = Number.parseFloat(draft.width)
    const h = Number.parseFloat(draft.height)
    const q = Number.parseInt(draft.quantity, 10)
    if (!draft.name.trim() || !Number.isFinite(w) || !Number.isFinite(h)) return
    if (w <= 0 || h <= 0) return
    const qty = Number.isFinite(q) && q > 0 ? q : 1
    let areaMm2: number | undefined
    if (draft.areaNote.trim()) {
      const a = Number.parseFloat(draft.areaNote)
      if (Number.isFinite(a) && a > 0) {
        areaMm2 = areaToMm2(a, displayUnit)
      }
    }
    const sm = Number.parseFloat(draft.safeMargin)
    const safeMm =
      Number.isFinite(sm) && sm >= 0 ? toMm(sm, draft.safeUnit) : 0
    const p: CutPattern = {
      id: nanoid(),
      name: draft.name.trim(),
      kind: draft.kind,
      widthMm: toMm(w, displayUnit),
      heightMm: toMm(h, displayUnit),
      quantity: qty,
      color: nextColor(patterns.length),
      areaMm2,
      safeMarginMm: safeMm,
      safeMarginUnit: draft.safeUnit,
      safeBorderColor: draft.safeBorderColor,
    }
    setPatterns((prev) => [...prev, p])
    setDraft({
      name: '',
      kind: draft.kind,
      width: draft.width,
      height: draft.height,
      quantity: '1',
      areaNote: '',
      safeMargin: '0',
      safeUnit: draft.safeUnit,
      safeBorderColor: draft.safeBorderColor,
    })
  }

  const updatePattern = (id: string, patch: Partial<CutPattern>) => {
    setPatterns((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  const removePattern = (id: string) => {
    setPatterns((prev) => prev.filter((p) => p.id !== id))
  }

  const onImagePick = (id: string, file: File | null) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : undefined
      if (url) updatePattern(id, { imageUrl: url })
    }
    reader.readAsDataURL(file)
  }

  const exportVectorPdf = () => {
    if (packResult) exportPackPdf(packResult, displayUnit)
  }

  const exportRasterPdf = () => {
    if (packResult && canvasRef.current) {
      exportPackPdfFromCanvas(canvasRef.current, packResult, displayUnit)
    }
  }

  return (
    <div className="min-h-screen bg-ayoto-bg bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(154,107,61,0.08),transparent)] text-ayoto-ink">
      <header className="sticky top-0 z-10 border-b border-ayoto-border bg-ayoto-paper/95 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-left">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-ayoto-accent">
              Ayoto Furniture
            </p>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ayoto-ink sm:text-3xl">
              CNC cut management
            </h1>
            <p className="mt-1 max-w-xl text-sm text-ayoto-muted">
              Modern layout planning for panel sheets — maximize yield, reduce waste, export clear
              instructions for operators (aligned with{' '}
              <a
                href="https://www.ayoto.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-ayoto-accent underline decoration-ayoto-border underline-offset-2 hover:text-ayoto-accent-hover"
              >
                ayoto.com
              </a>
              ).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={runPack}
              className="rounded-lg bg-ayoto-accent px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-ayoto-accent/25 transition hover:bg-ayoto-accent-hover"
            >
              Run nesting
            </button>
            <button
              type="button"
              disabled={!packResult}
              onClick={exportVectorPdf}
              className="rounded-lg border border-ayoto-border bg-white px-4 py-2.5 text-sm font-medium text-ayoto-ink transition hover:bg-ayoto-warm disabled:opacity-40"
            >
              PDF (vector layout)
            </button>
            <button
              type="button"
              disabled={!packResult}
              onClick={exportRasterPdf}
              className="rounded-lg border border-ayoto-border bg-white px-4 py-2.5 text-sm font-medium text-ayoto-ink transition hover:bg-ayoto-warm disabled:opacity-40"
            >
              PDF (screenshot)
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <aside className="flex flex-col gap-6">
          <section className="rounded-2xl border border-ayoto-border bg-ayoto-paper/95 p-5 shadow-lg shadow-stone-900/10">
            <h2 className="text-sm font-semibold text-ayoto-ink">Sheet</h2>
            <p className="mt-1 text-xs text-ayoto-muted">
              Panel size is the usable CNC bed footprint for this material pass.
            </p>

            <label className="mt-4 block text-xs font-medium text-ayoto-muted">
              Display units
              <select
                value={displayUnit}
                onChange={(e) => setDisplayUnit(e.target.value as DisplayUnit)}
                className="mt-1 w-full rounded-lg border border-ayoto-border bg-white px-3 py-2 text-sm text-ayoto-ink outline-none transition focus:border-ayoto-accent focus:ring-2 focus:ring-ayoto-accent/15"
              >
                <option value="mm">{unitLabel('mm')}</option>
                <option value="cm">{unitLabel('cm')}</option>
                <option value="in">{unitLabel('in')}</option>
                <option value="ft">{unitLabel('ft')}</option>
              </select>
            </label>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-ayoto-muted">
                Width
                <input
                  value={sheetW}
                  onChange={(e) => setSheetW(e.target.value)}
                  type="text"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-lg border border-ayoto-border bg-white px-3 py-2 font-mono text-sm text-ayoto-ink outline-none transition focus:border-ayoto-accent focus:ring-2 focus:ring-ayoto-accent/15"
                />
              </label>
              <label className="block text-xs font-medium text-ayoto-muted">
                Height
                <input
                  value={sheetH}
                  onChange={(e) => setSheetH(e.target.value)}
                  type="text"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-lg border border-ayoto-border bg-white px-3 py-2 font-mono text-sm text-ayoto-ink outline-none transition focus:border-ayoto-accent focus:ring-2 focus:ring-ayoto-accent/15"
                />
              </label>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-xs text-ayoto-ink">
                <input
                  type="checkbox"
                  checked={allowRotate}
                  onChange={(e) => setAllowRotate(e.target.checked)}
                  className="rounded border-ayoto-border text-ayoto-accent focus:ring-ayoto-accent/30"
                />
                Allow 90° rotation
              </label>
              <label className="flex items-center gap-2 text-xs text-ayoto-ink">
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={(e) => setShowGrid(e.target.checked)}
                  className="rounded border-ayoto-border text-ayoto-accent focus:ring-ayoto-accent/30"
                />
                Show grid
              </label>
            </div>

            <label className="mt-4 block text-xs font-medium text-ayoto-muted">
              Kerf / spacing added per piece (mm)
              <input
                value={kerfMm}
                onChange={(e) => setKerfMm(e.target.value)}
                type="text"
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-ayoto-border bg-white px-3 py-2 font-mono text-sm text-ayoto-ink outline-none transition focus:border-ayoto-accent focus:ring-2 focus:ring-ayoto-accent/15"
              />
            </label>

            <fieldset className="mt-4 space-y-2">
              <legend className="text-xs font-medium text-ayoto-muted">Packing mode</legend>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-ayoto-border bg-white/90 px-3 py-2 text-sm text-ayoto-ink">
                <input
                  type="radio"
                  name="mode"
                  checked={packMode === 'fixed'}
                  onChange={() => setPackMode('fixed')}
                  className="text-ayoto-accent focus:ring-ayoto-accent/30"
                />
                Fixed quantities from list
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-ayoto-border bg-white/90 px-3 py-2 text-sm text-ayoto-ink">
                <input
                  type="radio"
                  name="mode"
                  checked={packMode === 'greedy'}
                  onChange={() => setPackMode('greedy')}
                  className="text-ayoto-accent focus:ring-ayoto-accent/30"
                />
                Pack maximum (greedy multi-pattern)
              </label>
              <p className="text-[11px] leading-snug text-ayoto-muted">
                Greedy mode repeatedly adds pieces until nothing else fits — useful for scrap
                recovery trials. Fixed mode respects each row&apos;s quantity.
              </p>
            </fieldset>
          </section>

          <section className="rounded-2xl border border-ayoto-border bg-ayoto-paper/95 p-5 shadow-lg shadow-stone-900/10">
            <h2 className="text-sm font-semibold text-ayoto-ink">Add cut</h2>
            <div className="mt-3 space-y-3">
              <label className="block text-xs font-medium text-ayoto-muted">
                Name
                <input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. Door panel A"
                  className="mt-1 w-full rounded-lg border border-ayoto-border bg-white px-3 py-2 text-sm text-ayoto-ink outline-none transition placeholder:text-ayoto-muted/70 focus:border-ayoto-accent focus:ring-2 focus:ring-ayoto-accent/15"
                />
              </label>

              <label className="block text-xs font-medium text-ayoto-muted">
                Shape
                <select
                  value={draft.kind}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, kind: e.target.value as ShapeKind }))
                  }
                  className="mt-1 w-full rounded-lg border border-ayoto-border bg-white px-3 py-2 text-sm text-ayoto-ink outline-none transition focus:border-ayoto-accent focus:ring-2 focus:ring-ayoto-accent/15"
                >
                  <option value="rectangle">Rectangle (W × H)</option>
                  <option value="custom">
                    Custom (bounding box + optional true area note)
                  </option>
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-ayoto-muted">
                  Width ({displayUnit})
                  <input
                    value={draft.width}
                    onChange={(e) => setDraft((d) => ({ ...d, width: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-ayoto-border bg-white px-3 py-2 font-mono text-sm text-ayoto-ink outline-none transition focus:border-ayoto-accent focus:ring-2 focus:ring-ayoto-accent/15"
                  />
                </label>
                <label className="block text-xs font-medium text-ayoto-muted">
                  Height ({displayUnit})
                  <input
                    value={draft.height}
                    onChange={(e) => setDraft((d) => ({ ...d, height: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-ayoto-border bg-white px-3 py-2 font-mono text-sm text-ayoto-ink outline-none transition focus:border-ayoto-accent focus:ring-2 focus:ring-ayoto-accent/15"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-ayoto-muted">
                  Safe margin (each side)
                  <input
                    value={draft.safeMargin}
                    onChange={(e) => setDraft((d) => ({ ...d, safeMargin: e.target.value }))}
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    className="mt-1 w-full rounded-lg border border-ayoto-border bg-white px-3 py-2 font-mono text-sm text-ayoto-ink outline-none transition focus:border-ayoto-accent focus:ring-2 focus:ring-ayoto-accent/15"
                  />
                </label>
                <label className="block text-xs font-medium text-ayoto-muted">
                  Safe unit
                  <select
                    value={draft.safeUnit}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, safeUnit: e.target.value as DisplayUnit }))
                    }
                    className="mt-1 w-full rounded-lg border border-ayoto-border bg-white px-3 py-2 text-sm text-ayoto-ink outline-none transition focus:border-ayoto-accent focus:ring-2 focus:ring-ayoto-accent/15"
                  >
                    <option value="mm">{unitLabel('mm')}</option>
                    <option value="cm">{unitLabel('cm')}</option>
                    <option value="in">{unitLabel('in')}</option>
                    <option value="ft">{unitLabel('ft')}</option>
                  </select>
                </label>
              </div>
              <p className="text-[11px] leading-snug text-ayoto-muted">
                Added on all sides around the cut for clamps / handling; nesting uses cut + 2× margin
                (+ kerf). Shown as a dashed border in the layout.
              </p>
              <label className="flex items-center gap-3 text-xs font-medium text-ayoto-muted">
                Safe outline color
                <input
                  type="color"
                  value={draft.safeBorderColor}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, safeBorderColor: e.target.value }))
                  }
                  className="h-9 w-16 cursor-pointer rounded border border-ayoto-border bg-white"
                  aria-label="Safe area border color"
                />
                <span className="font-mono text-[10px] text-ayoto-muted">
                  {draft.safeBorderColor}
                </span>
              </label>

              {draft.kind === 'custom' && (
                <label className="block text-xs font-medium text-ayoto-muted">
                  True area (optional, {displayUnit}² — for records only)
                  <input
                    value={draft.areaNote}
                    onChange={(e) => setDraft((d) => ({ ...d, areaNote: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-ayoto-border bg-white px-3 py-2 font-mono text-sm text-ayoto-ink outline-none transition focus:border-ayoto-accent focus:ring-2 focus:ring-ayoto-accent/15"
                  />
                </label>
              )}

              <label className="block text-xs font-medium text-ayoto-muted">
                Quantity {packMode === 'greedy' && '(ignored in greedy mode)'}
                <input
                  value={draft.quantity}
                  onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
                  disabled={packMode === 'greedy'}
                  className="mt-1 w-full rounded-lg border border-ayoto-border bg-white px-3 py-2 font-mono text-sm text-ayoto-ink outline-none transition focus:border-ayoto-accent focus:ring-2 focus:ring-ayoto-accent/15 disabled:opacity-40"
                />
              </label>

              <button
                type="button"
                onClick={addPattern}
                className="w-full rounded-lg border border-ayoto-border bg-ayoto-warm py-2.5 text-sm font-medium text-ayoto-ink transition hover:bg-ayoto-border/60"
              >
                Add to cut list
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-ayoto-border bg-ayoto-paper/95 p-5 shadow-lg shadow-stone-900/10">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ayoto-ink">Cut list</h2>
              <span className="rounded-full bg-ayoto-warm px-2 py-0.5 text-[11px] text-ayoto-muted">
                {patterns.length} templates
              </span>
            </div>
            <ul className="mt-3 flex max-h-[340px] flex-col gap-2 overflow-auto pr-1">
              {patterns.map((p) => (
                <li
                  key={p.id}
                  className="rounded-xl border border-ayoto-border bg-white/95 p-3 text-left shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-1 h-8 w-8 shrink-0 rounded-md ring-1 ring-ayoto-border"
                      style={{ backgroundColor: p.color }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <input
                        value={p.name}
                        onChange={(e) => updatePattern(p.id, { name: e.target.value })}
                        className="w-full rounded border border-transparent bg-transparent text-sm font-medium text-ayoto-ink outline-none focus:border-ayoto-accent/40"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <label className="text-[10px] uppercase text-ayoto-muted">
                          W ({displayUnit})
                          <input
                            type="number"
                            min={0.001}
                            step="any"
                            value={fromMm(p.widthMm, displayUnit)}
                            onChange={(e) => {
                              const v = Number.parseFloat(e.target.value)
                              if (Number.isFinite(v) && v > 0)
                                updatePattern(p.id, { widthMm: toMm(v, displayUnit) })
                            }}
                            className="mt-0.5 w-full rounded border border-ayoto-border bg-ayoto-warm px-1.5 py-1 font-mono text-[11px] text-ayoto-ink"
                          />
                        </label>
                        <label className="text-[10px] uppercase text-ayoto-muted">
                          H ({displayUnit})
                          <input
                            type="number"
                            min={0.001}
                            step="any"
                            value={fromMm(p.heightMm, displayUnit)}
                            onChange={(e) => {
                              const v = Number.parseFloat(e.target.value)
                              if (Number.isFinite(v) && v > 0)
                                updatePattern(p.id, { heightMm: toMm(v, displayUnit) })
                            }}
                            className="mt-0.5 w-full rounded border border-ayoto-border bg-ayoto-warm px-1.5 py-1 font-mono text-[11px] text-ayoto-ink"
                          />
                        </label>
                        <label className="text-[10px] uppercase text-ayoto-muted">
                          Qty
                          <input
                            type="number"
                            min={1}
                            value={p.quantity}
                            disabled={packMode === 'greedy'}
                            onChange={(e) =>
                              updatePattern(p.id, {
                                quantity: Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                              })
                            }
                            className="mt-0.5 w-full rounded border border-ayoto-border bg-ayoto-warm px-1.5 py-1 font-mono text-[11px] text-ayoto-ink disabled:opacity-40"
                          />
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-[10px] uppercase text-ayoto-muted">
                          Safe / side
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={fromMm(p.safeMarginMm, p.safeMarginUnit)}
                            onChange={(e) => {
                              const v = Number.parseFloat(e.target.value)
                              if (Number.isFinite(v) && v >= 0)
                                updatePattern(p.id, { safeMarginMm: toMm(v, p.safeMarginUnit) })
                            }}
                            className="mt-0.5 w-full rounded border border-ayoto-border bg-ayoto-warm px-1.5 py-1 font-mono text-[11px] text-ayoto-ink"
                          />
                        </label>
                        <label className="text-[10px] uppercase text-ayoto-muted">
                          Safe unit
                          <select
                            value={p.safeMarginUnit}
                            onChange={(e) => {
                              const u = e.target.value as DisplayUnit
                              updatePattern(p.id, { safeMarginUnit: u })
                            }}
                            className="mt-0.5 w-full rounded border border-ayoto-border bg-ayoto-warm px-1 py-1 text-[10px] text-ayoto-ink"
                          >
                            <option value="mm">mm</option>
                            <option value="cm">cm</option>
                            <option value="in">in</option>
                            <option value="ft">ft</option>
                          </select>
                        </label>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] text-ayoto-muted">Fill</span>
                        <input
                          type="color"
                          value={p.color}
                          onChange={(e) => updatePattern(p.id, { color: e.target.value })}
                          className="h-7 w-12 cursor-pointer rounded border border-ayoto-border bg-white"
                          aria-label={`Color for ${p.name}`}
                        />
                        <span className="text-[10px] text-ayoto-muted">Safe outline</span>
                        <input
                          type="color"
                          value={p.safeBorderColor}
                          onChange={(e) =>
                            updatePattern(p.id, { safeBorderColor: e.target.value })
                          }
                          className="h-7 w-12 cursor-pointer rounded border border-ayoto-border bg-white"
                          aria-label={`Safe border for ${p.name}`}
                        />
                        {p.kind === 'custom' && (
                          <label className="text-[11px] text-ayoto-muted">
                            Shape ref
                            <input
                              type="file"
                              accept="image/*"
                              className="ml-2 max-w-[140px] text-[10px]"
                              onChange={(e) => onImagePick(p.id, e.target.files?.[0] ?? null)}
                            />
                          </label>
                        )}
                        <button
                          type="button"
                          onClick={() => removePattern(p.id)}
                          className="ml-auto text-[11px] text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </div>
                      {p.imageUrl && (
                        <img
                          src={p.imageUrl}
                          alt=""
                          className="h-14 w-14 rounded-md border border-ayoto-border object-cover"
                        />
                      )}
                      <p className="text-[10px] text-ayoto-muted">
                        {p.kind === 'custom'
                          ? 'Packed as axis-aligned box; irregular waste inside the box is not modeled.'
                          : 'Rectangle nesting — kerf inflates the bounding box for clearance.'}
                        {p.areaMm2 != null &&
                          ` Recorded area ≈ ${formatAreaMm2(p.areaMm2, displayUnit)}.`}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col gap-4">
          <div className="min-w-0 rounded-2xl border border-ayoto-border bg-ayoto-paper/95 p-5 shadow-lg shadow-stone-900/10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-ayoto-ink">Live layout</h2>
                <p className="text-sm text-ayoto-muted">
                  Guillotine-style nesting heuristic — fast, CNC-plausible, not globally optimal.
                </p>
              </div>
              {sheetMm && (
                <p className="font-mono text-xs text-ayoto-muted">
                  Sheet{' '}
                  <span className="font-semibold text-ayoto-accent">
                    {formatMm(sheetMm.wMm, displayUnit)} × {formatMm(sheetMm.hMm, displayUnit)}
                  </span>
                </p>
              )}
            </div>

            {!packResult && (
              <p className="mt-4 rounded-lg border border-dashed border-ayoto-border bg-ayoto-warm/70 px-4 py-6 text-center text-sm text-ayoto-muted">
                Run nesting to preview utilization on your sheet.
              </p>
            )}

            {packResult && (
              <div className="mt-4 min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-ayoto-muted">Layout zoom</span>
                  <div className="flex items-center gap-1 rounded-lg border border-ayoto-border bg-white px-1 py-0.5 shadow-sm">
                    <button
                      type="button"
                      className="rounded-md px-2.5 py-1.5 text-sm font-semibold text-ayoto-ink transition hover:bg-ayoto-warm disabled:opacity-35"
                      aria-label="Zoom out"
                      disabled={layoutZoom <= LAYOUT_ZOOM_MIN + 1e-6}
                      onClick={() =>
                        setLayoutZoom((z) => clampLayoutZoom(z - 0.25))
                      }
                    >
                      −
                    </button>
                    <span className="min-w-[3.25rem] text-center font-mono text-xs text-ayoto-ink">
                      {Math.round(layoutZoom * 100)}%
                    </span>
                    <button
                      type="button"
                      className="rounded-md px-2.5 py-1.5 text-sm font-semibold text-ayoto-ink transition hover:bg-ayoto-warm disabled:opacity-35"
                      aria-label="Zoom in"
                      disabled={layoutZoom >= LAYOUT_ZOOM_MAX - 1e-6}
                      onClick={() =>
                        setLayoutZoom((z) => clampLayoutZoom(z + 0.25))
                      }
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg border border-ayoto-border bg-ayoto-warm px-3 py-1.5 text-xs font-medium text-ayoto-ink transition hover:bg-ayoto-border/50"
                    onClick={() => setLayoutZoom(1)}
                  >
                    Reset
                  </button>
                  <span className="text-[11px] text-ayoto-muted">
                    Scroll the panel when zoomed in.{' '}
                    <kbd className="rounded border border-ayoto-border bg-white px-1 py-0.5 font-mono text-[10px]">
                      Ctrl
                    </kbd>
                    {' / '}
                    <kbd className="rounded border border-ayoto-border bg-white px-1 py-0.5 font-mono text-[10px]">
                      ⌘
                    </kbd>
                    {' + wheel to zoom.'}
                  </span>
                </div>
                <SheetCanvas
                  canvasRef={canvasRef}
                  result={packResult}
                  displayUnit={displayUnit}
                  showGrid={showGrid}
                  zoom={layoutZoom}
                  onZoomDelta={(d) =>
                    setLayoutZoom((z) => clampLayoutZoom(z + d))
                  }
                />
              </div>
            )}
          </div>

          {stats && (
            <div className="grid min-w-0 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-ayoto-accent/25 bg-gradient-to-br from-[rgba(154,107,61,0.14)] via-ayoto-paper to-ayoto-warm p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-ayoto-accent">
                  Yield
                </p>
                <p className="mt-1 text-3xl font-semibold text-ayoto-ink">
                  {stats.yieldPct.toFixed(1)}%
                </p>
                <p className="mt-1 text-xs text-ayoto-muted">Bounding-box coverage on sheet</p>
              </div>
              <div className="rounded-xl border border-ayoto-border bg-white/90 p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-ayoto-muted">
                  Used vs waste
                </p>
                <p className="mt-1 text-sm font-medium text-ayoto-ink">
                  {formatAreaMm2(stats.used, displayUnit)} used
                </p>
                <p className="text-sm text-ayoto-muted">{formatAreaMm2(stats.waste, displayUnit)} remaining</p>
              </div>
              <div className="rounded-xl border border-ayoto-border bg-white/90 p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-ayoto-muted">
                  Placement
                </p>
                <p className="mt-1 text-sm font-medium text-ayoto-ink">{stats.placed} pieces placed</p>
                <p className="text-sm text-amber-800">
                  {stats.unplaced > 0 ? `${stats.unplaced} could not fit` : 'All requested pieces fit'}
                </p>
              </div>
            </div>
          )}

          <footer className="min-w-0 rounded-xl border border-ayoto-border bg-ayoto-warm/60 px-4 py-3 text-left text-[11px] leading-relaxed text-ayoto-muted">
            Irregular silhouettes are represented by their bounding rectangle; true polygon nesting
            would need a dedicated CAM optimizer. Use kerf to approximate blade width or separator
            spacing between adjacent cuts.
          </footer>
        </section>
      </main>
    </div>
  )
}
