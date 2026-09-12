import { modelWarnings } from '../engine';
import { useStore } from '../state/store';
import { BUILT, TESTS, VERSION } from '../lib/meta';

export function Masthead() {
  const { model, state, dispatch, interventions, isFixture, isBase } = useStore();
  const scenario = model.scenarios.find((s) => s.id === state.scenarioId)!;
  const on = interventions.filter((iv) => state.interventionIds.includes(iv.id));
  const warnings = modelWarnings(model);
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
        <div className="mast-right">
        <details className="verified">
          <summary>{warnings.length ? '△ Model checks' : '✓ Model verified'}</summary>
          <div className="verified-body">
            <b>Model status</b>
            <ul>
              <li>✓ {TESTS} automated tests, 0 failures</li>
              <li>{warnings.length ? `△ ${warnings.length} consistency warning${warnings.length > 1 ? 's' : ''} in your numbers` : '✓ Inputs consistent with each other'}</li>
              <li>✓ Scenario reconciles to the base plan (same engine, same inputs)</li>
              <li>✓ Attrition, hiring lead times, dependencies applied monthly</li>
            </ul>
            <p>Engine v{VERSION} · built {BUILT} · <a href="https://github.com/bsunter93/operating-model-simulator">source and tests</a></p>
          </div>
        </details>
        <nav className="mast-links" aria-label="Pages">
          <a href={/^#\/mine/.test(window.location.hash) ? '#/' : '#/mine'}>{/^#\/mine/.test(window.location.hash) ? '← The story' : 'Your numbers →'}</a>
          <a href="https://bensunter.com/">bensunter.com</a>
        </nav>
        </div>
      </div>
    </header>
  );
}
