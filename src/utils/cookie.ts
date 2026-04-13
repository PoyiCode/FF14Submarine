// Cookie 工具：用於在瀏覽器端持久化使用者的選取狀態與庫存數字

const COOKIE_TTL_MS = 90 * 24 * 60 * 60 * 1000  // 90 天有效期

// 以正規表示式從 document.cookie 字串中取出指定名稱的 cookie 值
export function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : null
}

// 寫入 cookie；SameSite=Lax 防止跨站請求攜帶
export function setCookie(name: string, value: string): void {
  const expires = new Date(Date.now() + COOKIE_TTL_MS).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`
}

// 從 cookie 讀取 JSON 字串並解析；解析失敗時回傳 fallback 預設值
export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = getCookie(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
