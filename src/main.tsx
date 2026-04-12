// 應用程式進入點：將 App 元件掛載到 #root DOM 節點
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode 會在開發模式下對元件做雙重渲染，以提早發現副作用問題
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
