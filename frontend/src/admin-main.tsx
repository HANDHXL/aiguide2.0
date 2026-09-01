import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import AdminApp from './AdminApp'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <HashRouter>
      <AdminApp />
    </HashRouter>,
)
