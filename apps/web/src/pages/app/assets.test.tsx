import type {
  AssetCategoryPublic,
  AssetHistory,
  AssetPublic,
  LocationPublic,
  MemberPublic,
  MembershipRole,
  Paginated,
} from '@assetflow/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetCategoriesPage } from './asset-categories-page';
import { AssetDetailPage } from './asset-detail-page';
import { AssetFormPage } from './asset-form-page';
import { AssetsPage } from './assets-page';
import { LocationsPage } from './locations-page';
import { resetAuthStore, useAuthStore } from '../../stores/auth-store';

const ISO = '2026-01-01T00:00:00.000Z';

const baseAsset: AssetPublic = {
  id: 'a1',
  organisationId: 'o1',
  name: 'Dell Latitude',
  assetTag: 'AST-0001',
  barcode: 'AST-0001',
  description: null,
  categoryId: 'c1',
  categoryName: 'Laptops',
  locationId: null,
  locationName: null,
  serialNumber: 'SN-123',
  condition: 'good',
  status: 'available',
  assignedToUserId: null,
  assignedToName: null,
  retiredAt: null,
  retirementReason: null,
  createdAt: ISO,
  updatedAt: ISO,
};

const members: MemberPublic[] = [
  {
    userId: 'u1',
    name: 'Ada',
    email: 'ada@example.test',
    emailVerified: true,
    role: 'ORG_ADMIN',
    joinedAt: ISO,
  },
  {
    userId: 'u2',
    name: 'Rex',
    email: 'rex@example.test',
    emailVerified: true,
    role: 'ASSET_MANAGER',
    joinedAt: ISO,
  },
];

const laptopCategory: AssetCategoryPublic = {
  id: 'c1',
  organisationId: 'o1',
  name: 'Laptops',
  description: 'Portable computers',
  assetCount: 3,
  createdAt: ISO,
  updatedAt: ISO,
};

const headOffice: LocationPublic = {
  id: 'l1',
  organisationId: 'o1',
  name: 'Head Office',
  code: 'HQ',
  assetCount: 5,
  createdAt: ISO,
  updatedAt: ISO,
};

function paginate(items: AssetPublic[]): Paginated<AssetPublic> {
  return { items, page: 1, limit: 20, total: items.length, totalPages: 1 };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

type FetchResult = { status?: number; body: unknown };

function stubFetch(handler: (url: string, method: string) => FetchResult) {
  const fetchMock = vi.fn(
    async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<ReturnType<typeof jsonResponse>> => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const result = handler(url, method);
      return jsonResponse(result.body, result.status ?? 200);
    },
  );
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  return fetchMock;
}

function authenticate(role: MembershipRole = 'ORG_ADMIN') {
  useAuthStore.setState({
    status: 'authenticated',
    user: {
      id: 'u1',
      name: 'Ada',
      email: 'ada@example.test',
      emailVerified: true,
      createdAt: ISO,
    },
    organisation: { id: 'o1', name: 'Org', createdAt: ISO },
    membership: { organisationId: 'o1', userId: 'u1', role, joinedAt: ISO },
    memberships: [{ organisationId: 'o1', organisationName: 'Org', role }],
    accessToken: 'token',
  });
}

