import type { ReactNode } from 'react';
import { GLOSSARY } from '../lib/glossary';
import type { TermKey } from '../lib/glossary';

/** A word with a plain-language definition on hover or focus. */
export function Term({ k, children }: { k: TermKey; children: ReactNode }) {
  return (
    <span className="term" tabIndex={0} data-tip={GLOSSARY[k]}>
      {children}
    </span>
  );
}
