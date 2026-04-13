// 每當三個核心 state 變動時，同步寫入 cookie 以持久化
import { useEffect } from 'react'
import { setCookie } from '../utils/cookie'

export function usePersistence(
  selected: Record<string, number>,
  semiInventory: Record<string, number>,
  rawInventory: Record<string, number>,
): void {
  useEffect(() => { setCookie('calc_selected', JSON.stringify(selected)) }, [selected])
  useEffect(() => { setCookie('calc_semi', JSON.stringify(semiInventory)) }, [semiInventory])
  useEffect(() => { setCookie('calc_raw', JSON.stringify(rawInventory)) }, [rawInventory])
}
