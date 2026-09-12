import { Masthead } from './components/Masthead';
import { Tour } from './components/Tour';
import { Hold } from './views/Hold';
import { Why } from './views/Why';
import { Portfolio } from './views/Portfolio';
import { Workforce } from './views/Workforce';
import { Cost } from './views/Cost';
import { Organization } from './views/Organization';
import { WhatIf } from './views/WhatIf';
import { Options } from './views/Options';
import { Decide } from './views/Decide';
import { ModelView } from './views/ModelView';
import { StoreProvider, useRoute } from './state/store';

function Screen() {
  const route = useRoute();
  switch (route.view) {
    case 'why': return <Why teamId={route.teamId} />;
    case 'initiatives': return <Portfolio />;
    case 'workforce': return <Workforce />;
    case 'cost': return <Cost />;
    case 'organization': return <Organization />;
    case 'whatif': return <WhatIf />;
    case 'options': return <Options teamId={route.teamId} />;
    case 'decide': return <Decide />;
    case 'plan': return <ModelView />;
    default: return <Hold />;
  }
}

export default function App() {
  return (
    <StoreProvider>
      <div className="app">
        <Masthead />
        <div className="page one"><Screen /></div>
        <Tour />
        <footer className="foot">
          Atlas Systems is fictional. Every number on these pages is computed by a deterministic monthly model from one JSON file; nothing is stored as a result.
          {' '}Built by <a href="https://bensunter.com/">Ben Sunter</a>. The pods-versus-pooled math comes from <a href="https://bensunter.com/pods-or-pooled.html">Half a Day of Nothing</a>.
        </footer>
      </div>
    </StoreProvider>
  );
}