const routeConfig = [
  { path: '/app/assets', element: <AssetsPage /> },
  { path: '/app/assets/new', element: <AssetFormPage /> },
  { path: '/app/assets/categories', element: <AssetCategoriesPage /> },
  { path: '/app/assets/locations', element: <LocationsPage /> },
  { path: '/app/assets/:assetId', element: <AssetDetailPage /> },
  { path: '/app/assets/:assetId/edit', element: <AssetFormPage /> },
];

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routeConfig, { initialEntries: [path] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

function findCall(
  fetchMock: ReturnType<typeof stubFetch>,
  matcher: (url: string, method: string) => boolean,
) {
  return fetchMock.mock.calls.find(([url, init]) => matcher(String(url), init?.method ?? 'GET'));
}

beforeEach(() => {
  resetAuthStore();
});

afterEach(() => {
  resetAuthStore();
  vi.unstubAllGlobals();
});

describe('AssetsPage', () => {
  it('lists assets with counts and a create action for admins', async () => {
    stubFetch((url) => {
      if (url.includes('/assets?')) return { body: { data: paginate([baseAsset]) } };
      if (url.includes('/asset-categories')) return { body: { data: [] } };
      if (url.includes('/locations')) return { body: { data: [] } };
      return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Not found' } } };
    });
    authenticate('ORG_ADMIN');

    renderAt('/app/assets');

    expect(await screen.findByText('Dell Latitude')).toBeInTheDocument();
    expect(screen.getAllByTestId('asset-row')).toHaveLength(1);
    expect(screen.getByText('1 asset')).toBeInTheDocument();
    expect(screen.getByTestId('new-asset')).toHaveAttribute('href', '/app/assets/new');
  });

  it('shows an empty state when nothing matches', async () => {
    stubFetch((url) => {
      if (url.includes('/assets?')) return { body: { data: paginate([]) } };
      if (url.includes('/asset-categories')) return { body: { data: [] } };
      if (url.includes('/locations')) return { body: { data: [] } };
      return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Not found' } } };
    });
    authenticate('ORG_ADMIN');

    renderAt('/app/assets');

    expect(await screen.findByTestId('assets-empty')).toBeInTheDocument();
  });

  it('hides the create action from viewers', async () => {
    stubFetch((url) => {
      if (url.includes('/assets?')) return { body: { data: paginate([baseAsset]) } };
      if (url.includes('/asset-categories')) return { body: { data: [] } };
      if (url.includes('/locations')) return { body: { data: [] } };
      return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Not found' } } };
    });
    authenticate('VIEWER');

    renderAt('/app/assets');

    expect(await screen.findByText('Dell Latitude')).toBeInTheDocument();
    expect(screen.queryByTestId('new-asset')).not.toBeInTheDocument();
  });

  it('surfaces load failures', async () => {
    stubFetch((url) => {
      if (url.includes('/assets?')) {
        return {
          status: 500,
          body: {
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Inventory exploded',
              requestId: 'r-1',
            },
          },
        };
      }
      return { body: { data: [] } };
    });
    authenticate('ORG_ADMIN');

    renderAt('/app/assets');

    expect(await screen.findByRole('alert')).toHaveTextContent('Inventory exploded');
  });
});

