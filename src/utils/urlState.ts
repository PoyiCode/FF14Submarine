// URL hash 狀態編碼與解碼：使用 lz-string 壓縮以縮短分享連結長度
// 格式：#<LZString.compressToEncodedURIComponent(JSON)>
import LZString from 'lz-string'

// URL hash 攜帶的完整應用狀態（si/ri 只儲存非零值以縮短長度）
export interface UrlState {
  s: Record<string, number>   // selected：成品名稱 → 數量
  si: Record<string, number>  // semiInventory（非零項）
  ri: Record<string, number>  // rawInventory（非零項）
}

export function encodeState(state: UrlState): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(state))
}

export function decodeState(hash: string): UrlState | null {
  try {
    const raw = LZString.decompressFromEncodedURIComponent(hash.replace(/^#/, ''))
    if (!raw) return null
    return JSON.parse(raw) as UrlState
  } catch {
    return null
  }
}

// 嘗試從目前頁面的 URL hash 讀取狀態；無 hash 時回傳 null（改用 localStorage）
export function readUrlState(): UrlState | null {
  const hash = window.location.hash
  if (!hash || hash === '#') return null
  return decodeState(hash)
}
