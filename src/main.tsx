import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ToolSite from './ToolSite';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToolSite />
  </StrictMode>,
);
