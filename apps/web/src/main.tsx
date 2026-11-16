import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './phase-e.css';
import './phase-f.css';
import './phase-g.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
