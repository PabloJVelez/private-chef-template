import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sdk } from '../../sdk';
import type {
  AdminCreateExperienceTypeDTO,
  AdminExperienceTypeDTO,
  AdminExperienceTypesResponse,
  AdminUpdateExperienceTypeDTO,
} from '../../sdk/admin/admin-experience-types';

const QUERY_KEY = ['experience-types'];

export const useAdminListExperienceTypes = (query: Record<string, any> = {}) => {
  return useQuery<AdminExperienceTypesResponse>({
    queryKey: [...QUERY_KEY, query],
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      return sdk.admin.experienceTypes.list(query);
    },
  });
};

export const useAdminRetrieveExperienceType = (id: string, options?: { enabled?: boolean }) => {
  return useQuery<AdminExperienceTypeDTO>({
    queryKey: [...QUERY_KEY, id],
    enabled: options?.enabled !== false && !!id,
    queryFn: async () => {
      return sdk.admin.experienceTypes.retrieve(id);
    },
  });
};

export const useAdminCreateExperienceTypeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: AdminCreateExperienceTypeDTO) => {
      return await sdk.admin.experienceTypes.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
};

export const useAdminUpdateExperienceTypeMutation = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: AdminUpdateExperienceTypeDTO) => {
      return await sdk.admin.experienceTypes.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, id] });
    },
  });
};

export const useAdminDeleteExperienceTypeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return await sdk.admin.experienceTypes.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
};
