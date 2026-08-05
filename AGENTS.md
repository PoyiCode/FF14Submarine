# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server with HMR
npm run build     # Type-check (tsc -b) then bundle with Vite
npm run lint      # Run ESLint
npm run preview   # Serve the production build locally
```

There is no test runner configured yet.

## Purpose

FF14潛水艇工具箱 — a Final Fantasy XIV submarine crafting calculator. Users select target submarine parts (成品), enter their current inventory of intermediate (半成品) and raw materials (基礎素材), and the app computes how many raw materials are still needed. State can be shared via a compressed URL hash.

## Architecture

Entry point is [src/main.tsx](src/main.tsx) → [src/App.tsx](src/App.tsx). App uses tab-based navigation; currently only one tab: `calculator` (`素材計算`). New tabs are added to the `tabs` const array in App.tsx and rendered conditionally in the tab content section.

### File structure

```
src/
├── utils/
│   ├── cookie.ts               ← getCookie / setCookie / loadJson（90 天 cookie）
│   ├── saveFile.ts             ← File System Access API + <a download> 退回方案
│   └── urlState.ts             ← UrlState 介面 + encode / decode / readUrlState
├── data/
│   ├── interface.ts            ← Product / Recipe / SubmarinePart / RawMaterial 型別
│   ├── handler.ts              ← 載入 JSON，建立以 chineseTraditional 為 key 的查找 map
│   ├── calculations.ts         ← 純計算函式 + 靜態衍生資料（不含 React）
│   ├── products.json
│   ├── recipes.json
│   ├── submarineParts.json
│   └── basicMaterials.json
├── hooks/
│   ├── useCalculatorState.ts   ← 三個核心 state 的初始化（URL hash > cookie > 預設）
│   ├── usePersistence.ts       ← state 變動時同步寫入 cookie
│   └── useImportExport.ts      ← exportJson / importJson / shareUrl
└── components/
    ├── Calculator.tsx           ← 主元件，組合所有子元件與 hook（~90 行）
    ├── ProductSelector.tsx      ← 第一欄：成品選取面板
    ├── InventoryPanel.tsx       ← 第二欄：庫存輸入面板
    ├── ProgressPanel.tsx        ← 第三欄：等價基礎素材進度面板
    └── Calculator.css           ← 三欄版面、響應式斷點、所有 UI 樣式
