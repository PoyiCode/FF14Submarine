// 資料層：載入所有遊戲資料 JSON，並建立以繁體中文名為 key 的查找 map
// 所有 export 供 Calculator.tsx 使用；此模組不含任何 React 程式碼
import productsJson from './products.json'
import recipesJson from './recipes.json'
import basicMaterialsJson from './basicMaterials.json'
import submarinePartsJson from './submarineParts.json'

import type { Product, Products, Recipe, SubmarinePart, RawMaterial } from './interface'

// ── 成品 ──────────────────────────────────────────────────
// 原始 JSON 以數字索引為 key；重新以 chineseTraditional 建立查找 map，方便以名稱存取
const productsRaw = productsJson as unknown as Record<string, Product>
export const products: Products = Object.fromEntries(
  Object.values(productsRaw).map((p) => [p.chineseTraditional, p]),
)

// 取得指定成品的直接材料清單（recipe 欄位）
export function getProductMaterials(name: string): Record<string, number> {
  return products[name].recipe
}

// 取得指定成品需要的潛水艇骨架清單（part 欄位）；class 1–5 無此欄位，回傳空物件
export function getProductParts(name: string): Record<string, number> {
  return products[name].part ?? {}
}

// ── 半成品 ────────────────────────────────────────────────
// 原始 JSON 以數字 ID 為 key；過濾掉無繁中名的項目後，以 chineseTraditional 重建 map
const recipesRaw = recipesJson as Record<string, Recipe>
export const recipes: Record<string, Recipe> = Object.fromEntries(
  Object.values(recipesRaw)
    .filter((r) => r.chineseTraditional)
    .map((r) => [r.chineseTraditional!, r]),
)

// ── 潛水艇骨架 ────────────────────────────────────────────
// level=3 的中間部件，僅出現在 class 6–10 的成品配方中
const submarinePartsRaw = submarinePartsJson as Record<string, SubmarinePart>
export const submarineParts: Record<string, SubmarinePart> = Object.fromEntries(
  Object.values(submarinePartsRaw)
    .filter((p) => p.chineseTraditional)
    .map((p) => [p.chineseTraditional!, p]),
)

// ── 基礎素材 ──────────────────────────────────────────────
// basicMaterialsData：保留完整資料（含 id、itemLevel 等），用於排序與 ID 對應
export const basicMaterialsData = basicMaterialsJson as Record<string, RawMaterial>
// basicMaterials：僅存名稱的 Set，用於快速判斷某材料是否為葉節點（終端素材）
export const basicMaterials = new Set<string>(
  Object.values(basicMaterialsData).map((m) => m.chineseTraditional),
)
