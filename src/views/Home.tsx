import { Hold } from './Hold';
import { WhatIf } from './WhatIf';
import { Options } from './Options';
import { Decide } from './Decide';
import { useStore } from '../state/store';

/** The one page: the four steps in order. Detail opens in the drawer. */
export function Home() {
  const { state, result, model } = useStore();
  const teamId = state.teamId ?? result.summary.firstBreakTeamId ?? model.teams[0].id;
  return (
    <div className="page one">
      <Hold />
      <WhatIf />
      <Options teamId={teamId} />
      <Decide />
    </div>
  );
}
