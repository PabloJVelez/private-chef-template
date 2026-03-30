import { Container, Heading } from '@medusajs/ui';
import { HttpTypes } from '@medusajs/types';
import { keepPreviousData } from '@tanstack/react-query';
import { ColumnDef, type Row } from '@tanstack/react-table';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { _DataTable } from '~dashboard/components/table/data-table/data-table';
import { useOrders } from '~dashboard/hooks/api/orders';
import { useOrderTableColumns } from '~dashboard/hooks/table/columns/use-order-table-columns';
import { useOrderTableFilters } from '~dashboard/hooks/table/filters/use-order-table-filters';
import { useOrderTableQuery } from '~dashboard/hooks/table/query/use-order-table-query';
import { useDataTable } from '~dashboard/hooks/use-data-table';

import { DEFAULT_FIELDS } from '~dashboard/routes/orders/order-list/const';

import { isEventTicketSku } from '../../lib/event-ticket';

const PAGE_SIZE = 20;

/** List orders with line items so we can show chef-event ticket product titles. */
const ORDER_LIST_FIELDS = `${DEFAULT_FIELDS},*items`;

const EventColumnHeader = () => (
  <div className="flex h-full w-full items-center">
    <span className="truncate">Event</span>
  </div>
);

function eventLabelFromOrder(order: HttpTypes.AdminOrder): string | null {
  const items = order.items ?? [];
  const ticketLine = items.find((item) => isEventTicketSku(item.variant_sku));
  if (!ticketLine) return null;
  return (
    ticketLine.product_title?.trim() ||
    ticketLine.title?.trim() ||
    null
  );
}

export const OrderListTable = () => {
  const { t } = useTranslation();
  const { searchParams, raw } = useOrderTableQuery({
    pageSize: PAGE_SIZE,
  });

  const { orders, count, isError, error, isLoading } = useOrders(
    {
      fields: ORDER_LIST_FIELDS,
      ...searchParams,
    },
    {
      placeholderData: keepPreviousData,
    }
  );

  const filters = useOrderTableFilters();
  const baseColumns = useOrderTableColumns({ exclude: ['sales_channel'] });

  const columns = useMemo(() => {
    return baseColumns.map((col: ColumnDef<HttpTypes.AdminOrder>) => {
      if (
        'accessorKey' in col &&
        col.accessorKey === 'fulfillment_status'
      ) {
        return {
          id: 'chef_event',
          header: EventColumnHeader,
          cell: ({ row }: { row: Row<HttpTypes.AdminOrder> }) => {
            const label = eventLabelFromOrder(row.original);
            return (
              <span className="text-ui-fg-subtle txt-compact-small truncate">
                {label ?? '—'}
              </span>
            );
          },
        } as ColumnDef<HttpTypes.AdminOrder>;
      }
      return col;
    });
  }, [baseColumns]);

  const { table } = useDataTable({
    data: orders ?? [],
    columns,
    enablePagination: true,
    count,
    pageSize: PAGE_SIZE,
  });

  if (isError) {
    throw error;
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading>{t('orders.domain')}</Heading>
      </div>
      <_DataTable
        columns={columns}
        table={table}
        pagination
        navigateTo={(row: Row<HttpTypes.AdminOrder>) =>
          `/orders/${row.original.id}`}
        filters={filters}
        count={count}
        search
        isLoading={isLoading}
        pageSize={PAGE_SIZE}
        orderBy={[
          { key: 'display_id', label: t('orders.fields.displayId') },
          { key: 'created_at', label: t('fields.createdAt') },
          { key: 'updated_at', label: t('fields.updatedAt') },
        ]}
        queryObject={raw}
        noRecords={{
          message: t('orders.list.noRecordsMessage'),
        }}
      />
    </Container>
  );
};

export default OrderListTable;
