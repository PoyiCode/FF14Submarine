import { useEffect, useState } from 'react'
import LZString from 'lz-string'
import { getProductMaterials, getProductParts, products, basicMaterials, basicMaterialsData, recipes, submarineParts } from '../data/handler'
import './Calculator.css'

// ── Cookie 工具 ───────────────────────────────────────────

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : null
}

function setCookie(name: string, value: string) {
  const expires = new Date(Date.now() + 90 * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = getCookie(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

// ── URL 狀態 ──────────────────────────────────────────────

interface UrlState {
  s: Record<string, number>
  si: Record<string, number>
  ri: Record<string, number>
}

function encodeState(state: UrlState): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(state))
}

function decodeState(hash: string): UrlState | null {
  try {
    const raw = LZString.decompressFromEncodedURIComponent(hash.replace(/^#/, ''))
    if (!raw) return null
    return JSON.parse(raw) as UrlState
  } catch {
    return null
  }
}

function readUrlState(): UrlState | null {
  const hash = window.location.hash
  if (!hash || hash === '#') return null
  return decodeState(hash)
}

// ── 計算函式 ────────────────────────────────────────────

function getItemRecipe(item: string): Record<string, number> | null {
  if (submarineParts[item]) return submarineParts[item].recipe
  if (recipes[item]) return recipes[item].recipe
  return null
}

function resolveToRaw(item: string, qty: number, acc: Record<string, number>): void {
  if (basicMaterials.has(item)) {
    acc[item] = (acc[item] ?? 0) + qty
  } else {
    const recipe = getItemRecipe(item)
    if (recipe) {
      for (const [mat, amount] of Object.entries(recipe)) {
        resolveToRaw(mat, amount * qty, acc)
      }
    }
  }
}

function computeRequired(selected: Record<string, number>): Record<string, number> {
  const acc: Record<string, number> = {}
  for (const [name, selectedQty] of Object.entries(selected)) {
    for (const [mat, qty] of Object.entries(getProductMaterials(name))) {
      resolveToRaw(mat, qty * selectedQty, acc)
    }
  }
  return acc
}

function computeRequiredSemi(selected: Record<string, number>): Record<string, number> {
  const acc: Record<string, number> = {}
  // directMats: lv1 items that appear directly in the current product's recipe.
  // When expanding lv2 sub-ingredients, skip these to avoid double-counting.
  function resolve(item: string, qty: number, directMats: Set<string>) {
    if (basicMaterials.has(item)) return
    const recipe = getItemRecipe(item)
    if (recipe) {
      acc[item] = (acc[item] ?? 0) + qty
      for (const [mat, amount] of Object.entries(recipe)) {
        if (directMats.has(mat) && recipes[mat]?.level === 1) continue
        resolve(mat, amount * qty, directMats)
      }
    }
  }
  for (const [name, selectedQty] of Object.entries(selected)) {
    const directMats = new Set(
      Object.keys(getProductMaterials(name)).filter((m) => recipes[m]?.level === 1)
    )
    for (const [partName, qty] of Object.entries(getProductParts(name))) {
      if (submarineParts[partName]) {
        acc[partName] = (acc[partName] ?? 0) + qty * selectedQty
        for (const [mat, amount] of Object.entries(submarineParts[partName].recipe)) resolve(mat, amount * qty * selectedQty, directMats)
      }
    }
    for (const [mat, qty] of Object.entries(getProductMaterials(name))) resolve(mat, qty * selectedQty, directMats)
  }
  return acc
}

// 成品直接列出的半成品（非子材料）
function getDirectRequiredSemi(selected: Record<string, number>): Set<string> {
  const direct = new Set<string>()
  for (const name of Object.keys(selected)) {
    for (const mat of Object.keys(getProductMaterials(name))) {
      if (!basicMaterials.has(mat) && getItemRecipe(mat)) direct.add(mat)
    }
  }
  return direct
}

function computeEquivalent(
  semiInventory: Record<string, number>,
  rawInventory: Record<string, number>,
  requiredSemi: Record<string, number>,
): Record<string, number> {
  const acc: Record<string, number> = {}
  for (const [item, qty] of Object.entries(semiInventory)) {
    const usable = Math.min(qty, requiredSemi[item] ?? 0)
    if (usable > 0) resolveToRaw(item, usable, acc)
  }
  for (const [mat, qty] of Object.entries(rawInventory)) {
    if (qty > 0) acc[mat] = (acc[mat] ?? 0) + qty
  }
  return acc
}

function getRelevantItems(selected: Record<string, number>): { parts: string[]; semi: string[]; raw: string[] } {
  const parts = new Set<string>()
  const semi = new Set<string>()
  const raw = new Set<string>()
  function traverse(item: string) {
    if (basicMaterials.has(item)) {
      raw.add(item)
    } else if (recipes[item]) {
      semi.add(item)
      for (const mat of Object.keys(recipes[item].recipe)) traverse(mat)
    }
  }
  for (const name of Object.keys(selected)) {
    for (const partName of Object.keys(getProductParts(name))) {
      if (submarineParts[partName]) {
        parts.add(partName)
        for (const mat of Object.keys(submarineParts[partName].recipe)) traverse(mat)
      }
    }
    for (const mat of Object.keys(getProductMaterials(name))) traverse(mat)
  }
  return {
    parts: Object.keys(submarineParts).filter((n) => parts.has(n)),
    semi: Object.keys(recipes).filter((n) => semi.has(n)),
    raw: [...basicMaterials].filter((n) => raw.has(n)),
  }
}

// ── 靜態資料 ────────────────────────────────────────────

const allSemiNames = [...Object.keys(submarineParts), ...Object.keys(recipes)]
const allRawNames = [...basicMaterials]

const CATEGORY_ORDER = ['水晶','石材','金屬','木材','布料','皮革','骨材','鍊金原料','染料','食材','組件']

const rawByName = Object.fromEntries(
  Object.values(basicMaterialsData).map((m) => [m.chineseTraditional, m]),
)

const productIdToName = Object.fromEntries(Object.entries(products).map(([name, p]) => [p.id, name]))
const recipeIdToName = Object.fromEntries(Object.entries(recipes).map(([name, r]) => [r.id, name]))
const basicIdToName = Object.fromEntries(Object.values(basicMaterialsData).map((m) => [m.id, m.chineseTraditional]))

const IMPORT_SECTIONS = ['products', 'materialsLv2', 'materialsLv1', 'materialsBasic'] as const

function validateImportData(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return '根層級必須為物件'
  for (const section of IMPORT_SECTIONS) {
    const val = (data as Record<string, unknown>)[section]
    if (val === undefined) continue
    if (typeof val !== 'object' || val === null || Array.isArray(val))
      return `"${section}" 必須為物件`
    for (const [key, entry] of Object.entries(val as object)) {
      if (isNaN(Number(key)))
        return `"${section}" 的 key "${key}" 必須為數字 id`
      if (section === 'products' && !productIdToName[Number(key)])
        return `"products" 包含未知的 item id"`
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
        return `"${section}[${key}]" 必須為物件`
      const qty = (entry as Record<string, unknown>).quantity
      if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 0)
        return `"${section}[${key}].quantity" 必須為非負整數`
    }
  }
  return null
}

function sortRaw(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ma = rawByName[a], mb = rawByName[b]
    const ca = CATEGORY_ORDER.indexOf(ma?.category ?? ''), cb = CATEGORY_ORDER.indexOf(mb?.category ?? '')
    if (ca !== cb) return (ca === -1 ? 999 : ca) - (cb === -1 ? 999 : cb)
    if ((ma?.itemLevel ?? 0) !== (mb?.itemLevel ?? 0)) return (ma?.itemLevel ?? 0) - (mb?.itemLevel ?? 0)
    return (ma?.id ?? 0) - (mb?.id ?? 0)
  })
}

