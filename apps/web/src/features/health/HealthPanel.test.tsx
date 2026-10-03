import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthPanel } from './HealthPanel';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

const livePayload = {
  data: { status: 'ok', timestamp: '2026-10-02T10:00:00.000Z', uptimeSeconds: 42 },
};

const readyPayload = {
  data: { status: 'ready', dependencies: { mongo: 'up', redis: 'up' } },
};

const degradedPayload = {
  data: { status: 'degraded', dependencies: { mongo: 'up', redis: 'down' } },
};

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HealthPanel />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HealthPanel', () => {
  it('shows a loading skeleton until health data arrives', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );

    renderPanel();

    expect(screen.getByTestId('health-skeleton')).toBeInTheDocument();
  });

  it('renders operational status, uptime and dependencies when healthy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: unknown) => {
        const target = String(url);
        if (target.includes('/health/ready')) {
          return Promise.resolve(jsonResponse(readyPayload));
        }
        return Promise.resolve(jsonResponse(livePayload));
      }),
    );

    renderPanel();

    expect(await screen.findByTestId('status-badge')).toHaveTextContent('Operational');
    expect(screen.getByTestId('uptime')).toHaveTextContent('42s');
    const dependencies = screen.getByTestId('dependencies');
    expect(within(dependencies).getByText('MongoDB')).toBeInTheDocument();
    expect(within(dependencies).getByText('Redis')).toBeInTheDocument();
    expect(within(dependencies).getAllByText('Operational')).toHaveLength(2);
  });

  it('renders a degraded state when a dependency is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: unknown) => {
        const target = String(url);
        if (target.includes('/health/ready')) {
          return Promise.resolve(jsonResponse(degradedPayload));
        }
        return Promise.resolve(jsonResponse(livePayload));
      }),
    );

    renderPanel();

    expect(await screen.findByTestId('status-badge')).toHaveTextContent('Degraded');
    const dependencies = screen.getByTestId('dependencies');
    expect(within(dependencies).getByText('Redis')).toBeInTheDocument();
    expect(within(dependencies).getByText('Unavailable')).toBeInTheDocument();
  });

  it('shows a recoverable error state and refetches on retry', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: unknown) => {
        calls += 1;
        if (calls <= 2) {
          return Promise.reject(new Error('network down'));
        }
        const target = String(url);
        if (target.includes('/health/ready')) {
          return Promise.resolve(jsonResponse(readyPayload));
        }
        return Promise.resolve(jsonResponse(livePayload));
      }),
    );

    renderPanel();

    const alert = await screen.findByTestId('health-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('Could not reach the API');

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.getByTestId('status-badge')).toHaveTextContent('Operational');
    });
    expect(calls).toBe(4);
  });
});
