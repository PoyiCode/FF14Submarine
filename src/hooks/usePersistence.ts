// 每當三個核心 state 變動時，同步寫入 localStorage 以持久化
import { useEffect } from 'react'
import { setStorage } from '../utils/storage'

export function usePersistence(
  selected: Record<string, number>,
  semiInventory: Record<string, number>,
  rawInventory: Record<string, number>,
): void {
  useEffect(() => { setStorage('calc_selected', JSON.stringify(selected)) }, [selected])
  useEffect(() => { setStorage('calc_semi', JSON.stringify(semiInventory)) }, [semiInventory])
  useEffect(() => { setStorage('calc_raw', JSON.stringify(rawInventory)) }, [rawInventory])
}