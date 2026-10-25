import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sdk } from '../../sdk';
import type { Settings } from '../../lib/availability/slots';

const QUERY_KEY = ['availability'];

export const useAdminAvailability = () => useQuery({
  queryKey: QUERY_KEY,
  queryFn: () => sdk.admin.availability.get(),
});

export const useAdminSaveAvailabilityMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: Settings) => sdk.admin.availability.save(settings),
    onSuccess: (response) => {
      queryClient.setQueryData(QUERY_KEY, response);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
};
