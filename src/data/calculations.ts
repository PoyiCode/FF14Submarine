// 純計算函式與靜態衍生資料
// 此模組只依賴 handler.ts，不含任何 React 程式碼，所有 export 均可獨立測試

import { products, recipes, submarineParts, basicMaterials, basicMaterialsData } from './handler'

// ── 靜態衍生資料 ──────────────────────────────────────────
// 模組載入時計算一次，之後不再改變

// 所有半成品名稱（骨架 + 一般半成品），用於初始化 semiInventory state
export const allSemiNames = [...Object.keys(submarineParts), ...Object.keys(recipes)]

// 所有基礎素材名稱，用於初始化 rawInventory state
export const allRawNames = [...basicMaterials]

// 素材分類的排序順序（依遊戲慣例定義），未在清單內的分類排到最後
export const CATEGORY_ORDER = ['水晶', '石材', '金屬', '木材', '布料', '皮革', '骨材', '鍊金原料', '染料', '食材', '組件']

// 以繁體中文名建立基礎素材 lookup map，方便取得 category、itemLevel、id
export const rawByName = Object.fromEntries(
  Object.values(basicMaterialsData).map((m) => [m.chineseTraditional, m]),
)

// 以下三個 map 供匯入功能使用：JSON 以數字 ID 儲存，需要反查對應的中文名稱
export const productIdToName = Object.fromEntries(Object.entries(products).map(([name, p]) => [p.id, name]))
export const recipeIdToName = Object.fromEntries(Object.entries(recipes).map(([name, r]) => [r.id, name]))
export const basicIdToName = Object.fromEntries(Object.values(basicMaterialsData).map((m) => [m.id, m.chineseTraditional]))

// 匯入 JSON 的合法區段名稱
export const IMPORT_SECTIONS = ['products', 'materialsLv2', 'materialsLv1', 'materialsBasic'] as const

// 取得成品所屬的艦級名稱（如「鯊魚級」）
export function getClass(key: string): string {
  return products[key].className ?? ''
}

// 將所有成品依艦級分組，key 為 className，value 為該艦級的成品名稱陣列
export const productsByClass = Object.keys(products).reduce<Record<string, string[]>>(
  (acc, key) => {
    const cls = getClass(key)
    ;(acc[cls] ??= []).push(key)
    return acc
  },
  {},
)

// 保持 products.json 中艦級第一次出現的順序，確保 UI 顯示順序與資料一致
export const sortedClasses = Object.keys(productsByClass)

// ── 匯入驗證 ──────────────────────────────────────────────

// 驗證使用者匯入的 JSON 格式；回傳錯誤訊息字串，格式正確則回傳 null
export function validateImportData(data: unknown): string | null {
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

// ── 排序函式 ──────────────────────────────────────────────

// 依 CATEGORY_ORDER → itemLevel → id 排序基礎素材名稱陣列
export function sortRaw(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ma = rawByName[a], mb = rawByName[b]
    const ca = CATEGORY_ORDER.indexOf(ma?.category ?? ''), cb = CATEGORY_ORDER.indexOf(mb?.category ?? '')
    if (ca !== cb) return (ca === -1 ? 999 : ca) - (cb === -1 ? 999 : cb)
    if ((ma?.itemLevel ?? 0) !== (mb?.itemLevel ?? 0)) return (ma?.itemLevel ?? 0) - (mb?.itemLevel ?? 0)
    return (ma?.id ?? 0) - (mb?.id ?? 0)
  })
}

// 依 CATEGORY_ORDER → itemLevel → id 排序半成品名稱陣列
export function sortSemi(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ra = recipes[a], rb = recipes[b]
    const ca = CATEGORY_ORDER.indexOf(ra?.category ?? ''), cb = CATEGORY_ORDER.indexOf(rb?.category ?? '')
    if (ca !== cb) return (ca === -1 ? 999 : ca) - (cb === -1 ? 999 : cb)
    if ((ra?.itemLevel ?? 0) !== (rb?.itemLevel ?? 0)) return (ra?.itemLevel ?? 0) - (rb?.itemLevel ?? 0)
    return (ra?.id ?? 0) - (rb?.id ?? 0)
  })
}

// ── 計算函式 ──────────────────────────────────────────────

// 取得某素材的配方；骨架優先，其次半成品；基礎素材或未知物品回傳 null
export function getItemRecipe(item: string): Record<string, number> | null {
  if (submarineParts[item]) return submarineParts[item].recipe
  if (recipes[item]) return recipes[item].recipe
  return null
}

