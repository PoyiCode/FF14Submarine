// 第一欄：成品選取面板
// 依艦級分組顯示所有成品按鈕，並列出已選取的成品與數量輸入
import { products } from '../data/handler'
import { productsByClass, sortedClasses, getClass } from '../data/calculations'

interface Props {
  selected: Record<string, number>
  onAdd: (name: string) => void
  onRemove: (name: string) => void
  onQtyChange: (name: string, value: string) => void
  onClear: () => void
}

// 阻止在數字輸入框中輸入小數點（只允許整數）
function blockDecimal(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === '.' || e.key === ',') e.preventDefault()
}

export default function ProductSelector({ selected, onAdd, onRemove, onQtyChange, onClear }: Props) {
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
