import { useEffect, useState } from 'react';
import { STEPS, href, isCustomId, useStore } from '../state/store';

export function Masthead() {
  const { model, state, dispatch, interventions, isFixture, isBase } = useStore();
  const scenario = model.scenarios.find((s) => s.id === state.scenarioId)!;
  const on = interventions.filter((iv) => state.interventionIds.includes(iv.id));
  const [active, setActive] = useState(STEPS[0].id);

  // Scroll-spy: the step whose section is nearest the top is current.
  useEffect(() => {
    const els = STEPS.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const on = () => {
      const y = window.scrollY + 140;
      let cur = STEPS[0].id;
      for (const el of els) if (el.offsetTop <= y) cur = el.id;
      setActive(cur);
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [model]);

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
        <nav className="steps" aria-label="Sections">
          {STEPS.map((s, i) => (
            <a key={s.id} href={href(`#/${s.id.replace('sec-', '')}`)} aria-current={active === s.id ? 'page' : undefined}><i>{i + 1}</i>{s.label}</a>
          ))}
          <a href={href('#/plan')} className="aside">Your numbers</a>
          <a href={href('#/about')} className="aside2">How this works</a>
        </nav>
        <div className="strip">
          <span className="strip-l">Scenario</span>
          <a className="chip" href={href('#/whatif')}>{scenario.name}</a>
          <span className="strip-l">Levers on</span>
          {on.length === 0 ? <a className="chip dim" href={href('#/options')}>none</a> : on.map((iv) => (
            <a key={iv.id} className="chip on" href={href(`#/options/${'teamId' in iv ? iv.teamId : 'toTeamId' in iv ? iv.toTeamId : isCustomId(iv.id) ? iv.id.split(':')[0] : ''}`)} title={iv.name}>{iv.name}</a>
          ))}
          {!isBase && <button className="strip-reset" onClick={() => dispatch({ type: 'reset' })}>Reset to base plan</button>}
        </div>
      </div>
    </header>
  );
}
