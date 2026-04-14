// 管理計算器的三個核心 state，並處理初始值的優先順序：
// URL hash > localStorage > 預設空值
import { useState, useEffect } from 'react'
import { loadJson } from '../utils/storage'
import { readUrlState } from '../utils/urlState'
import { allSemiNames, allRawNames } from '../data/calculations'

export function useCalculatorState() {
  // 選取的成品：成品名稱 → 數量（1–9）
  const [selected, setSelected] = useState<Record<string, number>>(() => {
    const url = readUrlState()
    return url ? url.s : loadJson<Record<string, number>>('calc_selected', {})
  })

  // 半成品庫存：預先為所有半成品建立 key（值為 0），確保輸入欄位永遠有受控值
  const [semiInventory, setSemiInventory] = useState<Record<string, number>>(() => {
    const url = readUrlState()
    const base = Object.fromEntries(allSemiNames.map((n) => [n, 0]))
    if (url) return { ...base, ...url.si }
    return loadJson('calc_semi', base)
  })

  // 基礎素材庫存：同上，預建所有 key
  const [rawInventory, setRawInventory] = useState<Record<string, number>>(() => {
    const url = readUrlState()
    const base = Object.fromEntries(allRawNames.map((n) => [n, 0]))
    if (url) return { ...base, ...url.ri }
    return loadJson('calc_raw', base)
  })

  // 初次掛載後清除 URL hash，避免分享連結殘留在網址列
  useEffect(() => {
    if (window.location.hash && window.location.hash !== '#') {
      history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  return { selected, setSelected, semiInventory, setSemiInventory, rawInventory, setRawInventory }
}