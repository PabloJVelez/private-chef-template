import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sdk } from '../../sdk';
import type {
  AdminCreateSocialGalleryPostDTO,
  AdminCreateSocialImportDTO,
  AdminSocialGalleryImportsResponse,
  AdminSocialGalleryPostDTO,
  AdminSocialGalleryPostsResponse,
  AdminUpdateSocialGalleryPostDTO,
} from '../../sdk/admin/admin-social-gallery-posts';

const QUERY_KEY = ['social-gallery-posts'];
const IMPORTS_QUERY_KEY = ['social-gallery-imports'];

export const useAdminListSocialGalleryPosts = (query: Record<string, any> = {}) => {
  return useQuery<AdminSocialGalleryPostsResponse>({
    queryKey: [...QUERY_KEY, query],
    placeholderData: (previousData) => previousData,
    queryFn: async () => sdk.admin.socialGalleryPosts.list(query),
  });
};

export const useAdminRetrieveSocialGalleryPost = (id: string, options?: { enabled?: boolean }) => {
  return useQuery<AdminSocialGalleryPostDTO>({
    queryKey: [...QUERY_KEY, id],
    enabled: options?.enabled !== false && !!id,
    queryFn: async () => sdk.admin.socialGalleryPosts.retrieve(id),
  });
};

export const useAdminCreateSocialGalleryPostMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: AdminCreateSocialGalleryPostDTO) => sdk.admin.socialGalleryPosts.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
};

export const useAdminUpdateSocialGalleryPostMutation = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: AdminUpdateSocialGalleryPostDTO) => sdk.admin.socialGalleryPosts.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, id] });
    },
  });
};

export const useAdminDeleteSocialGalleryPostMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => sdk.admin.socialGalleryPosts.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
};

export const useAdminListSocialGalleryImports = (
  query: Record<string, any> = {},
  options: { refetchInterval?: number | false } = {},
) => {
  const client = useQueryClient();
  const lastTerminal = useRef('');
  const result = useQuery<AdminSocialGalleryImportsResponse>({
    queryKey: [...IMPORTS_QUERY_KEY, query],
    placeholderData: (previousData) => previousData,
    queryFn: async () => sdk.admin.socialGalleryImports.list(query),
    refetchInterval: (query) =>
      query.state.data?.social_import_jobs.some((job) => ['queued', 'running'].includes(job.status))
        ? (options.refetchInterval ?? 3000)
        : false,
  });
  const terminal =
    result.data?.social_import_jobs
      .filter((job) => ['completed', 'failed'].includes(job.status))
      .map((job) => `${job.id}:${job.status}:${job.updated_at}`)
      .join('|') || '';
  useEffect(() => {
    if (terminal && terminal !== lastTerminal.current) {
      lastTerminal.current = terminal;
      void client.invalidateQueries({ queryKey: QUERY_KEY });
    }
  }, [client, terminal]);
  return result;
};

export const useAdminCreateSocialGalleryImportMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: AdminCreateSocialImportDTO) => sdk.admin.socialGalleryImports.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: IMPORTS_QUERY_KEY });
    },
  });
};

export const useAdminRetrySocialGalleryImport = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sdk.admin.socialGalleryImports.retry(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: IMPORTS_QUERY_KEY });
    },
  });
};
