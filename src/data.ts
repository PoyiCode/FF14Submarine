import productsJson from './data/products.json'
import recipesJson from './data/recipes.json'
import basicMaterialsJson from './data/basicMaterials.json'

// 成品
export interface Product {
  sort: number
  displayName: string
  class: string
  className: string
  materials: Record<string, number>
}
export type Products = Record<string, Product>
export const products = productsJson as unknown as Products

// 取得成品的材料
export function getProductMaterials(name: string): Record<string, number> {
  return products[name].materials
}

// 半成品：可被遞迴展開的中間材料
export interface Recipe {
  level: number
  materials: Record<string, number>
}
export const recipes = recipesJson as Record<string, Recipe>

// 基礎素材：無法再拆解的葉節點
export interface RawMaterial {
  category: string
}
export const basicMaterialsData = basicMaterialsJson as Record<string, RawMaterial>
export const basicMaterials = new Set<string>(Object.keys(basicMaterialsData))
