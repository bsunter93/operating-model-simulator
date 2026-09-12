import { href, useRoute } from '../state/store';

export function Masthead() {
  const route = useRoute();
  return (
    <header className="mast">
      <div className="mast-in">
        <a className="brand" href="#/overview">
          <b>Operating Model Simulator</b>
          <span>Atlas Systems · 2027 plan</span>
        </a>
        <nav className="nav" aria-label="Views">
          <a href={href({ view: 'overview' })} aria-current={route.view === 'overview' ? 'page' : undefined}>Overview</a>
          <a href={href({ view: 'capacity', teamId: 'team-implementation' })} aria-current={route.view === 'capacity' ? 'page' : undefined}>Capacity</a>
        </nav>
        <a className="brand-home" href="https://bensunter.com/">bensunter.com</a>
      </div>
    </header>
  );
}
