import { STEPS, href, useRoute, useStore } from '../state/store';
import { isCustomId } from '../state/store';

export function Masthead() {
  const route = useRoute();
  const { model, state, dispatch, interventions, isFixture, isBase } = useStore();
  const scenario = model.scenarios.find((s) => s.id === state.scenarioId)!;
  const on = interventions.filter((iv) => state.interventionIds.includes(iv.id));
  const current = route.view === 'initiatives' || route.view === 'workforce' || route.view === 'cost' || route.view === 'organization' ? 'why' : route.view;
  const pathFor = (view: string, path: string) => {
    if (view === 'why' && route.view === 'why' && route.teamId) return `#/why/${route.teamId}`;
    if (view === 'options' && route.view === 'options' && route.teamId) return `#/options/${route.teamId}`;
    return path;
  };
  return (
    <header className="mast">
      <div className="mast-in">
        <a className="brand" href={href('#/')}>
          <b>Operating Model Simulator</b>
          <span>{model.name} · {model.calendar.startMonth.slice(0, 4)} plan{isFixture ? '' : ' · your numbers'}</span>
        </a>
        <a className="brand-home" href="https://bensunter.com/">bensunter.com</a>
      </div>
      <div className="sticky-nav">
      <nav className="steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <a key={s.view} href={href(pathFor(s.view, s.path))} aria-current={current === s.view ? 'page' : undefined} className={s.view === 'plan' ? 'aside' : s.view === 'about' ? 'aside2' : ''}>
            {s.view !== 'plan' && s.view !== 'about' && <i>{i + 1}</i>}{s.label}
          </a>
        ))}
      </nav>
      <div className="strip">
        <span className="strip-l">Scenario</span>
        <a className="chip" href={href('#/whatif')}>{scenario.name}</a>
        <span className="strip-l">Levers on</span>
        {on.length === 0 ? <span className="chip dim">none</span> : on.map((iv) => (
          <a key={iv.id} className="chip on" href={href(`#/options/${'teamId' in iv ? iv.teamId : 'toTeamId' in iv ? iv.toTeamId : isCustomId(iv.id) ? iv.id.split(':')[0] : ''}`)} title={iv.name}>{iv.name}</a>
        ))}
        {!isBase && <button className="strip-reset" onClick={() => dispatch({ type: 'reset' })}>Reset to base plan</button>}
      </div>
      </div>
    </header>
  );
}
