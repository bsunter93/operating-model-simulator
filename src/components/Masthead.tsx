import { href, useRoute, useStore } from '../state/store';

export function Masthead() {
  const route = useRoute();
  const { model, isFixture } = useStore();
  const at = (v: string) => (route.view === v ? 'page' : undefined);
  return (
    <header className="mast">
      <div className="mast-in">
        <a className="brand" href={href('#/overview')}>
          <b>Operating Model Simulator</b>
          <span>{model.name} · {model.calendar.startMonth.slice(0, 4)} plan{isFixture ? '' : ' · your numbers'}</span>
        </a>
        <nav className="nav" aria-label="Views">
          <a href={href('#/overview')} aria-current={at('overview')}>Overview</a>
          <a href={href('#/capacity/' + (route.view === 'capacity' ? route.teamId : model.teams[0].id))} aria-current={at('capacity')}>Capacity</a>
          <a href={href('#/scenarios')} aria-current={at('scenarios')}>Scenarios</a>
          <a href={href('#/model')} aria-current={at('model')}>Your numbers</a>
        </nav>
        <a className="brand-home" href="https://bensunter.com/">bensunter.com</a>
      </div>
    </header>
  );
}
