import type { MediaAssetDto, Platform, PostDto, SocialAccountDto } from '@oneclick/shared';
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
