// localStorage 工具：用於在瀏覽器端持久化使用者的選取狀態與庫存數字
// 相較於 cookie，localStorage 上限為 5 MB 且不隨 HTTP 請求傳送

// 寫入 localStorage
export function setStorage(key: string, value: string): void {
  localStorage.setItem(key, value)
}

// 從 localStorage 讀取 JSON 字串並解析；解析失敗時回傳 fallback 預設值
export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}