```

### Data layer

All game data lives in [src/data/](src/data/). Types are defined in [src/data/interface.ts](src/data/interface.ts) and lookup maps are built in [src/data/handler.ts](src/data/handler.ts).

**JSON files:**

- **`products.json`** — final craftable parts (成品). Keyed by numeric index. Each entry has `id`, `sort`, `displayName`, `class`, `className`, `chineseTraditional`, `recipe` (map of ingredient name → qty), and optional `part` (map of submarine part name → qty for class 6-10 products). `type: "item"`.
- **`recipes.json`** — intermediate/semi-products (半成品). Keyed by numeric index. Each entry has `id`, `level` (1 or 2), `category`, `itemLevel`, `recipe` (map of ingredient name → qty, keys are chineseTraditional strings), `job`, `japanese`, `english`, `chineseTraditional`, `chineseSimplified`, `type: "item"`.
- **`submarineParts.json`** — submarine structural parts (潛水艇骨架, level=3). Keyed by numeric index. Each entry has `id`, `category`, `recipe`, `itemLevel`, multilingual name fields, `type: "item"`.
- **`basicMaterials.json`** — leaf-node raw materials (基礎素材) that cannot be expanded further. Each entry has `id`, `chineseTraditional`, `category`, `itemLevel`, multilingual name fields, `type: "item"`.

**Lookup maps (handler.ts):**

- `products` — keyed by `chineseTraditional`
- `recipes` — keyed by `chineseTraditional` (filtered to entries that have this field)
- `submarineParts` — keyed by `chineseTraditional`
- `basicMaterials` — `Set<string>` of chineseTraditional names
- `basicMaterialsData` — raw map keyed by numeric index string

**Four-tier hierarchy:** products → submarineParts (optional, class 6-10) → recipes (lv2 semi) → recipes (lv1 semi) → basicMaterials.

### Calculation layer (`calculations.ts`)

All pure functions and static derived data. No React. Safe to call outside components.

**Static derived data (module-level, computed once):**

- `allSemiNames` — all submarinePart + recipe names; used to initialise `semiInventory` state.
- `allRawNames` — all basicMaterial names; used to initialise `rawInventory` state.
- `CATEGORY_ORDER` — canonical sort order for material categories.
- `rawByName` — basicMaterial lookup keyed by `chineseTraditional`.
- `productIdToName` / `recipeIdToName` / `basicIdToName` — reverse ID→name maps for import.
- `productsByClass` / `sortedClasses` — products grouped by `className`, in JSON declaration order.

**Computation functions:**

- **`getItemRecipe(item)`** — returns the recipe record for a submarine part or recipe item; `null` if neither.
- **`computeRequired(selected)`** — total raw materials needed for all selected products (fully expanded, ignores inventory).
- **`computeRequiredSemi(selected)`** — total semi-products needed. Uses a `directMats` set per product to avoid double-counting lv1 items that appear both directly in a product recipe and as sub-ingredients of lv2 items.
- **`getDirectRequiredSemi(selected)`** — returns a `Set` of semi items listed directly (non-recursively) in the selected products' recipes.
- **`computeEquivalent(semiInventory, rawInventory, requiredSemi)`** — converts semi-product inventory (capped at requiredSemi) and raw inventory into equivalent raw material quantities, used for progress tracking.
- **`getRelevantItems(selected)`** — traverses the full recipe tree and returns `{ parts, semi, raw }` — only items actually needed by the current selection.
- **`sortRaw(names)`** — sorts raw material names by CATEGORY_ORDER → itemLevel → id.
- **`sortSemi(names)`** — sorts semi-product names by CATEGORY_ORDER → itemLevel → id.
- **`validateImportData(data)`** — validates imported JSON shape; returns error string or `null`.

### Hooks

**`useCalculatorState`** — initialises the three core state values. Priority: URL hash > cookie > empty default. Clears the URL hash after reading via `history.replaceState`.

**`usePersistence(selected, semiInventory, rawInventory)`** — three `useEffect` hooks that write each state to its cookie key (`calc_selected`, `calc_semi`, `calc_raw`) on every change.

**`useImportExport(selected, setSelected, semiInventory, setSemiInventory, rawInventory, setRawInventory)`** — returns `{ importError, exportJson, importJson, copied, shareUrl }`.
- `exportJson` — builds a `{ products, materialsLv2, materialsLv1, materialsBasic }` object keyed by item numeric ID, then calls `saveFile()`.
- `importJson` — opens a file picker, parses JSON, validates with `validateImportData`, then sets all three states.
- `shareUrl` — encodes current state as a compressed URL hash and copies to clipboard.

### Components

**`Calculator`** (~90 lines) — composes the three panels. Calls all hooks, runs derived calculations, defines product event handlers (`addProduct`, `removeProduct`, `setProductQty`), passes results as props.

**`ProductSelector`** — receives `{ selected, onAdd, onRemove, onQtyChange, onClear }`. Renders class-grouped product buttons and the selected-items list with quantity inputs.

**`InventoryPanel`** — receives inventory state and setters, plus pre-computed `requiredSemi`, `directSemi`, `relevantParts/Semi/Raw`. Contains `computeSemiRowDisplay()` helper for Lv1 row logic (see below).

**`ProgressPanel`** — receives `{ hasTarget, required, equivalent }`. Renders the equivalent raw materials progress table.

### State

| State | Type | Cookie key | Description |
|---|---|---|---|
| `selected` | `Record<string, number>` | `calc_selected` | Product name → quantity (1–9) |
| `semiInventory` | `Record<string, number>` | `calc_semi` | Semi-product name → current stock |
| `rawInventory` | `Record<string, number>` | `calc_raw` | Raw material name → current stock |

`copied` and `importError` are local UI states inside `useImportExport`.

### State persistence

**Cookies (90-day expiry):** `setCookie` / `getCookie` / `loadJson` in [src/utils/cookie.ts](src/utils/cookie.ts).

**URL hash:** `UrlState` interface + `encodeState` / `decodeState` / `readUrlState` in [src/utils/urlState.ts](src/utils/urlState.ts). Format: `#<LZString.compressToEncodedURIComponent(JSON)>` where JSON is `{ s, si, ri }` (selected, non-zero semi, non-zero raw). After loading, hash is cleared via `history.replaceState`.

