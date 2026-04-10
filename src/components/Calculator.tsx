import { useEffect, useState } from 'react'
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
  const [selected, setSelected] = useState<Record<string, number>>(() =>
    loadJson<Record<string, number>>('calc_selected', {}),
  )
  const [semiInventory, setSemiInventory] = useState<Record<string, number>>(() =>
    loadJson('calc_semi', Object.fromEntries(allSemiNames.map((n) => [n, 0]))),
  )
  const [rawInventory, setRawInventory] = useState<Record<string, number>>(() =>
    loadJson('calc_raw', Object.fromEntries(allRawNames.map((n) => [n, 0]))),
  )

  useEffect(() => { setCookie('calc_selected', JSON.stringify(selected)) }, [selected])
  useEffect(() => { setCookie('calc_semi', JSON.stringify(semiInventory)) }, [semiInventory])
  useEffect(() => { setCookie('calc_raw', JSON.stringify(rawInventory)) }, [rawInventory])

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
                        const target = requiredSemi[name] ?? 0
                        const have = semiInventory[name] ?? 0
                        const remaining = Math.max(0, target - have)
                        const done = isDirect && have >= target
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
                            <td className="num">{isDirect ? (target > 99999 ? 99999 : target) : '-'}</td>
                            <td className={`num ${done ? 'text-done' : isDirect ? 'text-remain' : ''}`}>
                              {isDirect ? (done ? '✓' : (remaining > 99999 ? 99999 : remaining)) : '-'}
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
  )
}
