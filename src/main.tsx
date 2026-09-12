import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';

// ?theme=dark|light in the hash query pins the theme; otherwise the system setting applies.
const theme = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('theme');
if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