**Export / Import:** `saveFile()` in [src/utils/saveFile.ts](src/utils/saveFile.ts) uses File System Access API (`showSaveFilePicker`) when available; falls back to `<a download>`. Import validates with `validateImportData` before applying.

### Lv1 remaining calculation

Lv1 items can be "direct" (appear in the product recipe) or "indirect" (only used as sub-ingredients of lv2 items). `computeSemiRowDisplay()` in `InventoryPanel.tsx` computes the display values:

```
remaining = Σ(lv2_remaining × lv1_qty_per_lv2) + (direct_target − have)
```

- `direct_target` = `requiredSemi[name]` for direct items, `0` for indirect.
- 目標 column: shows value if direct, `"-"` if indirect.
- 剩餘 column: `"✓"` if done; otherwise the remaining value.
- Indirect items shown with `*` suffix in name. Footnote explains they are not counted in progress.

### UI layout

```
.calc-wrapper (flex column, fills tab-content)
  .calc-toolbar        ← import / export / share buttons (right-aligned)
  .calc-layout         ← 3-column grid
    .panel             ← Col 1 (20fr): ProductSelector
    .inventory-panel   ← Col 2 (60fr): InventoryPanel — parts / lv2 / lv1 / raw tables
    .result-panel      ← Col 3 (25fr): ProgressPanel — progress table
```

Responsive breakpoints (inside `.calc-layout`):
- ≥1401px: 3 columns, full-height stretch, each panel scrolls independently.
- ≤1400px: 2 columns; result panel spans both columns.
- ≤700px: 1 column stack.
- Container query on `.inventory-panel` at ≤770px: inner `.inventory-grid` collapses to 1 column.

## Toolchain notes

- **React Compiler** is enabled via `babel-plugin-react-compiler` (configured in [vite.config.ts](vite.config.ts)). This auto-memoizes at build time, so manual `useMemo`/`useCallback` are unnecessary — but the compiler enforces the Rules of React strictly; violations produce build/lint errors.
- Vite 8 with `@vitejs/plugin-react` (uses Oxc transformer) + `@rolldown/plugin-babel` for the React Compiler preset.
- TypeScript 6 with two tsconfigs: `tsconfig.node.json` (Vite config) and `tsconfig.app.json` (app source).
- ESLint 9 flat config (`eslint.config.js`) with `eslint-plugin-react-hooks` and `eslint-plugin-react-refresh`.
- Deployed to GitHub Pages; `vite.config.ts` sets `base: '/FF14Submarine/'`.
- `lz-string` is used for URL state compression (`compressToEncodedURIComponent` / `decompressFromEncodedURIComponent`).
- `garlandtools-api` is a dev-time utility (in `scripts/`) for fetching and verifying item data — not used at runtime.

## Scripts

`scripts/fetchItems.cjs` — fetches item data from the Garland Tools API and writes to `src/data/itemList.json`. Uses CommonJS (`.cjs`) because the package is CJS and the project has `"type": "module"`. Run with `node scripts/fetchItems.cjs`. Modify `FETCH_COUNT` to change how many items are fetched.

## item sort rules

Sort `basicMaterials.json`, `recipes.json`, `products.json`, `submarineParts.json` after editing these files:
1. Group by `"category"`: `[水晶, 石材, 金屬, 木材, 布料, 皮革, 骨材, 鍊金原料, 染料, 食材, 組件]`
2. Sort by `itemLevel`, ascending
3. Sort by `id`, ascending
