// 計算器主元件：組合各子元件與 hook，協調狀態流向
import { useCalculatorState } from '../hooks/useCalculatorState'
import { usePersistence } from '../hooks/usePersistence'
import { useImportExport } from '../hooks/useImportExport'
import {
  computeRequired,
  computeRequiredSemi,
  computeDirectSemi,
  getDirectRequiredSemi,
  computeEquivalent,
  getRelevantItems,
} from '../data/calculations'
import ProductSelector from './ProductSelector'
import InventoryPanel from './InventoryPanel'
import './Calculator.css'

export default function Calculator() {
  // ── State ──
  const { selected, setSelected, semiInventory, setSemiInventory, rawInventory, setRawInventory } =
    useCalculatorState()

  // ── 持久化：state 變動時同步寫入 localStorage ──
  usePersistence(selected, semiInventory, rawInventory)

  // ── 匯入 / 匯出 / 分享 ──
  const { importError, exportJson, importJson, copied, shareUrl } = useImportExport(
    selected, setSelected,
    semiInventory, setSemiInventory,
    rawInventory, setRawInventory,
  )

  // ── 衍生計算（React Compiler 自動 memoize） ──
  const { parts: relevantParts, semi: relevantSemi, raw: relevantRaw } = getRelevantItems(selected)
  const required = computeRequired(selected)
  const requiredSemi = computeRequiredSemi(selected)
  const directSemi = getDirectRequiredSemi(selected)
  const equivalent = computeEquivalent(semiInventory, rawInventory, requiredSemi)
  const hasTarget = Object.keys(selected).length > 0

  // ── 成品 state 事件處理 ──
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
  function completeProduct(name: string) {
    const req = computeDirectSemi(name, 1)
    setSemiInventory((prev) => {
      const next = { ...prev }
      for (const [mat, qty] of Object.entries(req)) {
        next[mat] = Math.max(0, (next[mat] ?? 0) - qty)
      }
      return next
    })
    // 數量剩 1 時才移除，否則只將數量減一
    if (selected[name] <= 1) {
      removeProduct(name)
    } else {
      setSelected((prev) => ({ ...prev, [name]: prev[name] - 1 }))
    }
  }

  return (
    <div className="calc-wrapper">
      {/* 工具列：匯入、匯出、分享按鈕靠右對齊 */}
      <div className="calc-toolbar">
        {importError && <span className="toolbar-error">{importError}</span>}
        <button className="export-btn" onClick={importJson}>匯入當前庫存</button>
        <button className="export-btn" onClick={exportJson}>匯出當前庫存</button>
        <button className="share-btn" onClick={shareUrl}>{copied ? '已複製網址！' : '按此分享數據'}</button>
      </div>

      <div className="calc-layout">
        <ProductSelector
          selected={selected}
          semiInventory={semiInventory}
          onAdd={addProduct}
          onRemove={removeProduct}
          onQtyChange={setProductQty}
          onComplete={completeProduct}
          onClear={() => setSelected({})}
        />
        <InventoryPanel
          hasTarget={hasTarget}
          semiInventory={semiInventory}
          rawInventory={rawInventory}
          setSemiInventory={setSemiInventory}
          setRawInventory={setRawInventory}
          requiredSemi={requiredSemi}
          required={required}
          equivalent={equivalent}
          directSemi={directSemi}
          relevantParts={relevantParts}
          relevantSemi={relevantSemi}
          relevantRaw={relevantRaw}
        />
      </div>
    </div>
  )
}
