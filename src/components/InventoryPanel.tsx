// 第二欄：當前庫存面板
// 顯示選取成品所需的骨架、Lv2/Lv1 半成品、基礎素材庫存表，並允許輸入庫存數量
// 基礎素材欄同時顯示目標與剩餘（等價換算後）
import { useState } from 'react'
import { recipes } from '../data/handler'
import { sortSemi, sortRaw } from '../data/calculations'

interface Props {
  hasTarget: boolean
  semiInventory: Record<string, number>
  rawInventory: Record<string, number>
  setSemiInventory: React.Dispatch<React.SetStateAction<Record<string, number>>>
  setRawInventory: React.Dispatch<React.SetStateAction<Record<string, number>>>
  requiredSemi: Record<string, number>
  required: Record<string, number>
  equivalent: Record<string, number>
  directSemi: Set<string>
  relevantParts: string[]
  relevantSemi: string[]
  relevantRaw: string[]
}

// 阻止在數字輸入框中輸入小數點（只允許整數）
function blockDecimal(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === '.' || e.key === ',') e.preventDefault()
}

// 計算半成品列的「目標」與「剩餘」顯示值
// Lv1 剩餘公式：Σ(每個 Lv2 的剩餘量 × 該 Lv2 配方中此 Lv1 的需求量) + (直接目標 − 庫存)
function computeSemiRowDisplay(
  name: string,
  lv: number,
  isDirect: boolean,
  have: number,
  directTarget: number,
  lv2Items: string[],
  requiredSemi: Record<string, number>,
  semiInventory: Record<string, number>,
): { displayTarget: number | string; displayRemaining: number | string; done: boolean } {
  if (lv === 1) {
    // 間接 Lv1（只出現在 Lv2 配方內）的直接目標為 0
    const trueDirectTarget = isDirect ? directTarget : 0
    let lv2Need = 0
    for (const lv2Name of lv2Items) {
      const r = recipes[lv2Name]?.recipe
      if (!r || !(name in r)) continue
      const lv2Rem = Math.max(0, (requiredSemi[lv2Name] ?? 0) - (semiInventory[lv2Name] ?? 0))
      lv2Need += lv2Rem * r[name]
    }
    const rawRemaining = lv2Need + (trueDirectTarget - have)
    const remaining = Math.max(0, rawRemaining)
    const done = rawRemaining <= 0
    return {
      displayTarget: trueDirectTarget > 0 ? Math.min(trueDirectTarget, 99999) : '-',
      displayRemaining: done ? '✓' : Math.min(remaining, 99999),
      done,
    }
  } else {
    const remaining = Math.max(0, directTarget - have)
    const done = have >= directTarget
    return {
      displayTarget: Math.min(directTarget, 99999),
      displayRemaining: done ? '✓' : Math.min(remaining, 99999),
      done,
    }
  }
}

