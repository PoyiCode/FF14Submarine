import { useState } from 'react'
import Calculator from './components/Calculator'
import './App.css'

// 所有分頁的定義；新增功能分頁時在此陣列加入新項目，並在下方 tab-content 區塊新增對應的條件渲染
const tabs = [
  { id: 'calculator', label: '素材計算' },
] as const

// 從 tabs 陣列自動推導出合法的分頁 id 聯集型別，避免字串拼錯
type TabId = (typeof tabs)[number]['id']

export default function App() {
  // 目前顯示的分頁；預設開啟素材計算頁
  const [activeTab, setActiveTab] = useState<TabId>('calculator')

  return (
    <main className="app">
      <h1>FF14 潛水艇工具箱</h1>

      {/* 分頁切換列：依 tabs 陣列動態產生按鈕 */}
      <nav className="tab-bar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* 分頁內容區：依 activeTab 條件渲染對應元件 */}
      <div className="tab-content">
        {activeTab === 'calculator' && <Calculator />}
      </div>

      <footer className="app-footer">
        <span>大根蘿蔔@利維坦</span>
        <span>v0.1.1</span>
      </footer>
    </main>
  )
}
