import type { UserDto, WorkspaceDto } from '@oneclick/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, refreshAccessToken, setAccessToken, setSessionExpiredHandler, setWorkspaceId } from './api';

interface AuthState {
  status: 'loading' | 'anonymous' | 'authenticated';
  user: UserDto | null;
  workspaces: WorkspaceDto[];
  workspace: WorkspaceDto | null;
  selectWorkspace(id: string): void;
  login(email: string, password: string): Promise<void>;
  register(input: { name: string; email: string; password: string; workspaceName?: string }): Promise<void>;
  logout(): Promise<void>;
  reload(): Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);
const WS_KEY = 'oneclick.workspace';

const readStoredWs = () => {
  try {
    return localStorage.getItem(WS_KEY);
  } catch {
    return null;
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [user, setUser] = useState<UserDto | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceDto[]>([]);
  const [wsId, setWsId] = useState<string | null>(readStoredWs());

  const loadMe = useCallback(async () => {
    const me = await api<{ user: UserDto; workspaces: WorkspaceDto[] }>('/auth/me');
    setUser(me.user);
    setWorkspaces(me.workspaces);
    const chosen = me.workspaces.find((w) => w.id === readStoredWs()) ?? me.workspaces[0] ?? null;
    setWsId(chosen?.id ?? null);
    setWorkspaceId(chosen?.id ?? null);
    setStatus('authenticated');
  }, []);

  const clear = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setWorkspaces([]);
    setStatus('anonymous');
    qc.clear();
  }, [qc]);

  useEffect(() => {
    setSessionExpiredHandler(clear);
    (async () => {
      if (await refreshAccessToken()) {
        try {
          await loadMe();
          return;
        } catch {
          /* düş */
        }
      }
      setStatus('anonymous');
    })();
  }, [clear, loadMe]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      workspaces,
      workspace: workspaces.find((w) => w.id === wsId) ?? null,
      selectWorkspace(id) {
        setWsId(id);
        setWorkspaceId(id);
        try {
          localStorage.setItem(WS_KEY, id);
        } catch {
          /* yok say */
        }
        qc.clear();
      },
      async login(email, password) {
        const r = await api<{ accessToken: string }>('/auth/login', { body: { email, password } });
        setAccessToken(r.accessToken);
        await loadMe();
      },
      async register(input) {
        const r = await api<{ accessToken: string }>('/auth/register', { body: input });
        setAccessToken(r.accessToken);
        await loadMe();
      },
      async logout() {
        await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
        clear();
      },
      reload: loadMe,
    }),
    [status, user, workspaces, wsId, loadMe, clear, qc],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider eksik');
  return v;
}
