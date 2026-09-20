import { Masthead } from './components/Masthead';
import { Sandbox } from './views/Sandbox';
import { useEffect, useState } from 'react';
import { Run } from './views/Run';
import { Answer } from './views/Answer';
import { Story } from './views/Story';
import { Mine } from './views/Mine';
import { Summary } from './views/Summary';
import { StoreProvider } from './state/store';

/* Default is the run. Landing on the full board meant arriving at eight teams, twelve
   months, eleven scenarios and five detail tabs before being told what any of it was for,
   which is the thing this page is supposed to demonstrate the opposite of. */
function useView() {
  const which = () => (/^#\/answer/.test(window.location.hash) ? 'answer'
    : /^#\/model|^#\/story/.test(window.location.hash) ? 'story'
    : /^#\/sandbox/.test(window.location.hash) ? 'sandbox'
    : /^#\/mine/.test(window.location.hash) ? 'mine'
    : /^#\/summary/.test(window.location.hash) ? 'summary'
    : 'run');
  const [view, setView] = useState(which);
  useEffect(() => {
    const on = () => setView(which());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return view;
}

function Screen({ view }: { view: string }) {
  return view === 'answer' ? <Answer /> : view === 'run' ? <Run /> : view === 'sandbox' ? <Sandbox /> : view === 'mine' ? <Mine /> : view === 'summary' ? <Summary /> : <Story />;
}

export default function App() {
  const view = useView();
  // The full model pins the shell to the viewport for its fixed stepper. The run and the
  // short version are ordinary documents; inheriting that left them cut off at the fold
  // with nothing to scroll.
  const scrolls = view === 'run' || view === 'answer' || view === 'sandbox';
  return (
    <StoreProvider>
      <div className={'app' + (scrolls ? ' app-scroll' : '')}>
        <Masthead view={view} />
        <Screen view={view} />
        <footer className="foot">
          Atlas Systems is fictional. This is an illustrative operating model, not a financial forecast. Every number on this page is computed by a deterministic monthly model from one JSON file; nothing is stored as a result.
          {' '}Built by <a href="https://bensunter.com/">Ben Sunter</a>. The pods-versus-pooled math comes from <a href="https://bensunter.com/pods-or-pooled.html">Half a Day of Nothing</a>. <a href="https://github.com/bsunter93/operating-model-simulator">Source on GitHub</a>.
        </footer>
      </div>
    </StoreProvider>
  );
}