// 遞迴將材料展開至最底層的基礎素材，並累加到 acc
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
export function computeRequired(selected: Record<string, number>): Record<string, number> {
  const acc: Record<string, number> = {}
  for (const [name, selectedQty] of Object.entries(selected)) {
    for (const [mat, qty] of Object.entries(products[name].recipe)) {
      resolveToRaw(mat, qty * selectedQty, acc)
    }
  }
  return acc
}

// 計算選取成品所需的半成品總量（含骨架、Lv2、Lv1）
// Lv1 半成品若同時出現在成品直接配方（directMats）與 Lv2 配方中，
// 展開 Lv2 時會跳過這些 Lv1，避免被重複計算兩次
export function computeRequiredSemi(selected: Record<string, number>): Record<string, number> {
  const acc: Record<string, number> = {}

  // 全域直接材料集合：所有選取成品配方中直接列出的 Lv1 半成品
  // 必須全域計算而非逐成品計算，否則某成品的 Lv1 直接用料在展開
  // 其他成品的 Lv2 時不會被跳過，造成 requiredSemi 重複累加
  const directMats = new Set<string>()
  for (const name of Object.keys(selected)) {
    for (const mat of Object.keys(products[name].recipe)) {
      if (recipes[mat]?.level === 1) directMats.add(mat)
    }
  }

  function resolve(item: string, qty: number) {
    if (basicMaterials.has(item)) return
    const recipe = getItemRecipe(item)
    if (recipe) {
      acc[item] = (acc[item] ?? 0) + qty
      for (const [mat, amount] of Object.entries(recipe)) {
        if (directMats.has(mat) && recipes[mat]?.level === 1) continue
        resolve(mat, amount * qty)
      }
    }
  }

  for (const [name, selectedQty] of Object.entries(selected)) {
    for (const [partName, qty] of Object.entries(products[name].part ?? {})) {
      if (submarineParts[partName]) {
        acc[partName] = (acc[partName] ?? 0) + qty * selectedQty
        for (const [mat, amount] of Object.entries(submarineParts[partName].recipe)) resolve(mat, amount * qty * selectedQty)
      }
    }
    for (const [mat, qty] of Object.entries(products[name].recipe)) resolve(mat, qty * selectedQty)
  }
  return acc
}

// 計算單一成品直接需要的半成品數量（不遞迴展開子配方）
// 用於「完成」按鈕的庫存驗證與扣除：使用者持有的是已製好的骨架/Lv2，
// 不需要再向下展開確認 Lv1 庫存（Lv1 早已在製作 Lv2 時消耗）
export function computeDirectSemi(name: string, qty: number): Record<string, number> {
  const acc: Record<string, number> = {}
  const product = products[name]
  for (const [partName, partQty] of Object.entries(product.part ?? {})) {
    if (submarineParts[partName]) acc[partName] = (acc[partName] ?? 0) + partQty * qty
  }
  for (const [mat, matQty] of Object.entries(product.recipe)) {
    if (!basicMaterials.has(mat) && getItemRecipe(mat)) {
      acc[mat] = (acc[mat] ?? 0) + matQty * qty
    }
  }
  return acc
}

// 取得在成品配方中「直接列出」的半成品集合（不包含只在 Lv2 配方內出現的間接 Lv1）
// 用於判斷 Lv1 半成品是否要顯示目標數字，以及是否在名稱後加「*」
export function getDirectRequiredSemi(selected: Record<string, number>): Set<string> {
  const direct = new Set<string>()
  for (const name of Object.keys(selected)) {
    for (const mat of Object.keys(products[name].recipe)) {
      if (!basicMaterials.has(mat) && getItemRecipe(mat)) direct.add(mat)
    }
  }
  return direct
}

// 將半成品庫存與基礎素材庫存換算為等價基礎素材量，用於進度追蹤
// 半成品只採計「需要量上限內」的部分，避免進度超過 100%
export function computeEquivalent(
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

// 依目前選取的成品走訪完整材料樹，回傳實際用到的骨架、半成品、基礎素材名稱列表
// 庫存欄位只顯示「有用到的」材料，不顯示與當前選取無關的項目
export function getRelevantItems(selected: Record<string, number>): { parts: string[]; semi: string[]; raw: string[] } {
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
    for (const partName of Object.keys(products[name].part ?? {})) {
      if (submarineParts[partName]) {
        parts.add(partName)
        for (const mat of Object.keys(submarineParts[partName].recipe)) traverse(mat)
      }
    }
    for (const mat of Object.keys(products[name].recipe)) traverse(mat)
  }

  // 保持與原始 JSON 相同的宣告順序（過濾而非重排），確保顯示順序一致
  return {
    parts: Object.keys(submarineParts).filter((n) => parts.has(n)),
    semi: Object.keys(recipes).filter((n) => semi.has(n)),
    raw: [...basicMaterials].filter((n) => raw.has(n)),
  }
}
