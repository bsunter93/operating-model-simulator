import { useEffect } from 'react';
import { Masthead } from './components/Masthead';
import { Tour } from './components/Tour';
import { Drawer } from './components/Drawer';
import { Home } from './views/Home';
import { StoreProvider, migrateLegacyHash, scrollToSection, useStore } from './state/store';

/** Turns `?go=sec-x&team=y` links into a scroll and a team selection, then strips them. */
function GoHandler() {
  const { model, dispatch } = useStore();
  useEffect(() => {
    migrateLegacyHash(model);
    const on = () => {
      const q = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
      const go = q.get('go'), team = q.get('team');
      if (!go && !team) return;
      if (team && model.teams.some((t) => t.id === team)) dispatch({ type: 'team', id: team });
      q.delete('go'); q.delete('team');
      const s = q.toString();
      history.replaceState(null, '', '#/' + (s ? '?' + s : ''));
      if (go) setTimeout(() => scrollToSection(go), 30);
    };
    on();
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [model, dispatch]);
  return null;
}

export default function App() {
  return (
    <StoreProvider>
      <div className="app">
        <Masthead />
        <GoHandler />
        <Home />
        <Drawer />
        <Tour />
        <footer className="foot">
          Atlas Systems is fictional. This is an illustrative operating model, not a financial forecast. Every number on these pages is computed by a deterministic monthly model from one JSON file; nothing is stored as a result. <a href="#/?p=about">How it works</a>.
          {' '}Built by <a href="https://bensunter.com/">Ben Sunter</a>. The pods-versus-pooled math comes from <a href="https://bensunter.com/pods-or-pooled.html">Half a Day of Nothing</a>. <a href="https://github.com/bsunter93/operating-model-simulator">Source on GitHub</a>.
        </footer>
      </div>
    </StoreProvider>
  );
}
