import type { TeamStatus } from '../models/results';

const LABEL: Record<TeamStatus, string> = { healthy: 'Within capacity', watch: 'Watch', constrained: 'Over capacity', severe: 'Over 100%' };

export function StatusPill({ status }: { status: TeamStatus }) {
  return <span className="pill" data-s={status}>{LABEL[status]}</span>;
}

export const statusLabel = (s: TeamStatus) => LABEL[s];
