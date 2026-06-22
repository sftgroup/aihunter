const __spinStyle = document.createElement("style"); __spinStyle.textContent = "@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}"; document.head.appendChild(__spinStyle);
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
