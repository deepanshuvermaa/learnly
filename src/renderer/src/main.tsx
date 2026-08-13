import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/globals.css'
import { App } from './App'
import { installGlobalErrorCapture, rlog } from './lib/log'

installGlobalErrorCapture()
rlog.info('renderer', `window loaded: ${window.location.hash || '#/overlay'}`)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
