import { useLoaderData, useParams } from 'react-router-dom';

import { TwoColumnPageSkeleton } from '~dashboard/components/common/skeleton';
import { TwoColumnPage } from '~dashboard/components/layout/pages';
import { useOrder, useOrderPreview } from '~dashboard/hooks/api/orders';
import { useExtension } from '~dashboard/providers/extension-provider';
import { ActiveOrderClaimSection } from '~dashboard/routes/orders/order-detail/components/active-order-claim-section';
import { ActiveOrderExchangeSection } from '~dashboard/routes/orders/order-detail/components/active-order-exchange-section';
import { ActiveOrderReturnSection } from '~dashboard/routes/orders/order-detail/components/active-order-return-section';
import { OrderActiveEditSection } from '~dashboard/routes/orders/order-detail/components/order-active-edit-section';
import { OrderActivitySection } from '~dashboard/routes/orders/order-detail/components/order-activity-section';
import { OrderCustomerSection } from '~dashboard/routes/orders/order-detail/components/order-customer-section';
import { OrderGeneralSection } from '~dashboard/routes/orders/order-detail/components/order-general-section';
import { OrderPaymentSection } from '~dashboard/routes/orders/order-detail/components/order-payment-section';
import { OrderSummarySection } from './order-summary-section';
import { DEFAULT_FIELDS } from '~dashboard/routes/orders/order-detail/constants';
import { orderLoader } from '~dashboard/routes/orders/order-detail/loader';

/**
 * Route lazy-loads `routes/orders/order-detail` as a single module; vite-plugin-unlock
 * resolves that entry to this file, so we must re-export Breadcrumb + loader like `index.ts` would.
 */
export { OrderDetailBreadcrumb as Breadcrumb } from '~dashboard/routes/orders/order-detail/breadcrumb';
export { orderLoader as loader };

export const OrderDetail = () => {
  const initialData = useLoaderData() as Awaited<ReturnType<typeof orderLoader>>;

  const { id } = useParams();
  const { getWidgets } = useExtension();

  const { order, isLoading, isError, error } = useOrder(
    id!,
    {
      fields: DEFAULT_FIELDS,
    },
    {
      initialData,
    },
  );

  if (order) {
    order.items = order.items.sort((itemA, itemB) => {
      if (itemA.created_at > itemB.created_at) {
        return 1;
      }

      if (itemA.created_at < itemB.created_at) {
        return -1;
      }

      return 0;
    });
  }

  const { order: orderPreview, isLoading: isPreviewLoading } = useOrderPreview(id!);

  if (isLoading || !order || isPreviewLoading) {
    return <TwoColumnPageSkeleton mainSections={4} sidebarSections={2} showJSON />;
  }

  if (isError) {
    throw error;
  }

  return (
    <TwoColumnPage
      widgets={{
        after: getWidgets('order.details.after'),
        before: getWidgets('order.details.before'),
        sideAfter: getWidgets('order.details.side.after'),
        sideBefore: getWidgets('order.details.side.before'),
      }}
      data={order}
      showJSON
      showMetadata
      hasOutlet
    >
      <TwoColumnPage.Main>
        <OrderActiveEditSection order={order} />
        <ActiveOrderClaimSection orderPreview={orderPreview!} />
        <ActiveOrderExchangeSection orderPreview={orderPreview!} />
        <ActiveOrderReturnSection orderPreview={orderPreview!} />
        <OrderGeneralSection order={order} />
        <OrderSummarySection order={order} />
        <OrderPaymentSection order={order} />
      </TwoColumnPage.Main>
      <TwoColumnPage.Sidebar>
        <OrderCustomerSection order={order} />
        <OrderActivitySection order={order} />
      </TwoColumnPage.Sidebar>
    </TwoColumnPage>
  );
};

export { OrderDetail as Component };
