import { useEffect } from 'react';
import { openPanel, usePanel } from '../state/store';
import { Why } from '../views/Why';
import { Portfolio } from '../views/Portfolio';
import { Workforce } from '../views/Workforce';
import { Cost } from '../views/Cost';
import { Organization } from '../views/Organization';
import { ModelView } from '../views/ModelView';
import { About } from '../views/About';

/** Detail over the page. The page and its state stay behind it. */
export function Drawer() {
  const panel = usePanel();
  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') openPanel(null); };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('drawer-open');
    return () => { window.removeEventListener('keydown', onKey); document.body.classList.remove('drawer-open'); };
  }, [panel]);
  if (!panel) return null;
  const body = panel.kind === 'team' ? <Why teamId={panel.teamId} />
    : panel.kind === 'initiatives' ? <Portfolio />
    : panel.kind === 'workforce' ? <Workforce />
    : panel.kind === 'cost' ? <Cost />
    : panel.kind === 'organization' ? <Organization />
    : panel.kind === 'plan' ? <ModelView />
    : <About />;
  return (
    <>
      <div className="drawer-back" onClick={() => openPanel(null)} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Detail">
        <button className="drawer-close" onClick={() => openPanel(null)} aria-label="Close">× Close</button>
        <div className="drawer-body">{body}</div>
      </aside>
    </>
  );
}
