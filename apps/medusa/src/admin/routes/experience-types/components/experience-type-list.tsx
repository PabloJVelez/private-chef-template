import { useAdminDeleteExperienceTypeMutation, useAdminListExperienceTypes } from '../../../hooks/experience-types';
import { DataTable, createDataTableColumnHelper, useDataTable, Button, Badge, toast } from '@medusajs/ui';
import { useState } from 'react';
import type { AdminExperienceTypeDTO } from '../../../../sdk/admin/admin-experience-types';

const columnHelper = createDataTableColumnHelper<AdminExperienceTypeDTO>();

interface ExperienceTypeListProps {
  onCreate: () => void;
}

export const ExperienceTypeList = ({ onCreate }: ExperienceTypeListProps) => {
  const [query, setQuery] = useState({ limit: 20, offset: 0, q: '' });
  const { data, isLoading } = useAdminListExperienceTypes(query);
  const deleteExperienceType = useAdminDeleteExperienceTypeMutation();

  const columns = [
    columnHelper.accessor('name', {
      header: 'Name',
      cell: ({ row }) => (
        <button
          onClick={() => (window.location.href = `/app/experience-types/${row.original.id}`)}
          className="hover:underline text-blue-600 text-left"
        >
          {row.original.name}
        </button>
      ),
    }),
    columnHelper.accessor('slug', {
      header: 'Slug',
      cell: ({ row }) => row.original.slug,
    }),
    columnHelper.accessor('workflow_event_type', {
      header: 'Workflow Type',
      cell: ({ row }) => {
        const labels: Record<string, string> = {
          cooking_class: 'Cooking Class',
          plated_dinner: 'Plated Dinner',
          buffet_style: 'Buffet Style',
        };
        return labels[row.original.workflow_event_type] ?? row.original.workflow_event_type;
      },
    }),
    columnHelper.accessor('location_type', {
      header: 'Location',
      cell: ({ row }) => (row.original.location_type === 'customer' ? 'Customer' : 'Fixed'),
    }),
    columnHelper.accessor('is_active', {
      header: 'Status',
      cell: ({ row }) => (
        <Badge color={row.original.is_active ? 'green' : 'red'}>{row.original.is_active ? 'Active' : 'Inactive'}</Badge>
      ),
    }),
    columnHelper.accessor('is_featured', {
      header: 'Featured',
      cell: ({ row }) => (row.original.is_featured ? <Badge color="blue">Featured</Badge> : <span>-</span>),
    }),
    columnHelper.accessor('sort_order', {
      header: 'Sort',
      cell: ({ row }) => row.original.sort_order ?? 0,
    }),
    columnHelper.action({
      actions: ({ row }) => [
        {
          icon: 'PencilSquare',
          label: 'Edit',
          onClick: () => (window.location.href = `/app/experience-types/${row.original.id}`),
        },
        {
          icon: 'Trash',
          label: 'Delete',
          onClick: () => {
            if (confirm(`Delete "${row.original.name}"? This cannot be undone.`)) {
              deleteExperienceType.mutate(row.original.id, {
                onSuccess: () => {
                  toast.success('Experience type deleted', {
                    description: `"${row.original.name}" was deleted.`,
                    duration: 3000,
                  });
                },
                onError: (error) => {
                  console.error('Error deleting experience type:', error);
                  toast.error('Delete failed', {
                    description: 'Could not delete experience type. Please try again.',
                    duration: 5000,
                  });
                },
              });
            }
          },
        },
      ],
    }),
  ];

  const table = useDataTable({
    columns,
    data: data?.experience_types || [],
    getRowId: (row) => row.id,
    rowCount: data?.experience_types?.length ?? 0,
    isLoading,
    search: {
      state: query.q,
      onSearchChange: (q) => setQuery({ ...query, q, offset: 0 }),
    },
    pagination: {
      state: {
        pageIndex: Math.floor(query.offset / query.limit),
        pageSize: query.limit,
      },
      onPaginationChange: (pagination) => {
        setQuery({
          ...query,
          offset: pagination.pageIndex * pagination.pageSize,
          limit: pagination.pageSize,
        });
      },
    },
  });

  return (
    <DataTable instance={table}>
      <DataTable.Toolbar>
        <DataTable.Search placeholder="Search experience types..." />
        <Button variant="primary" size="base" onClick={onCreate} className="ml-auto">
          Create
        </Button>
      </DataTable.Toolbar>

      <DataTable.Table />
      <DataTable.Pagination />
    </DataTable>
  );
};
