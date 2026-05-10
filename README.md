# Ayoto CNC Cut Management

A modern web app for planning CNC sheet cuts to maximize output and reduce waste.

Built for real shop-floor decision making: you define sheet size, cut patterns, kerf, and safe margins; the app computes a practical layout and visualizes exactly what can fit.

---

## Who This Is For

- **CNC engineers** who need quick nesting plans
- **Factory owners / managers** who want higher sheet utilization
- **Operators** who need clear visual instructions
- **Developers** who want to extend or integrate planning logic

---

## What Problem It Solves

When you have one large wooden sheet (for example 12 ft × 12 ft) and many part patterns, manual planning can waste material.

This app helps you:

- estimate how many parts can be produced
- visualize where each part sits on the sheet
- include practical constraints (kerf + safe margin)
- export PDF layouts for handover and approval

---

## Key Features

### 1) Sheet + Unit Flexibility

- Set sheet width/height in **mm, cm, inches, or feet**
- Use the same app for both small prototypes and large production sheets

### 2) Cut Pattern Management

- Add multiple patterns with name, width, height, quantity
- Support for:
  - **Rectangle** parts
  - **Custom shape references** (image + bounding width/height + optional true area note)
- Color-code parts for easy visual differentiation

### 3) Realistic Shop Constraints

- **Kerf (mm):** adds practical cutting allowance
- **Safe margin per cut:**
  - set per pattern
  - choose unit (mm/cm/in/ft)
  - editable later in Cut List
  - dashed border shown in layout + PDF

### 4) Two Packing Modes

- **Fixed Quantities:** respects exact requested quantities
- **Pack Maximum (Greedy):** keeps adding parts until nothing else fits

### 5) Interactive Visualization

- Live layout preview with:
  - cut blocks
  - safe-area border
  - optional grid
  - rotation indicator
- **Zoom controls** (+ / - / reset)
- **Ctrl+Wheel (or Cmd+Wheel on macOS)** zoom on the layout panel
- Scroll inside panel when zoomed

### 6) PDF Export

- **Vector PDF:** crisp print-friendly layout + summary
- **Screenshot PDF:** visual snapshot of current layout
- Useful for technical review and operator instructions

---

## Quick Start (Non-Technical)

1. Open the app.
2. Set your sheet size (example: `12` by `12` and unit `ft`).
3. Add cuts one by one in **Add cut**.
4. (Optional) Add safe margin and choose safe border color.
5. Click **Run nesting**.
6. Review:
   - Yield %
   - Used area
   - Remaining area
   - Unplaced pieces
7. Export **PDF (vector layout)** and share with owner/operators.

---

## Quick Start (Developer)

### Prerequisites

- Node.js 20+
- npm 10+

### Install

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

### Build Production

```bash
npm run build
```

### Lint

```bash
npm run lint
```

### Preview Build

```bash
npm run preview
```

---

## How the Layout Logic Works (Simple Explanation)

The app uses a **guillotine-style packing heuristic**:

- each part occupies a footprint on the sheet
- footprint includes actual cut + safe margin + kerf
- parts are placed into available free rectangles
- free space is split and reused for next parts

This is fast and practical, but not mathematically perfect for every scenario.

---

## Core Concepts You Should Know

- **Cut size:** actual part dimensions
- **Safe margin:** keep-out zone around each part (for handling/clamps)
- **Kerf:** cut allowance (blade/tool width effect)
- **Footprint:** `cut + 2×safe margin + kerf`
- **Yield:** used footprint area divided by total sheet area

---

## Data and Calculation Notes

- Internal calculations are performed in **millimeters (mm)**.
- Unit conversions happen at input/output boundaries.
- For custom/irregular shapes, packing currently uses the **bounding rectangle**.
- True polygon nesting is intentionally out of scope for this version.

---

## Limitations (Transparent)

- Not a full industrial CAM nesting solver
- Custom shapes are not geometry-nested; they are box-packed
- Heuristic may differ from globally optimal arrangement

These trade-offs keep the app fast, easy, and useful during planning discussions.

---

## Recommended Real-World Workflow

1. Start in **Fixed Quantities** mode for actual order requirements.
2. Tune kerf and safe margins to match machine/operator constraints.
3. If pieces do not fit, test **Pack Maximum (Greedy)** to explore alternatives.
4. Review unplaced parts and adjust dimensions/quantities if needed.
5. Export vector PDF for production instruction and sign-off.

---

## Project Structure

```text
src/
  components/
    SheetCanvas.tsx      # Live canvas renderer (grid, cuts, safe borders, zoom viewport)
  lib/
    packing.ts           # Packing algorithm + item expansion
    pdfExport.ts         # Vector/screenshot PDF export
    units.ts             # Unit conversion + formatting
    types.ts             # Shared app types
    layoutZoom.ts        # Zoom limits + clamping helper
  App.tsx                # Main UI + user workflow
```

---

## Technology Stack

- **React 19** + **TypeScript**
- **Vite 8**
- **Tailwind CSS 4**
- **jsPDF** for exports

---

## Product Direction (Future Enhancements)

Potential next upgrades:

- true irregular polygon nesting
- multi-sheet planning and auto sheet count
- saved projects/history
- DXF/SVG import + export
- material grain direction constraints
- API/database integration for production environments

---

## FAQ

### Is this good for non-technical users?
Yes. The workflow is form-based and visual, with practical labels and PDF export.

### Why do some pieces not fit even if area seems enough?
Because shape arrangement, kerf, and safe margins create geometric constraints. Total area alone is not enough.

### Why does the app use mm internally?
It avoids precision drift and keeps calculations consistent across mixed units.

---

## Credits

Designed as an Ayoto-themed CNC planning tool inspired by practical furniture/panel workflows.

If you want, the next README version can include:

- screenshots/GIF walkthrough
- troubleshooting section
- architecture diagram
- contribution guide and coding standards
