import { lazy, Suspense, useEffect, useState, type MouseEvent } from 'react';
import type { CombatPage } from './App';

const CombatTools = lazy(() => import('./App'));
const SkillingPage = lazy(() => import('./skilling/SkillingPage'));

const tools = {
  specscape: { name: 'SpecScape', icon: '⚔' },
  speedrun: { name: 'Speedrun', icon: '◷' },
  skilling: { name: 'Skilling Methods', icon: '✦' },
};
type ToolPage = keyof typeof tools;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const toolPath = (page: ToolPage) => `${basePath}/${page}/`;

function pageFromLocation(): ToolPage {
  const slug = location.pathname.slice(basePath.length).split('/')[1];
  return Object.hasOwn(tools, slug) ? slug as ToolPage : 'specscape';
}

export default function ToolSite() {
  const [page, setPage] = useState(pageFromLocation);
  const [combatPage, setCombatPage] = useState<CombatPage | null>(() => {
    const initial = pageFromLocation();
    return initial === 'skilling' ? null : initial;
  });
  const [navCollapsed, setNavCollapsed] = useState(false);

  useEffect(() => {
    const path = toolPath(pageFromLocation());
    if (location.pathname !== path) history.replaceState(null, '', `${path}${location.search}${location.hash}`);
    const onPopState = () => {
      const next = pageFromLocation();
      setPage(next);
      if (next !== 'skilling') setCombatPage(next);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (page !== 'skilling') document.title = `${tools[page].name} · OSRS Optimized`;
  }, [page]);

  function navigate(event: MouseEvent<HTMLAnchorElement>, next: ToolPage) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const path = toolPath(next);
    if (location.pathname === path) return;
    history.pushState(null, '', path);
    setPage(next);
    if (next !== 'skilling') setCombatPage(next);
    window.scrollTo(0, 0);
  }

  return (
    <div className={`app-shell ${navCollapsed ? 'nav-collapsed' : ''}`}>
      <aside className="site-sidebar" aria-label="Site pages">
        <div className="sidebar-brand"><span className="sidebar-mark">O</span><span className="sidebar-brand-name">OSRS Optimized</span></div>
        <button className="sidebar-collapse" type="button" aria-label={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={!navCollapsed} onClick={() => setNavCollapsed((collapsed) => !collapsed)}>
          {navCollapsed ? '›' : '‹'}
        </button>
        <nav className="page-nav" aria-label="Tools">
          {(Object.keys(tools) as ToolPage[]).map((tool) => <a key={tool} href={toolPath(tool)}
            className={`page-nav-item ${page === tool ? 'active' : ''}`}
            aria-current={page === tool ? 'page' : undefined} aria-label={tools[tool].name}
            title={tools[tool].name} onClick={(event) => navigate(event, tool)}>
            <span className="page-nav-icon" aria-hidden="true">{tools[tool].icon}</span>
            <span className="page-nav-label">{tools[tool].name}</span>
          </a>)}
        </nav>
        <div className="sidebar-footer"><span className="page-nav-icon">OSRS</span><span className="page-nav-label">Tools</span></div>
      </aside>
      {combatPage && <Suspense fallback={page === 'skilling' ? null : <div className="app">Loading game data…</div>}>
        <CombatTools activePage={combatPage} hidden={page === 'skilling'} />
      </Suspense>}
      {page === 'skilling' && <Suspense fallback={<div className="app">Loading Skilling Methods…</div>}>
        <SkillingPage />
      </Suspense>}
    </div>
  );
}
