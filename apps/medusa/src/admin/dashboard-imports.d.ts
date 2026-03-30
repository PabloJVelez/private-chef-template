/**
 * Ambient modules for `~dashboard/*` imports in admin overrides.
 *
 * Vite + `@unlockable/vite-plugin-unlock` resolves these at build time; the main
 * `apps/medusa` tsconfig excludes overrides, so the IDE needs these declarations
 * to avoid TS2307 without typechecking all of `@medusajs/dashboard` (which fails
 * under NodeNext / virtual modules).
 *
 * When you add a new `~dashboard/…` import, add a matching `declare module` here.
 */

declare module '~dashboard/components/common/form' {
  import type {
    ControllerProps,
    FieldPath,
    FieldValues,
    FormProvider,
  } from 'react-hook-form';

  type FormField = <
    TFieldValues extends FieldValues = FieldValues,
    TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  >(
    props: ControllerProps<TFieldValues, TName>,
  ) => React.JSX.Element;

  type FormItem = React.ForwardRefExoticComponent<
    React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>
  >;
  type FormLabel = React.ForwardRefExoticComponent<
    React.ComponentPropsWithoutRef<'label'> & React.RefAttributes<HTMLLabelElement>
  >;
  type FormControl = React.ForwardRefExoticComponent<
    React.ComponentPropsWithoutRef<'div'> & React.RefAttributes<HTMLDivElement>
  >;
  type FormHint = React.ForwardRefExoticComponent<
    React.HTMLAttributes<HTMLParagraphElement> & React.RefAttributes<HTMLParagraphElement>
  >;
  type FormErrorMessage = React.ForwardRefExoticComponent<
    React.HTMLAttributes<HTMLParagraphElement> & React.RefAttributes<HTMLParagraphElement>
  >;

  export const Form: typeof FormProvider & {
    Field: FormField;
    Item: FormItem;
    Label: FormLabel;
    Control: FormControl;
    Hint: FormHint;
    ErrorMessage: FormErrorMessage;
  };
}

declare module '~dashboard/hooks/api' {
  import type { FetchError } from '@medusajs/js-sdk';
  import type { HttpTypes } from '@medusajs/types';
  import type { UseMutationOptions, UseMutationResult } from '@tanstack/react-query';

  export function useSignInWithEmailPass(
    options?: UseMutationOptions<
      string | { location: string },
      FetchError,
      HttpTypes.AdminSignUpWithEmailPassword
    >,
  ): UseMutationResult<
    string | { location: string },
    FetchError,
    HttpTypes.AdminSignUpWithEmailPassword
  >;
}

declare module '~dashboard/lib/is-fetch-error' {
  import type { FetchError } from '@medusajs/js-sdk';
  export function isFetchError(error: unknown): error is FetchError;
}

declare module '~dashboard/providers/extension-provider' {
  import type { ComponentType } from 'react';
  import type { InjectionZone } from '@medusajs/admin-shared';

  export function useExtension(): {
    getWidgets: (zone: InjectionZone) => ComponentType[];
    getMenu: (key: string) => Array<{
      label: string;
      to: string;
      icon?: ComponentType;
      items?: Array<{ label: string; to: string }>;
      nested?: string;
    }>;
  };
}

declare module '~dashboard/components/table/data-table/data-table' {
  import type { ColumnDef, Row, Table } from '@tanstack/react-table';

  interface Filter {
    key: string;
    label: string;
    type: string;
    options?: Array<{ label: string; value: string }>;
  }

  interface DataTableProps<TData> {
    table: Table<TData>;
    columns: ColumnDef<TData>[];
    pagination?: boolean;
    navigateTo?: (row: Row<TData>) => string;
    count?: number;
    search?: boolean | 'autofocus';
    orderBy?: Array<{ key: string; label: string }>;
    filters?: Filter[];
    prefix?: string;
    queryObject?: Record<string, unknown>;
    pageSize: number;
    isLoading?: boolean;
    noHeader?: boolean;
    layout?: 'fit' | 'fill';
    noRecords?: { title?: string; message?: string };
  }

  export function _DataTable<TData>(props: DataTableProps<TData>): React.JSX.Element;
}

declare module '~dashboard/hooks/api/orders' {
  import type { FetchError } from '@medusajs/js-sdk';
  import type { HttpTypes } from '@medusajs/types';
  import type { QueryKey, UseQueryOptions } from '@tanstack/react-query';

  export function useOrder(
    id: string,
    query?: Record<string, unknown> & { fields?: string },
    options?: Omit<UseQueryOptions<unknown, FetchError, unknown, QueryKey>, 'queryFn' | 'queryKey'>,
  ): {
    order?: HttpTypes.AdminOrder;
    isLoading: boolean;
    isError: boolean;
    error: FetchError | null;
    isPending: boolean;
    isFetching: boolean;
  };

  export function useOrders(
    query?: HttpTypes.AdminOrderFilters & { fields?: string },
    options?: Omit<
      UseQueryOptions<HttpTypes.AdminOrderListResponse, FetchError, HttpTypes.AdminOrderListResponse, QueryKey>,
      'queryFn' | 'queryKey'
    >,
  ): HttpTypes.AdminOrderListResponse & {
    isLoading: boolean;
    isError: boolean;
    error: FetchError | null;
  };
}

declare module '~dashboard/hooks/table/columns/use-order-table-columns' {
  import type { HttpTypes } from '@medusajs/types';
  import type { ColumnDef } from '@tanstack/react-table';

  export function useOrderTableColumns(props?: {
    exclude?: string[];
  }): ColumnDef<HttpTypes.AdminOrder>[];
}

declare module '~dashboard/hooks/table/filters/use-order-table-filters' {
  interface Filter {
    key: string;
    label: string;
    type: string;
    options?: Array<{ label: string; value: string }>;
  }

  export function useOrderTableFilters(): Filter[];
}

declare module '~dashboard/hooks/table/query/use-order-table-query' {
  import type { HttpTypes } from '@medusajs/types';

  export function useOrderTableQuery(props: {
    prefix?: string;
    pageSize?: number;
  }): {
    searchParams: HttpTypes.AdminOrderFilters;
    raw: Record<string, string>;
  };
}

declare module '~dashboard/hooks/use-data-table' {
  import type { ColumnDef, Row, RowSelectionState, OnChangeFn, Table } from '@tanstack/react-table';

  export function useDataTable<TData>(props: {
    data?: TData[];
    columns: ColumnDef<TData>[];
    count?: number;
    pageSize?: number;
    enablePagination?: boolean;
    enableRowSelection?: boolean | ((row: Row<TData>) => boolean);
    rowSelection?: {
      state: RowSelectionState;
      updater: OnChangeFn<RowSelectionState>;
    };
    enableExpandableRows?: boolean;
    getRowId?: (original: TData, index: number) => string;
    getSubRows?: (original: TData) => TData[];
    meta?: Record<string, unknown>;
    prefix?: string;
  }): { table: Table<TData> };
}

declare module '~dashboard/routes/orders/order-list/const' {
  export const DEFAULT_FIELDS: string;
}
