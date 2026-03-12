import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sdk } from "../../sdk";
import type {
  StripeConnectStatusResponse,
  StripeConnectAccountLinkBody,
} from "../../sdk/admin/admin-stripe-connect";

const QUERY_KEY = ["stripe-connect"];

export const useStripeConnectStatus = () => {
  return useQuery<StripeConnectStatusResponse>({
    queryKey: QUERY_KEY,
    queryFn: async () => sdk.admin.stripeConnect.getStatus(),
    placeholderData: (previousData) => previousData,
  });
};

export const useStripeConnectAccountLinkMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: StripeConnectAccountLinkBody = {}) =>
      sdk.admin.stripeConnect.createAccountLink(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
};

export const useStripeConnectDisconnectMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => sdk.admin.stripeConnect.deleteAccount(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
};
