import { useEffect, useRef } from 'react';
import { mountSkilling } from './planner';
import './skilling.css';

const publicApi = 'https://osrs-skilling-methods.profoundbadge64.chatgpt.site/api/';

export default function SkillingPage() {
  const page = useRef<HTMLElement>(null);

  useEffect(() => {
    const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const api = local ? `${import.meta.env.BASE_URL}skilling-api/` : publicApi;
    if (page.current) return mountSkilling(page.current, api);
  }, []);

  return (
    <main className="app skilling-page" ref={page}>
      <a className="skip" href="#skilling-content">Skip to content</a>
      <header className="skilling-topbar">
        <p className="breadcrumb" id="breadcrumb">Overview</p>
        <div className="top-actions">
          <button className="search-trigger" id="open-search" type="button">
            <span className="lens" aria-hidden="true" /><span id="search-label">Search site</span><kbd>Ctrl K</kbd>
          </button>
          <div className="language-toggle" id="language-toggle" role="group" aria-label="Language">
            <button type="button" data-language="en" lang="en" aria-label="English" aria-pressed="true">EN</button>
            <button type="button" data-language="pt-BR" lang="pt-BR" aria-label="Português (Brasil)" aria-pressed="false">PT-BR</button>
          </div>
        </div>
      </header>
      <nav id="navigation" aria-label="Skilling sections" />
      <div className="market-toolbar">
        <button className="price-button" id="refresh-prices" type="button">Update Wiki prices</button>
        <span className="market-status" id="market-status" role="status">Using source prices</span>
        <a className="market-link" href="https://oldschool.runescape.wiki/w/RuneScape:Real-time_Prices" target="_blank" rel="noreferrer">OSRS Wiki</a>
        <div className="trade-options" id="trade-options">
          <div className="trade-group" data-trade-group="buy" role="group" aria-label="Buy speed">
            <span>Buy</span><button type="button" className="ghost" data-trade="buy" data-speed="instant" aria-pressed="true">Instant</button>
            <button type="button" className="ghost" data-trade="buy" data-speed="slow" aria-pressed="false">Slow</button>
          </div>
          <div className="trade-group" data-trade-group="sell" role="group" aria-label="Sell speed">
            <span>Sell</span><button type="button" className="ghost" data-trade="sell" data-speed="instant" aria-pressed="true">Instant</button>
            <button type="button" className="ghost" data-trade="sell" data-speed="slow" aria-pressed="false">Slow</button>
          </div>
          <small id="trade-tax">2% GE seller tax where applicable</small>
        </div>
      </div>
      <div id="skilling-content" tabIndex={-1} />
      <footer className="site-footer"><span>Skilling Methods</span><span id="footer-source">Values from the source exports</span></footer>
      <dialog id="search-dialog" aria-labelledby="search-title">
        <form method="dialog" className="dialog-head">
          <h2 id="search-title">Search site</h2><button type="submit" aria-label="Close search">×</button>
        </form>
        <input className="wide-input" id="site-search" type="search" placeholder="e.g. repair kit, herblore, level 99"
          aria-label="Method, sheet, or level" autoComplete="off" />
        <div id="search-results" className="search-results" />
      </dialog>
    </main>
  );
}
