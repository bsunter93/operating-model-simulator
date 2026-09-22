import { Masthead } from './components/Masthead';
import { Sandbox } from './views/Sandbox';
import { useEffect, useState } from 'react';
import { Answer } from './views/Answer';
import { Story } from './views/Story';
import { Mine } from './views/Mine';
import { Summary } from './views/Summary';
import { StoreProvider } from './state/store';

/* One place to operate from, and one place to check the numbers behind it.
   Landing on the full board meant arriving at eight teams, twelve
   months, eleven scenarios and five detail tabs before being told what any of it was for,
   which is the thing this page is supposed to demonstrate the opposite of. */
/**
 * The run used to be a second way in: its own opening questions, its own copy of the
 * year, its own decisions. Following it from inside a year threw that year away and
 * dropped the reader in a form. Old links still resolve, to the sandbox, which is now
 * the only place anything is operated from.
 */
function normalise(): void {
  if (/^#\/run/.test(window.location.hash)) {
    history.replaceState(null, '', window.location.hash.replace(/^#\/run/, '#/'));
  }
}

function useView() {
  normalise();
  const which = () => (/^#\/answer/.test(window.location.hash) ? 'answer'
    : /^#\/model|^#\/story/.test(window.location.hash) ? 'story'
    : /^#\/sandbox/.test(window.location.hash) ? 'sandbox'
    : /^#\/mine/.test(window.location.hash) ? 'mine'
    : /^#\/summary/.test(window.location.hash) ? 'summary'
    /* The sandbox is the front door. Three dials and a year somebody can scrub is five
       seconds to the first real thing; the run is three minutes before it pays anything
       back, which is the right second step and the wrong first one. */
    : 'sandbox');
  const [view, setView] = useState(which);
  useEffect(() => {
    const on = () => { normalise(); setView(which()); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return view;
}

function Screen({ view }: { view: string }) {
  return view === 'answer' ? <Answer /> : view === 'sandbox' ? <Sandbox /> : view === 'mine' ? <Mine /> : view === 'summary' ? <Summary /> : <Story />;
}

export default function App() {
  const view = useView();
  // The full model pins the shell to the viewport for its fixed stepper. The short
  // version is an ordinary document; inheriting that left it cut off at the fold with
  // nothing to scroll. The sandbox runs its own shell and asks for the same freedom.
  const scrolls = view === 'answer' || view === 'sandbox';
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
