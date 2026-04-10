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

// 基礎素材：無法再拆解的葉節點
export interface RawMaterial {
  id: number
  chineseTraditional: string
  category: string
  itemLevel: number
}
