import { useState } from 'react'
import Calculator from './components/Calculator'
import './App.css'

const tabs = [
  { id: 'calculator', label: '素材計算' },
] as const

type TabId = (typeof tabs)[number]['id']

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('calculator')

  return (
    <main className="app">
      <h1>FF14 潛水艇工具箱</h1>

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

      <div className="tab-content">
        {activeTab === 'calculator' && <Calculator />}
      </div>
    </main>
  )
}
