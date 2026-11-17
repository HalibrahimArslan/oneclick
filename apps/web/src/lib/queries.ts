import type { BrandDto, BrandingDto, ConversationDetailDto, InboxDto, InviteDto, LabelDto, MediaAssetDto, MemberDto, Platform, PlatformAppDto, PostDto, SocialAccountDto } from '@oneclick/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ws } from './api';
import { useAuth } from './auth';

export type AccountRow = SocialAccountDto & { lastError: string | null };

const useWsKey = () => useAuth().workspace?.id ?? 'none';

export function useAccounts() {
  const w = useWsKey();
  return useQuery({ queryKey: ['accounts', w], queryFn: () => api<AccountRow[]>(ws('/accounts')) });
}

export function usePlatforms() {
  const w = useWsKey();
  return useQuery({
    queryKey: ['platforms', w],
    queryFn: () => api<{ platform: Platform; configured: boolean }[]>(ws('/platforms')),
    staleTime: 5 * 60_000,
  });
}

export function useBrands() {
  const w = useWsKey();
  return useQuery({ queryKey: ['brands', w], queryFn: () => api<BrandDto[]>(ws('/brands')) });
}

export function usePlatformApps() {
  const w = useWsKey();
  return useQuery({ queryKey: ['platform-apps', w], queryFn: () => api<PlatformAppDto[]>(ws('/platform-apps')) });
}

/** Giriş ekranı için: kayıt açık mı, demo modu var mı; ayrıca kurulumun markası (beyaz etiket) */
export function useAuthConfig() {
  return useQuery({
    queryKey: ['auth-config'],
    queryFn: () => api<{ registrationOpen: boolean; demoMode: boolean; demoTtlHours: number; branding: BrandingDto }>('/auth/config'),
    staleTime: 5 * 60_000,
  });
}

export function useMedia() {
  const w = useWsKey();
  return useQuery({ queryKey: ['media', w], queryFn: () => api<MediaAssetDto[]>(ws('/media')) });
}

export function usePosts(params: { from?: string; to?: string; status?: string }) {
  const w = useWsKey();
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return useQuery({
    queryKey: ['posts', w, qs],
    queryFn: () => api<PostDto[]>(ws(`/posts${qs ? `?${qs}` : ''}`)),
    // Yayın durumları worker tarafından güncellenir
    refetchInterval: 10_000,
  });
}

export function usePost(id: string | undefined) {
  const w = useWsKey();
  return useQuery({
    queryKey: ['post', w, id],
    queryFn: () => api<PostDto>(ws(`/posts/${id}`)),
    enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data && ['SCHEDULED', 'PUBLISHING'].includes(q.state.data.status) ? 5000 : false),
  });
}

/** Gönderi değişen her işlemden sonra listeleri tazeler. */
export function usePostAction<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['posts'] });
      qc.invalidateQueries({ queryKey: ['post'] });
    },
  });
}

export function useMembers() {
  const w = useWsKey();
  return useQuery({ queryKey: ['members', w], queryFn: () => api<MemberDto[]>(ws('/members')) });
}

/** Bekleyen davetler (yalnızca Yönetici/Sahip) */
export function useInvites(enabled: boolean) {
  const w = useWsKey();
  return useQuery({ queryKey: ['invites', w], queryFn: () => api<InviteDto[]>(ws('/invites')), enabled });
}

export interface InboxFilters {
  status: 'OPEN' | 'DONE';
  assignee?: 'me' | 'unassigned';
  accountId?: string;
  labelId?: string;
}

/** Gelen kutusu listesi; açık sayısı menü rozetinde de kullanılır, dakikada bir yenilenir */
export function useInbox(f: InboxFilters, enabled = true) {
  const w = useWsKey();
  return useQuery({
    queryKey: ['inbox', w, f],
    queryFn: () => {
      const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
      return api<InboxDto>(ws(`/inbox?${q}`));
    },
    refetchInterval: 60_000,
    enabled,
  });
}

export function useConversation(id: string | null) {
  const w = useWsKey();
  return useQuery({ queryKey: ['conversation', w, id], queryFn: () => api<ConversationDetailDto>(ws(`/inbox/${id}`)), enabled: Boolean(id) });
}

export function useLabels() {
  const w = useWsKey();
  return useQuery({ queryKey: ['labels', w], queryFn: () => api<LabelDto[]>(ws('/labels')) });
}
