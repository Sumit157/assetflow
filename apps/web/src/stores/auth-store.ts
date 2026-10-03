import type {
  AuthSessionResponse,
  MembershipPublic,
  MembershipSummary,
  MeResponse,
  OrganisationPublic,
  UserPublic,
} from '@assetflow/types';
import { create } from 'zustand';
import {
  apiGet,
  configureAuth,
  ensureSession,
  postLogin,
  postLogout,
  postRegister,
  postSwitchOrganisation,
  resetAuthClient,
} from '../lib/api';

export type AuthStatus = 'booting' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  user: UserPublic | null;
  organisation: OrganisationPublic | null;
  membership: MembershipPublic | null;
  memberships: MembershipSummary[];
  accessToken: string | null;
  boot(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  register(input: {
    name: string;
    email: string;
    password: string;
    organisationName: string;
  }): Promise<void>;
  logout(): Promise<void>;
  switchOrganisation(organisationId: string): Promise<void>;
  refreshMe(): Promise<void>;
  applySession(session: AuthSessionResponse): void;
  clear(): void;
}

const initialState = {
  status: 'booting' as AuthStatus,
  user: null,
  organisation: null,
  membership: null,
  memberships: [],
  accessToken: null,
};

let bootPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  ...initialState,

  async boot() {
    if (get().status !== 'booting') return;
    if (bootPromise) {
      await bootPromise;
      return;
    }
    bootPromise = (async () => {
      const session = await ensureSession();
      if (session) {
        get().applySession(session);
      } else {
        set({ status: 'anonymous' });
      }
    })().finally(() => {
      bootPromise = null;
    });
    await bootPromise;
  },

  async login(email, password) {
    const session = await postLogin({ email, password });
    get().applySession(session);
  },

  async register(input) {
    const session = await postRegister(input);
    get().applySession(session);
  },

  async logout() {
    try {
      await postLogout();
    } finally {
      get().clear();
    }
  },

  async switchOrganisation(organisationId) {
    const session = await postSwitchOrganisation(organisationId);
    get().applySession(session);
  },

  async refreshMe() {
    const me = await apiGet<MeResponse>('/auth/me');
    set({
      user: me.user,
      organisation: me.organisation,
      membership: me.membership,
      memberships: me.memberships,
    });
  },

  applySession(session) {
    set({
      status: 'authenticated',
      user: session.user,
      organisation: session.organisation,
      membership: session.membership,
      memberships: session.memberships,
      accessToken: session.accessToken,
    });
  },

  clear() {
    set({ ...initialState, status: 'anonymous' });
  },
}));

configureAuth({
  getAccessToken: () => useAuthStore.getState().accessToken,
  onSessionRefreshed: (session) => useAuthStore.getState().applySession(session),
  onAuthLost: () => {
    if (useAuthStore.getState().status !== 'booting') {
      useAuthStore.getState().clear();
    }
  },
});

export function resetAuthStore(): void {
  bootPromise = null;
  resetAuthClient();
  useAuthStore.setState({ ...initialState });
}