describe('AssetDetailPage', () => {
  function detailFetch(current: { asset: AssetPublic }, history: AssetHistory) {
    return stubFetch((url, method) => {
      if (method === 'POST' && url.endsWith('/assets/a1/assign')) {
        current.asset = {
          ...current.asset,
          status: 'assigned',
          assignedToUserId: 'u2',
          assignedToName: 'Rex',
        };
        return { body: { data: current.asset } };
      }
      if (method === 'POST' && url.endsWith('/assets/a1/return')) {
        current.asset = {
          ...current.asset,
          status: 'available',
          assignedToUserId: null,
          assignedToName: null,
          condition: 'poor',
        };
        return { body: { data: current.asset } };
      }
      if (method === 'DELETE' && url.endsWith('/assets/a1')) return { body: { data: null } };
      if (url.includes('/assets/a1/history')) return { body: { data: history } };
      if (url.endsWith('/assets/a1')) return { body: { data: current.asset } };
      if (url.includes('/organisations/o1/members')) return { body: { data: members } };
      if (url.includes('/asset-categories')) return { body: { data: [laptopCategory] } };
      if (url.includes('/locations')) return { body: { data: [headOffice] } };
      return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Not found' } } };
    });
  }

  const emptyHistory: AssetHistory = { assignments: [], transfers: [] };

  it('renders details, QR code and history', async () => {
    const history: AssetHistory = {
      assignments: [
        {
          id: 'as1',
          assetId: 'a1',
          assetName: 'Dell Latitude',
          assetTag: 'AST-0001',
          assignedToUserId: 'u2',
          assignedToName: 'Rex',
          assignedByName: 'Ada',
          assignedAt: '2026-02-01T10:00:00.000Z',
          returnedAt: null,
          returnedByName: null,
          returnCondition: null,
          notes: null,
        },
      ],
      transfers: [],
    };
    detailFetch({ asset: baseAsset }, history);
    authenticate('ORG_ADMIN');

    renderAt('/app/assets/a1');

    expect(await screen.findByRole('heading', { name: 'Dell Latitude' })).toBeInTheDocument();
    expect(screen.getByTestId('qr-section')).toBeInTheDocument();
    expect(screen.getByText('SN-123')).toBeInTheDocument();
    expect(await screen.findByTestId('history-list')).toBeInTheDocument();
    expect(screen.getByText('Assigned to Rex')).toBeInTheDocument();
  });

  it('assigns an available asset to a member', async () => {
    const state = { asset: { ...baseAsset } };
    const fetchMock = detailFetch(state, emptyHistory);
    authenticate('ORG_ADMIN');

    renderAt('/app/assets/a1');

    const form = await screen.findByTestId('assign-form');
    await screen.findByRole('option', { name: /Rex/ });
    await userEvent.selectOptions(form.querySelector('#assign-member')!, 'u2');
    await userEvent.click(screen.getByRole('button', { name: 'Assign asset' }));

    await waitFor(() => {
      const call = findCall(
        fetchMock,
        (url, method) => method === 'POST' && url.endsWith('/assets/a1/assign'),
      );
      expect(call).toBeDefined();
      const body = JSON.parse(String(call![1]?.body));
      expect(body).toEqual({ assignedToUserId: 'u2', notes: null });
    });
    await waitFor(() => {
      expect(screen.getByText('Assigned')).toBeInTheDocument();
    });
  });

  it('records a return with the new condition', async () => {
    const assignedAsset: AssetPublic = {
      ...baseAsset,
      status: 'assigned',
      assignedToUserId: 'u2',
      assignedToName: 'Rex',
    };
    const state = { asset: assignedAsset };
    const fetchMock = detailFetch(state, emptyHistory);
    authenticate('ORG_ADMIN');

    renderAt('/app/assets/a1');

    const form = await screen.findByTestId('return-form');
    await userEvent.selectOptions(form.querySelector('#return-condition')!, 'poor');
    await userEvent.click(screen.getByRole('button', { name: 'Record return' }));

    await waitFor(() => {
      const call = findCall(
        fetchMock,
        (url, method) => method === 'POST' && url.endsWith('/assets/a1/return'),
      );
      expect(call).toBeDefined();
      const body = JSON.parse(String(call![1]?.body));
      expect(body).toEqual({ condition: 'poor', notes: null });
    });
  });

  it('hides lifecycle actions from viewers', async () => {
    detailFetch({ asset: { ...baseAsset } }, emptyHistory);
    authenticate('VIEWER');

    renderAt('/app/assets/a1');

    expect(await screen.findByRole('heading', { name: 'Dell Latitude' })).toBeInTheDocument();
    expect(screen.queryByTestId('assign-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('retire-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('edit-asset')).not.toBeInTheDocument();
  });

  it('requires confirmation before deleting', async () => {
    const fetchMock = detailFetch({ asset: { ...baseAsset } }, emptyHistory);
    authenticate('ORG_ADMIN');

    const router = renderAt('/app/assets/a1');

    const deleteButton = await screen.findByTestId('delete-asset');
    await userEvent.click(deleteButton);
    expect(deleteButton).toHaveTextContent('Confirm delete?');

    await userEvent.click(deleteButton);

    await waitFor(() => {
      const call = findCall(
        fetchMock,
        (url, method) => method === 'DELETE' && url.endsWith('/assets/a1'),
      );
      expect(call).toBeDefined();
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/assets');
    });
  });
});

describe('AssetFormPage', () => {
  function formFetch() {
    return stubFetch((url, method) => {
      if (method === 'POST' && url.endsWith('/api/v1/assets')) {
        return {
          body: { data: { ...baseAsset, id: 'a9', name: 'MacBook Pro', assetTag: 'AST-9' } },
        };
      }
      if (url.includes('/asset-categories')) return { body: { data: [laptopCategory] } };
      if (url.includes('/locations')) return { body: { data: [headOffice] } };
      return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Not found' } } };
    });
  }

  it('validates required fields before calling the API', async () => {
    const fetchMock = formFetch();
    authenticate('ORG_ADMIN');

    renderAt('/app/assets/new');

    await userEvent.click(await screen.findByRole('button', { name: 'Create asset' }));

    expect(await screen.findByText('Enter a name for this asset.')).toBeInTheDocument();
    expect(screen.getByText('Enter an asset tag.')).toBeInTheDocument();
    const postCalls = fetchMock.mock.calls.filter(
      ([url, init]) => init?.method === 'POST' && String(url).endsWith('/api/v1/assets'),
    );
    expect(postCalls).toHaveLength(0);
  });

  it('creates an asset and navigates to its detail page', async () => {
    formFetch();
    authenticate('ORG_ADMIN');

    const router = renderAt('/app/assets/new');

    await userEvent.type(await screen.findByLabelText('Name'), 'MacBook Pro');
    await userEvent.type(screen.getByLabelText('Asset tag'), 'AST-9');
    await userEvent.click(screen.getByRole('button', { name: 'Create asset' }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/app/assets/a9');
    });
  });
});

describe('AssetCategoriesPage', () => {
  it('lists categories with asset counts', async () => {
    stubFetch((url) => {
      if (url.includes('/asset-categories')) return { body: { data: [laptopCategory] } };
      return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Not found' } } };
    });
    authenticate('ORG_ADMIN');

    renderAt('/app/assets/categories');

    expect(await screen.findByText('Laptops')).toBeInTheDocument();
    expect(screen.getByText(/Portable computers · 3 assets/)).toBeInTheDocument();
  });

  it('creates a category', async () => {
    const fetchMock = stubFetch((url, method) => {
      if (method === 'POST' && url.endsWith('/api/v1/asset-categories')) {
        return { body: { data: { ...laptopCategory, id: 'c2', name: 'Monitors' } } };
      }
      if (url.includes('/asset-categories')) return { body: { data: [laptopCategory] } };
      return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Not found' } } };
    });
    authenticate('ORG_ADMIN');

    renderAt('/app/assets/categories');

    await userEvent.click(await screen.findByTestId('new-category'));
    await userEvent.type(screen.getByLabelText('Name'), 'Monitors');
    await userEvent.click(screen.getByRole('button', { name: 'Add category' }));

    await waitFor(() => {
      const call = findCall(
        fetchMock,
        (url, method) => method === 'POST' && url.endsWith('/api/v1/asset-categories'),
      );
      expect(call).toBeDefined();
      expect(JSON.parse(String(call![1]?.body))).toEqual({
        name: 'Monitors',
        description: null,
      });
    });
  });
});

describe('LocationsPage', () => {
  it('lists locations and creates one', async () => {
    const fetchMock = stubFetch((url, method) => {
      if (method === 'POST' && url.endsWith('/api/v1/locations')) {
        return { body: { data: { ...headOffice, id: 'l2', name: 'Warehouse' } } };
      }
      if (url.includes('/locations')) return { body: { data: [headOffice] } };
      return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Not found' } } };
    });
    authenticate('ORG_ADMIN');

    renderAt('/app/assets/locations');

    expect(await screen.findByText('Head Office')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('new-location'));
    await userEvent.type(screen.getByLabelText('Name'), 'Warehouse');
    await userEvent.click(screen.getByRole('button', { name: 'Add location' }));

    await waitFor(() => {
      const call = findCall(
        fetchMock,
        (url, method) => method === 'POST' && url.endsWith('/api/v1/locations'),
      );
      expect(call).toBeDefined();
      expect(JSON.parse(String(call![1]?.body))).toEqual({ name: 'Warehouse', code: null });
    });
  });
});
