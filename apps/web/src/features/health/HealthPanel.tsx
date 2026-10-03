import type { DependencyStatus, HealthReady } from '@assetflow/types';
import { ApiClientError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useHealthLive, useHealthReady } from './api';

function StatusBadge({ status }: { status: HealthReady['status'] }) {
  const ready = status === 'ready';
  return (
    <span
      data-testid="status-badge"
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium',
        ready ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {ready ? 'Operational' : 'Degraded'}
    </span>
  );
}

function DependencyRow({ name, status }: { name: string; status: DependencyStatus }) {
  const up = status === 'up';
  return (
    <li className="flex items-center justify-between py-3">
      <span className="text-sm font-medium">{name}</span>
      <span className={cn('text-sm', up ? 'text-success' : 'text-danger')}>
        <span
          className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle"
          aria-hidden="true"
        />
        {up ? 'Operational' : 'Unavailable'}
      </span>
    </li>
  );
}

function PanelSkeleton() {
  return (
    <div
      data-testid="health-skeleton"
      aria-busy="true"
      aria-label="Loading system status"
      className="animate-pulse rounded-lg border border-border bg-surface p-6"
    >
      <div className="h-4 w-32 rounded bg-muted" />
      <div className="mt-4 h-3 w-48 rounded bg-muted" />
      <div className="mt-8 h-3 w-full rounded bg-muted" />
      <div className="mt-3 h-3 w-full rounded bg-muted" />
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  requestId?: string;
  onRetry: () => void;
}

function ErrorState({ message, requestId, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/40 bg-danger/5 p-6"
      data-testid="health-error"
    >
      <h2 className="text-sm font-semibold text-danger">Could not load system status</h2>
      <p className="mt-1 text-sm text-muted-fg">{message}</p>
      {requestId ? (
        <p className="mt-2 font-mono text-xs text-muted-fg">Request ID: {requestId}</p>
      ) : null}
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg transition-colors hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}

function formatUptime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function HealthPanel() {
  const live = useHealthLive();
  const ready = useHealthReady();

  const retry = () => {
    void live.refetch();
    void ready.refetch();
  };

  if (live.isLoading || ready.isLoading) {
    return <PanelSkeleton />;
  }

  const error = live.error ?? ready.error;
  if (error) {
    const message =
      error instanceof ApiClientError
        ? error.message
        : 'Something went wrong while loading system status.';
    const requestId = error instanceof ApiClientError ? error.requestId : undefined;
    return <ErrorState message={message} requestId={requestId} onRetry={retry} />;
  }

  if (!live.data || !ready.data) {
    return <PanelSkeleton />;
  }

  const { status, dependencies } = ready.data;

  return (
    <section
      aria-label="System status"
      className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold">API health</h2>
          <p className="mt-0.5 text-xs text-muted-fg">
            Live status of the AssetFlow API and its dependencies
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <dl className="grid gap-6 px-6 py-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-fg">Uptime</dt>
          <dd className="mt-1 text-sm font-semibold" data-testid="uptime">
            {formatUptime(live.data.uptimeSeconds)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-fg">
            Last checked
          </dt>
          <dd className="mt-1 text-sm font-semibold">
            {new Date(live.data.timestamp).toLocaleString()}
          </dd>
        </div>
      </dl>

      <ul className="divide-y divide-border border-t border-border px-6" data-testid="dependencies">
        <DependencyRow name="MongoDB" status={dependencies.mongo} />
        <DependencyRow name="Redis" status={dependencies.redis} />
      </ul>

      <div className="flex justify-end border-t border-border px-6 py-4">
        <button
          type="button"
          onClick={retry}
          disabled={live.isFetching || ready.isFetching}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60"
        >
          {live.isFetching || ready.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </section>
  );
}
