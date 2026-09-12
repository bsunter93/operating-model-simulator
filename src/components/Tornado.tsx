import { useMemo } from 'react';
import { useStore } from '../state/store';
import { sensitivity } from '../lib/sensitivity';

/** What actually moves the answer: one assumption nudged at a time, rerun through the model. */
export function Tornado() {
  const { state, model, interventions, result } = useStore();
  const active = interventions.filter((iv) => state.interventionIds.includes(iv.id));
  const scen = model.scenarios.find((s) => s.id === state.scenarioId)!;
  const rows = useMemo(() => sensitivity(model, scen, active, result), [model, scen, active, result]);
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.gapHours)));
  return (
    <div className="tornado">
      <table className="tbl torn">
        <tbody>
          {rows.map((r) => (
            <tr key={r.variable}>
              <td className="ink left">{r.variable} <span className="dim">{r.change}</span></td>
              <td className="tbar"><span className={'tb' + (r.gapHours >= 0 ? ' worse' : ' better')} style={{ width: `${(Math.abs(r.gapHours) / max) * 100}%` }} /></td>
              <td className={r.gapHours >= 0 ? 'ink' : ''}>{r.gapHours >= 0 ? '+' : '−'}{Math.round(Math.abs(r.gapHours)).toLocaleString()} h</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">Each row nudges one assumption and reruns the model; bars are the change in hours over capacity across all teams.</p>
    </div>
  );
}
