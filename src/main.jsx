import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '../styles.css';
import '../chart-tools.css';
import '../terminal.css';
import './exchange.css';

createRoot(document.getElementById('root')).render(<App/>);
