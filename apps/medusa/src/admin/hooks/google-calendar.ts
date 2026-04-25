import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sdk } from "../../sdk";
import type { GoogleCalendarStatusResponse } from "../../sdk/admin/admin-google-calendar";

const QUERY_KEY = ["google-calendar"];

export const useGoogleCalendarStatus = () => {
  return useQuery<GoogleCalendarStatusResponse>({
    queryKey: QUERY_KEY,
    queryFn: async () => sdk.admin.googleCalendar.getStatus(),
    placeholderData: (previousData) => previousData,
  });
};

export const useGoogleCalendarConnectMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => sdk.admin.googleCalendar.connect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
};

export const useGoogleCalendarDisconnectMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => sdk.admin.googleCalendar.disconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
};

export const useGoogleCalendarResyncMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => sdk.admin.googleCalendar.resync(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
};
