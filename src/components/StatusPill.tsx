import type { TeamStatus } from '../models/results';

const LABEL: Record<TeamStatus, string> = { healthy: 'Healthy', watch: 'Watch', constrained: 'Constrained', severe: 'Severe' };

export function StatusPill({ status }: { status: TeamStatus }) {
  return <span className="pill" data-s={status}>{LABEL[status]}</span>;
}

export const statusLabel = (s: TeamStatus) => LABEL[s];
