// 匯入、匯出、分享功能的邏輯封裝
import { useState } from 'react'
import { products, recipes, submarineParts } from '../data/handler'
import {
  rawByName,
  allSemiNames,
  allRawNames,
  productIdToName,
  recipeIdToName,
  basicIdToName,
  validateImportData,
} from '../data/calculations'
import { encodeState } from '../utils/urlState'
import { saveFile } from '../utils/saveFile'

const EXPORT_FILENAME = 'submarine materials cht.json'
const IMPORT_ERROR_DURATION_MS = 4000
const COPY_FEEDBACK_DURATION_MS = 2000

export function useImportExport(
  selected: Record<string, number>,
  setSelected: React.Dispatch<React.SetStateAction<Record<string, number>>>,
  semiInventory: Record<string, number>,
  setSemiInventory: React.Dispatch<React.SetStateAction<Record<string, number>>>,
  rawInventory: Record<string, number>,
  setRawInventory: React.Dispatch<React.SetStateAction<Record<string, number>>>,
) {
  // 匯入錯誤訊息，顯示後自動清除
  const [importError, setImportError] = useState<string | null>(null)
  // 分享按鈕的複製成功反饋狀態
  const [copied, setCopied] = useState(false)

  function showImportError(msg: string) {
    setImportError(msg)
    setTimeout(() => setImportError(null), IMPORT_ERROR_DURATION_MS)
  }

  // 匯出目前所有狀態為 JSON 檔案，以物品數字 ID 為 key（方便跨語系使用）
  // 骨架庫存不匯出（骨架目標由成品計算而來，不需持久化庫存）
  async function exportJson() {
    const productsData: Record<number, { itemName: string; quantity: number }> = {}
    for (const [name, qty] of Object.entries(selected)) {
      productsData[products[name].id] = { itemName: name, quantity: qty }
    }

    const materialsLv2: Record<number, { itemName: string; quantity: number }> = {}
    const materialsLv1: Record<number, { itemName: string; quantity: number }> = {}
    for (const [name, qty] of Object.entries(semiInventory)) {
      if (qty <= 0 || submarineParts[name]) continue  // 略過零值與骨架
      if (recipes[name]?.level === 2) materialsLv2[recipes[name].id] = { itemName: name, quantity: qty }
      else if (recipes[name]?.level === 1) materialsLv1[recipes[name].id] = { itemName: name, quantity: qty }
    }

    const materialsBasic: Record<number, { itemName: string; quantity: number }> = {}
    for (const [name, qty] of Object.entries(rawInventory)) {
      if (qty > 0) materialsBasic[rawByName[name].id] = { itemName: name, quantity: qty }
    }

    const data = { products: productsData, materialsLv2, materialsLv1, materialsBasic }
    await saveFile(EXPORT_FILENAME, JSON.stringify(data, null, 2))
  }

  // 讓使用者選取 JSON 檔案並匯入；以 ID 反查中文名，確保跨語系相容
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

        // 先驗證格式，通過後才更新 state
        const err = validateImportData(data)
        if (err) { showImportError(`格式錯誤：${err}`); return }

        const d = data as Record<string, Record<string, { quantity: number }>>

        // 成品數量限制在 1–9
        const newSelected: Record<string, number> = {}
        for (const [idStr, val] of Object.entries(d.products ?? {})) {
          const name = productIdToName[Number(idStr)]
          if (name) newSelected[name] = Math.min(9, Math.max(1, val.quantity))
        }
        setSelected(newSelected)

        // 半成品庫存：先建全 0 基底，再疊加匯入值，數量限制在 0–99999
        const newSemi = Object.fromEntries(allSemiNames.map((n) => [n, 0]))
        for (const section of [d.materialsLv2, d.materialsLv1]) {
          for (const [idStr, val] of Object.entries(section ?? {})) {
            const name = recipeIdToName[Number(idStr)]
            if (name) newSemi[name] = Math.min(99999, val.quantity)
          }
        }
        setSemiInventory(newSemi)

        // 基礎素材庫存：同上
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

  // 壓縮目前狀態為 URL hash 並複製到剪貼簿；si/ri 只儲存非零值以縮短長度
  function shareUrl() {
    const si = Object.fromEntries(Object.entries(semiInventory).filter(([, v]) => v > 0))
    const ri = Object.fromEntries(Object.entries(rawInventory).filter(([, v]) => v > 0))
    const hash = encodeState({ s: selected, si, ri })
    const url = `${window.location.origin}${window.location.pathname}#${hash}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS)
    })
  }

  return { importError, exportJson, importJson, copied, shareUrl }
}
