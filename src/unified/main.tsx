import React from 'react'
import ReactDOM from 'react-dom/client'
import '../index.css'
import './unified.css'
import { UnifiedApp } from './UnifiedApp'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><UnifiedApp /></React.StrictMode>,
)
