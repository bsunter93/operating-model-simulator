import { useStore } from '../state/store';

export function Masthead() {
  const { model, state, dispatch, interventions, isFixture, isBase } = useStore();
  const scenario = model.scenarios.find((s) => s.id === state.scenarioId)!;
  const on = interventions.filter((iv) => state.interventionIds.includes(iv.id));
  return (
    <header className="mast">
      <div className="mast-in">
        <a className="brand" href="#/">
          <b>Operating Model Simulator</b>
          <span>{model.name} · {model.calendar.startMonth.slice(0, 4)} plan{isFixture ? ' · fictional' : ' · your numbers'}</span>
        </a>
        <div className="state">
          <span className="strip-l">Scenario</span><span className="chip">{scenario.name}</span>
          <span className="strip-l">Levers on</span>{on.length === 0 ? <span className="chip dim">none</span> : on.map((iv) => <span key={iv.id} className="chip on" title={iv.name}>{iv.name}</span>)}
          {!isBase && <button className="strip-reset" onClick={() => dispatch({ type: 'reset' })}>Reset</button>}
        </div>
        <a className="brand-home" href="https://bensunter.com/">bensunter.com</a>
      </div>
    </header>
  );
}
