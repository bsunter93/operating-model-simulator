import { Masthead } from './components/Masthead';
import { Rail } from './components/Rail';
import { Overview } from './views/Overview';
import { TeamView } from './views/TeamView';
import { Scenarios } from './views/Scenarios';
import { ModelView } from './views/ModelView';
import { StoreProvider, useRoute } from './state/store';

function Screen() {
  const route = useRoute();
  return (
    <div className="page">
      {route.view === 'capacity' ? <TeamView teamId={route.teamId} />
        : route.view === 'scenarios' ? <Scenarios />
        : route.view === 'model' ? <ModelView />
        : <Overview />}
      <Rail />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <div className="app">
        <Masthead />
        <Screen />
        <footer className="foot">
          Atlas Systems is fictional. Every number on these pages is computed by a deterministic monthly model from one JSON file; nothing is stored as a result.
          {' '}Built by <a href="https://bensunter.com/">Ben Sunter</a>. The pods-versus-pooled math comes from <a href="https://bensunter.com/pods-or-pooled.html">Half a Day of Nothing</a>.
        </footer>
      </div>
    </StoreProvider>
  );
}
