import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sdk } from '../../sdk'
import type { 
  AdminListChefEventsQuery, 
  AdminCreateChefEventDTO, 
  AdminUpdateChefEventDTO,
  AdminChefEventDTO,
  AdminChefEventsResponse,
  AdminAcceptChefEventDTO,
  AdminRejectChefEventDTO,
  AdminResendEventEmailDTO,
  AdminSendReceiptDTO,
} from '../../sdk/admin/admin-chef-events'

const QUERY_KEY = ['chef-events']

export const useAdminListChefEvents = (query: AdminListChefEventsQuery = {}) => {
  return useQuery<AdminChefEventsResponse>({
    queryKey: [...QUERY_KEY, query],
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      return sdk.admin.chefEvents.list(query)
    },
  })
}

export const useAdminRetrieveChefEvent = (id: string, options?: { enabled?: boolean }) => {
  return useQuery<AdminChefEventDTO>({
    queryKey: [...QUERY_KEY, id],
    enabled: options?.enabled !== false && !!id,
    queryFn: async () => {
      return sdk.admin.chefEvents.retrieve(id)
    },
  })
}

export const useAdminCreateChefEventMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: AdminCreateChefEventDTO) => {
      return await sdk.admin.chefEvents.create(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

export const useAdminUpdateChefEventMutation = (id: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: AdminUpdateChefEventDTO) => {
      return await sdk.admin.chefEvents.update(id, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, id] })
    },
  })
}

export const useAdminDeleteChefEventMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      return await sdk.admin.chefEvents.delete(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

export const useAdminAcceptChefEventMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data?: AdminAcceptChefEventDTO }) => {
      return await sdk.admin.chefEvents.accept(id, data || {})
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, variables.id] })
    },
  })
}

export const useAdminRejectChefEventMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: AdminRejectChefEventDTO }) => {
      return await sdk.admin.chefEvents.reject(id, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

/**
 * Hook for resending event emails
 */
export const useAdminResendEventEmailMutation = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ chefEventId, ...data }: { chefEventId: string } & AdminResendEventEmailDTO) => {
      return await sdk.admin.chefEvents.resendEmail(chefEventId, data)
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, variables.chefEventId] })
    },
  })
}

export const useAdminSendReceiptMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      chefEventId,
      ...data
    }: { chefEventId: string } & AdminSendReceiptDTO) => {
      return await sdk.admin.chefEvents.sendReceipt(chefEventId, data)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, variables.chefEventId] })
    },
  })
}

export const useAdminDeriveChefEventMenuMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (chefEventId: string) => {
      return await sdk.admin.chefEvents.deriveMenu(chefEventId)
    },
    onSuccess: (_data, chefEventId) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, chefEventId] })
      queryClient.invalidateQueries({ queryKey: ["menus"] })
    },
  })
}

export const useAdminRevertChefEventMenuMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      chefEventId,
      deleteDerivedMenu = false,
    }: {
      chefEventId: string
      deleteDerivedMenu?: boolean
    }) => {
      return await sdk.admin.chefEvents.revertMenu(chefEventId, { deleteDerivedMenu })
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, variables.chefEventId] })
      queryClient.invalidateQueries({ queryKey: ["menus"] })
    },
  })
}

export const useAdminGetMenuProducts = () => {
  return useQuery({
    queryKey: [...QUERY_KEY, 'menu-products'],
    queryFn: async () => {
      return sdk.admin.chefEvents.getMenuProducts()
    },
  })
} 