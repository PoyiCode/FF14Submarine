import productsJson from './data/products.json'
import recipesJson from './data/recipes.json'
import basicMaterialsJson from './data/basicMaterials.json'
import submarinePartsJson from './data/submarineParts.json'

// 成品
export interface Product {
  id: number
  sort: number
  displayName: string
  class: string
  className: string
  chineseTraditional: string
  recipe: Record<string, number>
  part?: Record<string, number>
}
export type Products = Record<string, Product>
const productsRaw = productsJson as unknown as Record<string, Product>
// 以 chineseTraditional 建立查找 map
export const products: Products = Object.fromEntries(
  Object.values(productsRaw).map((p) => [p.chineseTraditional, p]),
)

// 取得成品的材料
export function getProductMaterials(name: string): Record<string, number> {
  return products[name].recipe
}

// 取得成品所需的潛水艇組件
export function getProductParts(name: string): Record<string, number> {
  return products[name].part ?? {}
}

// 半成品：可被遞迴展開的中間材料
export interface Recipe {
  id: number
  level: number
  category: string
  recipe: Record<string, number>
  job?: string
  japanese?: string
  english?: string
  chineseTraditional?: string
  chineseSimplified?: string
}
// 原始 JSON 以數字 ID 為 key，重新以 chineseTraditional 建立查找 map
const recipesRaw = recipesJson as Record<string, Recipe>
export const recipes: Record<string, Recipe> = Object.fromEntries(
  Object.values(recipesRaw)
    .filter((r) => r.chineseTraditional)
    .map((r) => [r.chineseTraditional!, r]),
)

// 潛水艇組件：level=3，從骨架製作的中間部件
export interface SubmarinePart {
  id: number
  category: string
  recipe: Record<string, number>
  itemLevel: number
  japanese?: string
  english?: string
  chineseTraditional?: string
  chineseSimplified?: string
}
const submarinePartsRaw = submarinePartsJson as Record<string, SubmarinePart>
export const submarineParts: Record<string, SubmarinePart> = Object.fromEntries(
  Object.values(submarinePartsRaw)
    .filter((p) => p.chineseTraditional)
    .map((p) => [p.chineseTraditional!, p]),
)

// 基礎素材：無法再拆解的葉節點
export interface RawMaterial {
  id: number
  chineseTraditional: string
  category: string
  itemLevel: number
}
export const basicMaterialsData = basicMaterialsJson as Record<string, RawMaterial>
// 以 ChineseTraditional 建立 Set，供程式碼以素材名查找
export const basicMaterials = new Set<string>(
  Object.values(basicMaterialsData).map((m) => m.chineseTraditional),
)
