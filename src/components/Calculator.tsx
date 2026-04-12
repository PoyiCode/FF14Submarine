import { useEffect, useState } from 'react'
import LZString from 'lz-string'
import { getProductMaterials, getProductParts, products, basicMaterials, basicMaterialsData, recipes, submarineParts } from '../data/handler'
import './Calculator.css'

// ── Cookie 工具 ───────────────────────────────────────────
// 用於在瀏覽器端持久化使用者的選取狀態與庫存數字（90 天有效期）

// 以正規表示式從 document.cookie 字串中取出指定名稱的 cookie 值
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : null
}

// 寫入 cookie，設定 90 天後到期；SameSite=Lax 防止跨站請求攜帶
function setCookie(name: string, value: string) {
  const expires = new Date(Date.now() + 90 * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`
}

// 從 cookie 讀取 JSON 字串並解析；解析失敗時回傳 fallback 預設值
function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = getCookie(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

// ── URL 狀態 ──────────────────────────────────────────────
// 使用 lz-string 將狀態壓縮為 URI component，附加在 URL hash 後方供分享
// 格式：#<LZString壓縮後的JSON>，其中 JSON 結構為 { s, si, ri }

// URL hash 所攜帶的完整應用狀態
interface UrlState {
  s: Record<string, number>    // selected：成品名稱 → 數量
  si: Record<string, number>   // semiInventory（僅非零項）：半成品名稱 → 庫存
  ri: Record<string, number>   // rawInventory（僅非零項）：基礎素材名稱 → 庫存
}

// 將狀態物件序列化並壓縮為可安全放入 URL hash 的字串
function encodeState(state: UrlState): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(state))
}

// 從 URL hash 字串解壓縮並還原狀態；解壓或解析失敗時回傳 null
function decodeState(hash: string): UrlState | null {
  try {
    const raw = LZString.decompressFromEncodedURIComponent(hash.replace(/^#/, ''))
    if (!raw) return null
    return JSON.parse(raw) as UrlState
  } catch {
    return null
  }
}

// 嘗試從目前頁面的 URL hash 讀取狀態；無 hash 時回傳 null（改用 cookie）
function readUrlState(): UrlState | null {
  const hash = window.location.hash
  if (!hash || hash === '#') return null
  return decodeState(hash)
}

// ── 計算函式 ────────────────────────────────────────────
// 以下皆為純函式（pure function），不依賴 React state，可在元件外獨立測試

// 取得某素材的配方；骨架優先，其次半成品；基礎素材或未知物品回傳 null
function getItemRecipe(item: string): Record<string, number> | null {
  if (submarineParts[item]) return submarineParts[item].recipe
  if (recipes[item]) return recipes[item].recipe
  return null
}

// 遞迴將一個材料展開至最底層的基礎素材，並累加到 acc
// 若 item 本身是基礎素材，直接累加；否則取其配方並繼續往下展開
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

// 計算選取成品所需的基礎素材總量（完全展開，忽略庫存）
// 回傳值用於「等價基礎素材」欄位的「目標」數字
function computeRequired(selected: Record<string, number>): Record<string, number> {
  const acc: Record<string, number> = {}
  for (const [name, selectedQty] of Object.entries(selected)) {
    for (const [mat, qty] of Object.entries(getProductMaterials(name))) {
      resolveToRaw(mat, qty * selectedQty, acc)
    }
  }
  return acc
}

// 計算選取成品所需的半成品總量（含骨架、Lv2、Lv1）
// 關鍵邏輯：Lv1 半成品若同時出現在成品直接配方（directMats）與 Lv2 配方中，
// 展開 Lv2 時會跳過這些 Lv1，避免被重複計算兩次
function computeRequiredSemi(selected: Record<string, number>): Record<string, number> {
  const acc: Record<string, number> = {}

  // directMats：當前成品直接配方中出現的 lv1 半成品名稱集合
  // 展開 lv2 子材料時，若遇到 directMats 內的 lv1 項目，跳過以防重複
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
    // 收集當前成品直接配方中所有 lv1 半成品，後續展開 lv2 時用來去除重複
    const directMats = new Set(
      Object.keys(getProductMaterials(name)).filter((m) => recipes[m]?.level === 1)
    )
    // 先處理骨架（class 6–10 才有）
    for (const [partName, qty] of Object.entries(getProductParts(name))) {
      if (submarineParts[partName]) {
        acc[partName] = (acc[partName] ?? 0) + qty * selectedQty
        for (const [mat, amount] of Object.entries(submarineParts[partName].recipe)) resolve(mat, amount * qty * selectedQty, directMats)
      }
    }
    // 再處理成品直接配方中的材料
    for (const [mat, qty] of Object.entries(getProductMaterials(name))) resolve(mat, qty * selectedQty, directMats)
  }
  return acc
}

// 取得在成品配方中「直接列出」的半成品集合（不包含只在 lv2 配方內出現的間接 lv1）
// 用於判斷 lv1 半成品是否要顯示目標數字，以及是否在名稱後加「*」
function getDirectRequiredSemi(selected: Record<string, number>): Set<string> {
  const direct = new Set<string>()
  for (const name of Object.keys(selected)) {
    for (const mat of Object.keys(getProductMaterials(name))) {
      if (!basicMaterials.has(mat) && getItemRecipe(mat)) direct.add(mat)
    }
  }
  return direct
}

// 將半成品庫存與基礎素材庫存換算為等價基礎素材量，用於進度追蹤
// 半成品庫存只採計「需要量上限內」的部分（多餘庫存不計入），避免進度超過 100%
function computeEquivalent(
  semiInventory: Record<string, number>,
  rawInventory: Record<string, number>,
  requiredSemi: Record<string, number>,
): Record<string, number> {
  const acc: Record<string, number> = {}
  for (const [item, qty] of Object.entries(semiInventory)) {
    // 僅取「有用到的」庫存量（不能超過需要量），展開為基礎素材
    const usable = Math.min(qty, requiredSemi[item] ?? 0)
    if (usable > 0) resolveToRaw(item, usable, acc)
  }
  // 基礎素材庫存直接累加
  for (const [mat, qty] of Object.entries(rawInventory)) {
    if (qty > 0) acc[mat] = (acc[mat] ?? 0) + qty
  }
  return acc
}

// 依目前選取的成品，走訪完整材料樹，回傳實際用到的骨架、半成品、基礎素材名稱列表
// 用途：庫存欄位只顯示「有用到的」材料，不顯示與當前選取無關的項目
function getRelevantItems(selected: Record<string, number>): { parts: string[]; semi: string[]; raw: string[] } {
  const parts = new Set<string>()
  const semi = new Set<string>()
  const raw = new Set<string>()

  // 遞迴走訪材料樹：基礎素材加入 raw，半成品加入 semi 並繼續往下走
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

  // 保持與原始 JSON 相同的宣告順序（過濾而非重排），確保顯示順序一致
  return {
    parts: Object.keys(submarineParts).filter((n) => parts.has(n)),
    semi: Object.keys(recipes).filter((n) => semi.has(n)),
    raw: [...basicMaterials].filter((n) => raw.has(n)),
  }
}

// ── 靜態資料 ────────────────────────────────────────────
// 以下資料在模組載入時計算一次，之後不會改變

// 所有半成品名稱（骨架 + 一般半成品），用於初始化 semiInventory state
const allSemiNames = [...Object.keys(submarineParts), ...Object.keys(recipes)]
// 所有基礎素材名稱，用於初始化 rawInventory state
const allRawNames = [...basicMaterials]

// 素材分類的排序順序（依遊戲慣例定義），未在清單內的分類排到最後
const CATEGORY_ORDER = ['水晶','石材','金屬','木材','布料','皮革','骨材','鍊金原料','染料','食材','組件']

// 以繁體中文名建立基礎素材 lookup map，方便 sortRaw 取得 category、itemLevel、id
const rawByName = Object.fromEntries(
  Object.values(basicMaterialsData).map((m) => [m.chineseTraditional, m]),
)

// 以下三個 map 供匯入功能使用：JSON 檔案以數字 ID 儲存，需要反查對應的中文名稱
const productIdToName = Object.fromEntries(Object.entries(products).map(([name, p]) => [p.id, name]))
const recipeIdToName = Object.fromEntries(Object.entries(recipes).map(([name, r]) => [r.id, name]))
const basicIdToName = Object.fromEntries(Object.values(basicMaterialsData).map((m) => [m.id, m.chineseTraditional]))

// 匯入 JSON 的合法區段名稱
const IMPORT_SECTIONS = ['products', 'materialsLv2', 'materialsLv1', 'materialsBasic'] as const

// 驗證使用者匯入的 JSON 格式是否符合預期；回傳錯誤訊息字串，格式正確則回傳 null
function validateImportData(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return '根層級必須為物件'
  for (const section of IMPORT_SECTIONS) {
    const val = (data as Record<string, unknown>)[section]
    if (val === undefined) continue  // 允許省略某個區段
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

// 依 CATEGORY_ORDER → itemLevel → id 排序基礎素材名稱陣列
function sortRaw(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ma = rawByName[a], mb = rawByName[b]
    const ca = CATEGORY_ORDER.indexOf(ma?.category ?? ''), cb = CATEGORY_ORDER.indexOf(mb?.category ?? '')
    if (ca !== cb) return (ca === -1 ? 999 : ca) - (cb === -1 ? 999 : cb)
    if ((ma?.itemLevel ?? 0) !== (mb?.itemLevel ?? 0)) return (ma?.itemLevel ?? 0) - (mb?.itemLevel ?? 0)
    return (ma?.id ?? 0) - (mb?.id ?? 0)
  })
}

// 依 CATEGORY_ORDER → itemLevel → id 排序半成品名稱陣列
function sortSemi(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ra = recipes[a], rb = recipes[b]
    const ca = CATEGORY_ORDER.indexOf(ra?.category ?? ''), cb = CATEGORY_ORDER.indexOf(rb?.category ?? '')
    if (ca !== cb) return (ca === -1 ? 999 : ca) - (cb === -1 ? 999 : cb)
    if ((ra?.itemLevel ?? 0) !== (rb?.itemLevel ?? 0)) return (ra?.itemLevel ?? 0) - (rb?.itemLevel ?? 0)
    return (ra?.id ?? 0) - (rb?.id ?? 0)
  })
}

// 取得成品所屬的艦級名稱（如「鯊魚級」）
function getClass(key: string): string {
  return products[key].className ?? ''
}

// 將所有成品依艦級分組，key 為 className，value 為該艦級的成品名稱陣列
const productsByClass = Object.keys(products).reduce<Record<string, string[]>>(
  (acc, key) => {
    const cls = getClass(key)
    ;(acc[cls] ??= []).push(key)
    return acc
  },
  {},
)
// 保持 products.json 中艦級第一次出現的順序，確保 UI 顯示順序與資料一致
const sortedClasses = Object.keys(productsByClass)

// ── 元件 ─────────────────────────────────────────────────

export default function Calculator() {
  // ── State 初始化 ──
  // 優先順序：URL hash > cookie > 預設空值
  // 注意：readUrlState() 在每個 useState initializer 中各呼叫一次，
  // 因為 useState 的 initializer 只執行一次，三個 state 共享同一次解碼結果

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

  // 初次掛載後清除 URL hash，避免分享連結殘留在網址列影響使用體驗
  useEffect(() => {
    if (window.location.hash && window.location.hash !== '#') {
      history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  // 每當 state 變動時，同步寫入 cookie 以持久化
  useEffect(() => { setCookie('calc_selected', JSON.stringify(selected)) }, [selected])
  useEffect(() => { setCookie('calc_semi', JSON.stringify(semiInventory)) }, [semiInventory])
  useEffect(() => { setCookie('calc_raw', JSON.stringify(rawInventory)) }, [rawInventory])

  // 匯出目前所有狀態為 JSON 檔案，以物品數字 ID 為 key（方便跨語系使用）
  // 骨架庫存不匯出（骨架目標由成品計算而來，不需持久化庫存）
  // 優先使用 File System Access API（showSaveFilePicker）讓使用者選擇儲存路徑；
  // 若瀏覽器不支援則退回 <a download> 的傳統下載方式
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
    const json = JSON.stringify(data, null, 2)
    const defaultName = 'submarine materials cht.json'

    // File System Access API：支援時顯示系統另存新檔對話框
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as Window & typeof globalThis & {
          showSaveFilePicker: (opts?: object) => Promise<FileSystemFileHandle>
        }).showSaveFilePicker({
          suggestedName: defaultName,
          types: [{ description: 'JSON 檔案', accept: { 'application/json': ['.json'] } }],
        })
        const writable = await handle.createWritable()
        await writable.write(json)
        await writable.close()
        return
      } catch (e) {
        // 使用者取消選擇（AbortError）時直接返回，其他錯誤退回傳統下載
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }

    // 退回方案：<a download> 觸發下載，瀏覽器自動存至預設下載資料夾
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = defaultName
    a.click()
    URL.revokeObjectURL(url)
  }

  // 匯入錯誤訊息，4 秒後自動清除
  const [importError, setImportError] = useState<string | null>(null)
  function showImportError(msg: string) {
    setImportError(msg)
    setTimeout(() => setImportError(null), 4000)
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

  // 分享按鈕：壓縮目前狀態為 URL hash 並複製到剪貼簿；2 秒後恢復按鈕文字
  const [copied, setCopied] = useState(false)
  function shareUrl() {
    // si / ri 只儲存非零值，減少壓縮後的 URL 長度
    const si = Object.fromEntries(Object.entries(semiInventory).filter(([, v]) => v > 0))
    const ri = Object.fromEntries(Object.entries(rawInventory).filter(([, v]) => v > 0))
    const hash = encodeState({ s: selected, si, ri })
    const url = `${window.location.origin}${window.location.pathname}#${hash}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // 新增成品到選取清單，預設數量為 1
  function addProduct(name: string) {
    setSelected((prev) => ({ ...prev, [name]: 1 }))
  }
  // 從選取清單移除指定成品
  function removeProduct(name: string) {
    setSelected((prev) => { const next = { ...prev }; delete next[name]; return next })
  }
  // 更新成品數量，限制在 1–9 的整數
  function setProductQty(name: string, value: string) {
    const num = Math.min(9, Math.max(1, parseInt(value) || 1))
    setSelected((prev) => ({ ...prev, [name]: num }))
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
  // 阻止在數字輸入框中輸入小數點（只允許整數）
  function blockDecimal(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === '.' || e.key === ',') e.preventDefault()
  }

  // ── 衍生計算 ──
  // React Compiler 會自動 memoize 這些值，無需手動 useMemo
  const { parts: relevantParts, semi: relevantSemi, raw: relevantRaw } = getRelevantItems(selected)
  const required = computeRequired(selected)          // 基礎素材目標量
  const requiredSemi = computeRequiredSemi(selected)  // 半成品目標量
  const directSemi = getDirectRequiredSemi(selected)  // 成品直接配方中的半成品集合
  const equivalent = computeEquivalent(semiInventory, rawInventory, requiredSemi)  // 等價基礎素材（已有量）
  const hasTarget = Object.keys(selected).length > 0  // 是否有選取任何成品

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
            {/* 先渲染 Lv2 再渲染 Lv1（[2, 1] 順序），確保顯示順序與計算依賴方向一致 */}
            {[2, 1].map((lv) => {
              const items = sortSemi(relevantSemi.filter((n) => recipes[n].level === lv))
              if (items.length === 0) return null
              const hasIndirect = lv === 1 && items.some((n) => !directSemi.has(n))
              // lv1 剩餘計算需要知道哪些 lv2 項目以及其剩餘量，所以在此收集 lv2 清單
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
                          // 間接 lv1（只出現在 lv2 配方內，非成品直接材料）的直接目標為 0
                          const trueDirectTarget = isDirect ? directTarget : 0
                          // Lv1 剩餘公式：
                          //   剩餘 = Σ(每個 lv2 的剩餘量 × 該 lv2 配方中此 lv1 的需求量)
                          //          + (直接目標 − 手頭數量)
                          // 前半項：補足 lv2 還未製作的部分所需的 lv1
                          // 後半項：成品直接需要的 lv1 數量（間接項此值為 0）
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
                          // 間接項目標欄顯示「-」；完成顯示「✓」
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
