// 第一欄：成品選取面板
// 依艦級分組顯示所有成品按鈕，並列出已選取的成品與數量輸入
import { products } from '../data/handler'
import { productsByClass, sortedClasses, getClass, computeDirectSemi } from '../data/calculations'

interface Props {
  selected: Record<string, number>
  semiInventory: Record<string, number>
  onAdd: (name: string) => void
  onRemove: (name: string) => void
  onQtyChange: (name: string, value: string) => void
  onComplete: (name: string) => void
  onClear: () => void
}

// 阻止在數字輸入框中輸入小數點（只允許整數）
function blockDecimal(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === '.' || e.key === ',') e.preventDefault()
}

export default function ProductSelector({ selected, semiInventory, onAdd, onRemove, onQtyChange, onComplete, onClear }: Props) {
  const hasTarget = Object.keys(selected).length > 0

  return (
    <section className="panel">
      <h2>成品</h2>

      <button className="clear-btn" onClick={onClear} disabled={!hasTarget}>清空</button>

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
                  onClick={() => name in selected ? onRemove(name) : onAdd(name)}
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
            // 只需確認有足夠材料完成 1 個，不遞迴展開（使用者持有的是已製好的骨架/Lv2）
            const required = computeDirectSemi(name, 1)
            const canComplete = Object.entries(required).every(
              ([mat, needed]) => (semiInventory[mat] ?? 0) >= needed
            )
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
                  onChange={(e) => onQtyChange(name, e.target.value)}
                  onKeyDown={blockDecimal}
                />
                <button
                  className="complete-btn"
                  disabled={!canComplete}
                  onClick={() => onComplete(name)}
                >
                  完成
                </button>
                <button className="remove-btn" onClick={() => onRemove(name)} aria-label={`移除 ${name}`}>
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
  )
}