function sortSemi(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ra = recipes[a], rb = recipes[b]
    const ca = CATEGORY_ORDER.indexOf(ra?.category ?? ''), cb = CATEGORY_ORDER.indexOf(rb?.category ?? '')
    if (ca !== cb) return (ca === -1 ? 999 : ca) - (cb === -1 ? 999 : cb)
    if ((ra?.itemLevel ?? 0) !== (rb?.itemLevel ?? 0)) return (ra?.itemLevel ?? 0) - (rb?.itemLevel ?? 0)
    return (ra?.id ?? 0) - (rb?.id ?? 0)
  })
}

function getClass(key: string): string {
  return products[key].className ?? ''
}

const productsByClass = Object.keys(products).reduce<Record<string, string[]>>(
  (acc, key) => {
    const cls = getClass(key)
    ;(acc[cls] ??= []).push(key)
    return acc
  },
  {},
)
// 保持原始宣告順序（依第一次出現的 key 排序）
const sortedClasses = Object.keys(productsByClass)

// ── 元件 ─────────────────────────────────────────────────

export default function Calculator() {
  const [selected, setSelected] = useState<Record<string, number>>(() => {
    const url = readUrlState()
    return url ? url.s : loadJson<Record<string, number>>('calc_selected', {})
  })
  const [semiInventory, setSemiInventory] = useState<Record<string, number>>(() => {
    const url = readUrlState()
    const base = Object.fromEntries(allSemiNames.map((n) => [n, 0]))
    if (url) return { ...base, ...url.si }
    return loadJson('calc_semi', base)
  })
  const [rawInventory, setRawInventory] = useState<Record<string, number>>(() => {
    const url = readUrlState()
    const base = Object.fromEntries(allRawNames.map((n) => [n, 0]))
    if (url) return { ...base, ...url.ri }
    return loadJson('calc_raw', base)
  })

  useEffect(() => {
    if (window.location.hash && window.location.hash !== '#') {
      history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  useEffect(() => { setCookie('calc_selected', JSON.stringify(selected)) }, [selected])
  useEffect(() => { setCookie('calc_semi', JSON.stringify(semiInventory)) }, [semiInventory])
  useEffect(() => { setCookie('calc_raw', JSON.stringify(rawInventory)) }, [rawInventory])

  function exportJson() {
    const productsData: Record<number, { itemName: string; quantity: number }> = {}
    for (const [name, qty] of Object.entries(selected)) {
      productsData[products[name].id] = { itemName: name, quantity: qty }
    }

    const materialsLv2: Record<number, { itemName: string; quantity: number }> = {}
    const materialsLv1: Record<number, { itemName: string; quantity: number }> = {}
    for (const [name, qty] of Object.entries(semiInventory)) {
      if (qty <= 0 || submarineParts[name]) continue
      if (recipes[name]?.level === 2) materialsLv2[recipes[name].id] = { itemName: name, quantity: qty }
      else if (recipes[name]?.level === 1) materialsLv1[recipes[name].id] = { itemName: name, quantity: qty }
    }

    const materialsBasic: Record<number, { itemName: string; quantity: number }> = {}
    for (const [name, qty] of Object.entries(rawInventory)) {
      if (qty > 0) materialsBasic[rawByName[name].id] = { itemName: name, quantity: qty }
    }

    const data = { products: productsData, materialsLv2, materialsLv1, materialsBasic }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'submarine materials cht.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const [importError, setImportError] = useState<string | null>(null)
  function showImportError(msg: string) {
    setImportError(msg)
    setTimeout(() => setImportError(null), 4000)
  }

  function importJson() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (e) => {
        let data: unknown
        try {
          data = JSON.parse(e.target?.result as string)
        } catch {
          showImportError('JSON 解析失敗：檔案格式不正確')
          return
        }

        const err = validateImportData(data)
        if (err) { showImportError(`格式錯誤：${err}`); return }

        const d = data as Record<string, Record<string, { quantity: number }>>

        const newSelected: Record<string, number> = {}
        for (const [idStr, val] of Object.entries(d.products ?? {})) {
          const name = productIdToName[Number(idStr)]
          if (name) newSelected[name] = Math.min(9, Math.max(1, val.quantity))
        }
        setSelected(newSelected)

        const newSemi = Object.fromEntries(allSemiNames.map((n) => [n, 0]))
        for (const section of [d.materialsLv2, d.materialsLv1]) {
          for (const [idStr, val] of Object.entries(section ?? {})) {
            const name = recipeIdToName[Number(idStr)]
            if (name) newSemi[name] = Math.min(99999, val.quantity)
          }
        }
        setSemiInventory(newSemi)

        const newRaw = Object.fromEntries(allRawNames.map((n) => [n, 0]))
        for (const [idStr, val] of Object.entries(d.materialsBasic ?? {})) {
          const name = basicIdToName[Number(idStr)]
          if (name) newRaw[name] = Math.min(99999, val.quantity)
        }
        setRawInventory(newRaw)
      }
      reader.readAsText(file)
    }
    input.click()
  }

  const [copied, setCopied] = useState(false)
  function shareUrl() {
    const si = Object.fromEntries(Object.entries(semiInventory).filter(([, v]) => v > 0))
    const ri = Object.fromEntries(Object.entries(rawInventory).filter(([, v]) => v > 0))
    const hash = encodeState({ s: selected, si, ri })
    const url = `${window.location.origin}${window.location.pathname}#${hash}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function addProduct(name: string) {
    setSelected((prev) => ({ ...prev, [name]: 1 }))
  }
  function removeProduct(name: string) {
    setSelected((prev) => { const next = { ...prev }; delete next[name]; return next })
  }
  function setProductQty(name: string, value: string) {
    const num = Math.min(9, Math.max(1, parseInt(value) || 1))
    setSelected((prev) => ({ ...prev, [name]: num }))
  }
  function handleInventory(
    setter: React.Dispatch<React.SetStateAction<Record<string, number>>>,
    name: string,
    value: string,
  ) {
    const num = Math.min(99999, Math.max(0, parseInt(value) || 0))
    setter((prev) => ({ ...prev, [name]: num }))
  }
  function blockDecimal(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === '.' || e.key === ',') e.preventDefault()
  }

  const { parts: relevantParts, semi: relevantSemi, raw: relevantRaw } = getRelevantItems(selected)
  const required = computeRequired(selected)
  const requiredSemi = computeRequiredSemi(selected)
  const directSemi = getDirectRequiredSemi(selected)
  const equivalent = computeEquivalent(semiInventory, rawInventory, requiredSemi)
  const hasTarget = Object.keys(selected).length > 0

  return (
    <div className="calc-wrapper">
      <div className="calc-toolbar">
        {importError && <span className="toolbar-error">{importError}</span>}
        <button className="export-btn" onClick={importJson}>匯入當前庫存</button>
        <button className="export-btn" onClick={exportJson}>匯出當前庫存</button>
        <button className="share-btn" onClick={shareUrl}>{copied ? '已複製網址！' : '按此分享數據'}</button>
      </div>

      <div className="calc-layout">

      {/* 第一欄：成品 */}
      <section className="panel">
        <h2>成品</h2>

        <button className="clear-btn" onClick={() => setSelected({})} disabled={!hasTarget}>清空</button>

        {/* 依艦級分組顯示部位按鈕 */}
        <div className="product-groups">
          {sortedClasses.map((cls) => (
            <div key={cls} className="product-group">
              <div className="product-class-row">
                <span className="product-class-name">{cls}</span>
                {productsByClass[cls].map((name) => (
                  <button
                    key={name}
                    className={`product-add-btn${name in selected ? ' selected' : ''}`}
                    onClick={() => name in selected ? removeProduct(name) : addProduct(name)}
                  >
                    {products[name].displayName}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {hasTarget ? (
          <ul className="selected-list">
            {Object.keys(selected).map((name) => {
              const cls = getClass(name)
              return (
                <li key={name} className="selected-item">
                  <span className="item-name">{cls} {products[name].displayName}</span>
                  <input
                    className="selected-qty"
                    type="number"
                    min={1}
                    max={9}
                    step={1}
                    value={selected[name]}
                    onChange={(e) => setProductQty(name, e.target.value)}
                    onKeyDown={blockDecimal}
                  />
                  <button className="remove-btn" onClick={() => removeProduct(name)} aria-label={`移除 ${name}`}>
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="empty-hint">點擊上方按鈕新增成品</p>
        )}
      </section>

      {/* 第二欄：當前庫存 */}
      <section className="panel inventory-panel">
        <h2>當前庫存</h2>

        {hasTarget ? (
          <>
            {/* 潛水艇骨架 */}
            {(() => {
              const items = relevantParts
              if (items.length === 0) return null
              return (
                <div className="submarine-parts">
                  <table className="semi-table">
                    <thead>
                      <tr>
                        <th>潛水艇骨架</th>
                        <th>數量</th>
                        <th>目標</th>
                        <th>剩餘</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((name) => {
                        const target = requiredSemi[name] ?? 0
                        const have = semiInventory[name] ?? 0
                        const remaining = Math.max(0, target - have)
                        const done = have >= target
                        return (
                          <tr key={name} className={done ? 'row-done' : ''}>
                            <td className="semi-name">{name}</td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                max={99999}
                                step={1}
                                value={have === 0 ? '' : have}
                                placeholder="0"
                                onChange={(e) => handleInventory(setSemiInventory, name, e.target.value)}
                                onKeyDown={blockDecimal}
                                className="qty-input"
                              />
                            </td>
                            <td className="num">{target}</td>
                            <td className={`num ${done ? 'text-done' : 'text-remain'}`}>
                              {done ? '✓' : remaining}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })()}

            <div className="inventory-grid">
            {[2, 1].map((lv) => {
              const items = sortSemi(relevantSemi.filter((n) => recipes[n].level === lv))
              if (items.length === 0) return null
              const hasIndirect = lv === 1 && items.some((n) => !directSemi.has(n))
              const lv2Items = lv === 1 ? relevantSemi.filter((n) => recipes[n].level === 2) : []
              return (
                <div key={lv}>
                  <table className="semi-table">
                    <thead>
                      <tr>
                        <th>Lv{lv}</th>
                        <th>數量</th>
                        <th>目標</th>
                        <th>剩餘</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((name) => {
                        const isDirect = directSemi.has(name)
                        const directTarget = requiredSemi[name] ?? 0
                        const have = semiInventory[name] ?? 0

                        let displayTarget: number | string
                        let displayRemaining: number | string
                        let done: boolean

                        if (lv === 1) {
                          // indirect items have directTarget=0; only direct items use requiredSemi
                          const trueDirectTarget = isDirect ? directTarget : 0
                          // remaining = Σ(lv2_remaining × lv1_per_lv2) + (direct_target − have)
                          let lv2Need = 0
                          for (const lv2Name of lv2Items) {
                            const r = recipes[lv2Name]?.recipe
                            if (!r || !(name in r)) continue
                            const lv2Rem = Math.max(0, (requiredSemi[lv2Name] ?? 0) - (semiInventory[lv2Name] ?? 0))
                            lv2Need += lv2Rem * r[name]
                          }
                          const rawRemaining = lv2Need + (trueDirectTarget - have)
                          const remaining = Math.max(0, rawRemaining)
                          done = rawRemaining <= 0
                          displayTarget = trueDirectTarget > 0 ? Math.min(trueDirectTarget, 99999) : '-'
                          displayRemaining = done ? '✓' : Math.min(remaining, 99999)
                        } else {
                          const remaining = Math.max(0, directTarget - have)
                          done = have >= directTarget
                          displayTarget = Math.min(directTarget, 99999)
                          displayRemaining = done ? '✓' : Math.min(remaining, 99999)
                        }

                        return (
                          <tr key={name} className={done ? 'row-done' : ''}>
                            <td className="semi-name">{isDirect ? name : name + '*'}</td>
                            <td>
                              <input
                                type="number"
                                min={0}
                                max={99999}
                                step={1}
                                value={have === 0 ? '' : have}
                                placeholder="0"
                                onChange={(e) => handleInventory(setSemiInventory, name, e.target.value)}
                                onKeyDown={blockDecimal}
                                className="qty-input"
                              />
                            </td>
                            <td className="num">{displayTarget}</td>
                            <td className={`num ${done ? 'text-done' : 'text-remain'}`}>
                              {displayRemaining}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {hasIndirect && (
                    <p className="semi-footnote">*：過度半成品，不計入"等價基礎素材-目標"的數量</p>
                  )}
                </div>
              )
            })}

            <table className="semi-table">
              <thead>
                <tr>
                  <th>基礎素材</th>
                  <th>數量</th>
                </tr>
              </thead>
              <tbody>
                {sortRaw(relevantRaw).map((name) => (
                  <tr key={name}>
                    <td className="semi-name">{name}</td>
                    <td><input
                        type="number"
                        min={0}
                        max={99999}
                        step={1}
                        value={rawInventory[name] === 0 ? '' : rawInventory[name]}
                        placeholder="0"
                        onChange={(e) => handleInventory(setRawInventory, name, e.target.value)}
                        onKeyDown={blockDecimal}
                        className="qty-input"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            </div>

          </>
        ) : (
          <p className="empty-hint">請先選擇成品</p>
        )}
      </section>

      {/* 第三欄：素材進度 */}
      <section className="panel result-panel">
        <h2>等價基礎素材</h2>
        {hasTarget ? (
          <table className="progress-table">
            <thead>
              <tr>
                <th>基礎素材</th>
                <th>數量</th>
                <th>目標</th>
                <th>剩餘</th>
                <th>進度</th>
              </tr>
            </thead>
            <tbody>
              {sortRaw(Object.keys(required)).map((mat) => { const req = required[mat]
                const have = equivalent[mat] ?? 0
                const remaining = Math.max(0, req - have)
                const done = have >= req
                const pct = Math.min(100, Math.floor((have / req) * 100))
                return (
                  <tr key={mat} className={done ? 'row-done' : ''}>
                    <td>{mat}</td>
                    <td className="num">{have > 99999 ? 99999 : have}</td>
                    <td className="num">{req > 99999 ? 99999 : req}</td>
                    <td className={`num ${done ? 'text-done' : 'text-remain'}`}>
                      {done ? '✓' : remaining > 99999 ? 99999 : remaining}
                    </td>
                    <td className={`num ${done ? 'text-done' : 'text-remain'}`}>
                      {pct}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="empty-hint">請先選擇成品</p>
        )}
      </section>

    </div>
    </div>
  )
}
