import { Masthead } from './components/Masthead';
import { useEffect, useState } from 'react';
import { Story } from './views/Story';
import { Mine } from './views/Mine';
import { Summary } from './views/Summary';
import { StoreProvider } from './state/store';

function Screen() {
  const which = () => (/^#\/mine/.test(window.location.hash) ? 'mine' : /^#\/summary/.test(window.location.hash) ? 'summary' : 'story');
  const [view, setView] = useState(which);
  useEffect(() => { const on = () => setView(which()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  return view === 'mine' ? <Mine /> : view === 'summary' ? <Summary /> : <Story />;
}

export default function App() {
  return (
    <StoreProvider>
      <div className="app">
        <Masthead />
        <Screen />
        <footer className="foot">
          Atlas Systems is fictional. This is an illustrative operating model, not a financial forecast. Every number on this page is computed by a deterministic monthly model from one JSON file; nothing is stored as a result.
          {' '}Built by <a href="https://bensunter.com/">Ben Sunter</a>. The pods-versus-pooled math comes from <a href="https://bensunter.com/pods-or-pooled.html">Half a Day of Nothing</a>. <a href="https://github.com/bsunter93/operating-model-simulator">Source on GitHub</a>.
        </footer>
      </div>
    </StoreProvider>
  );
}
