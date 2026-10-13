import React from 'react';
import { createRoot } from 'react-dom/client';
import Suite from './Suite.jsx';
import './styles.css';
import './suite.css';
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Suite />
  </React.StrictMode>,
);
