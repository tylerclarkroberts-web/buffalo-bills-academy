import React from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted, SIL Open Font License fonts (bundled by Vite from @fontsource)
import '@fontsource/anton/latin-400.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import '@fontsource/vt323/latin-400.css';
import '@fontsource/yellowtail/latin-400.css';
import '@fontsource/rye/latin-400.css';
import '@fontsource/monoton/latin-400.css';
import App from './App.jsx';
import './styles.css';
import './neon.css';
import './themes/themes.css';

createRoot(document.getElementById('root')).render(<App />);
