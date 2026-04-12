// 成品（products.json）：玩家最終要製作的潛水艇零件
export interface Product {
  id: number                          // 遊戲內物品 ID
  sort: number                        // 顯示排序權重
  displayName: string                 // 介面顯示用簡短名稱（如「船首」）
  class: string                       // 艦級代號（如 "I"、"II"）
  className: string                   // 艦級完整名稱（如 "鯊魚級"）
  chineseTraditional: string          // 繁體中文完整名稱，作為查找 map 的 key
  recipe: Record<string, number>      // 直接材料 → 數量（值可能是半成品或基礎素材）
  part?: Record<string, number>       // class 6–10 專用：需要的潛水艇骨架 → 數量
}
export type Products = Record<string, Product>

// 半成品（recipes.json）：可被遞迴展開的中間材料
// level=1：基礎半成品（直接由基礎素材合成）
// level=2：進階半成品（由 lv1 半成品或基礎素材合成）
export interface Recipe {
  id: number
  level: number                       // 1 或 2，決定在庫存表中的分組位置
  category: string                    // 素材分類（水晶/金屬/木材…），用於排序
  itemLevel: number                   // 物品等級，用於次要排序
  recipe: Record<string, number>      // 材料 → 數量（key 為繁體中文名）
  job?: string                        // 製作職業
  japanese?: string
  english?: string
  chineseTraditional?: string         // 繁體中文名；部分項目可能為 undefined（會被過濾掉）
  chineseSimplified?: string
}

// 潛水艇骨架（submarineParts.json）：level=3，class 6–10 成品的中間骨架部件
export interface SubmarinePart {
  id: number
  category: string
  recipe: Record<string, number>      // 由哪些半成品／基礎素材組成
  itemLevel: number
  japanese?: string
  english?: string
  chineseTraditional?: string
  chineseSimplified?: string
}

// 基礎素材（basicMaterials.json）：材料樹的葉節點，無法再往下拆解
export interface RawMaterial {
  id: number
  chineseTraditional: string
  category: string                    // 素材分類，用於 CATEGORY_ORDER 排序
  itemLevel: number
}