export default function InventoryPanel({
  hasTarget,
  semiInventory,
  rawInventory,
  setSemiInventory,
  setRawInventory,
  requiredSemi,
  required,
  equivalent,
  directSemi,
  relevantParts,
  relevantSemi,
  relevantRaw,
}: Props) {
  const [copiedName, setCopiedName] = useState<string | null>(null)

  // 複製名稱至剪貼簿，並短暫顯示「已複製」視覺回饋
  function copyName(name: string) {
    navigator.clipboard.writeText(name).then(() => {
      setCopiedName(name)
      setTimeout(() => setCopiedName(null), 1500)
    })
  }

  // 通用庫存輸入處理器：解析輸入值並限制在 0–99999 的整數
  function handleInventory(
    setter: React.Dispatch<React.SetStateAction<Record<string, number>>>,
    name: string,
    value: string,
  ) {
    const num = Math.min(99999, Math.max(0, parseInt(value) || 0))
    setter((prev) => ({ ...prev, [name]: num }))
  }

  return (
    <section className="panel inventory-panel">
      <h2>當前庫存</h2>

      {hasTarget ? (
        <>
          {/* 潛水艇骨架（class 6–10 才有） */}
          {relevantParts.length > 0 && (
            <div className="submarine-parts">
              <table className="semi-table">
                <thead>
                  <tr>
                    <th>潛水艇骨架</th>
                    <th>數量</th>
                    <th>目標</th>
                    <th>缺少</th>
                  </tr>
                </thead>
                <tbody>
                  {relevantParts.map((name) => {
                    const target = requiredSemi[name] ?? 0
                    const have = semiInventory[name] ?? 0
                    const remaining = Math.max(0, target - have)
                    const done = have >= target
                    return (
                      <tr key={name} className={done ? 'row-done' : ''}>
                        <td
                          className={`semi-name copyable${copiedName === name ? ' copied' : ''}`}
                          onClick={() => copyName(name)}
                          title="點擊複製名稱"
                        >
                          {copiedName === name ? '已複製！' : name}
                        </td>
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
          )}

          <div className="inventory-grid">
            {/* 先渲染 Lv2 再渲染 Lv1（[2, 1] 順序），確保顯示順序與計算依賴方向一致 */}
            {[2, 1].map((lv) => {
              const items = sortSemi(relevantSemi.filter((n) => recipes[n].level === lv))
              if (items.length === 0) return null
              const hasIndirect = lv === 1 && items.some((n) => !directSemi.has(n))
              // Lv1 剩餘計算需要知道哪些 Lv2 項目以及其剩餘量
              const lv2Items = lv === 1 ? relevantSemi.filter((n) => recipes[n].level === 2) : []
              return (
                <div key={lv}>
                  <table className="semi-table">
                    <thead>
                      <tr>
                        <th>Lv{lv}</th>
                        <th>數量</th>
                        <th>目標</th>
                        <th>缺少</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((name) => {
                        const isDirect = directSemi.has(name)
                        const have = semiInventory[name] ?? 0
                        const directTarget = requiredSemi[name] ?? 0
                        const { displayTarget, displayRemaining, done } = computeSemiRowDisplay(
                          name, lv, isDirect, have, directTarget, lv2Items, requiredSemi, semiInventory
                        )
                        return (
                          <tr key={name} className={done ? 'row-done' : ''}>
                            {/* 間接 Lv1 項目名稱後加「*」，並附頁腳說明；複製時只複製原始名稱 */}
                            <td
                              className={`semi-name copyable${copiedName === name ? ' copied' : ''}`}
                              onClick={() => copyName(name)}
                              title="點擊複製名稱"
                            >
                              {copiedName === name ? '已複製！' : (isDirect ? name : name + '*')}
                            </td>
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
                    <p className="semi-footnote">*：過度半成品，不列入目標計算</p>
                  )}
                </div>
              )
            })}

            {/* 基礎素材：數量（輸入）、剩餘（含半成品等價換算） */}
            <table className="semi-table">
              <thead>
                <tr>
                  <th>基礎素材</th>
                  <th>數量</th>
                  <th>剩餘</th>
                </tr>
              </thead>
              <tbody>
                {sortRaw(relevantRaw).map((name) => {
                  const target = required[name] ?? 0
                  const have = equivalent[name] ?? 0
                  const remaining = Math.max(0, target - have)
                  const done = have >= target
                  return (
                    <tr key={name} className={done ? 'row-done' : ''}>
                      <td
                        className={`semi-name copyable${copiedName === name ? ' copied' : ''}`}
                        onClick={() => copyName(name)}
                        title="點擊複製名稱"
                      >
                        {copiedName === name ? '已複製！' : name}
                      </td>
                      <td>
                        <input
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
                      <td className={`num ${done ? 'text-done' : 'text-remain'}`}>
                        {done ? '✓' : (remaining > 99999 ? 99999 : remaining)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="empty-hint">請先選擇成品</p>
      )}
    </section>
  )
}
