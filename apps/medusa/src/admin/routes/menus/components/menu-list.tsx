import { useAdminListMenus, useAdminDeleteMenuMutation } from "../../../hooks/menus"
import { DataTable, createDataTableColumnHelper, useDataTable, Button, toast } from "@medusajs/ui"
import { useState } from "react"
import type { AdminMenuDTO } from "../../../../sdk/admin/admin-menus"

const columnHelper = createDataTableColumnHelper<AdminMenuDTO>()

interface MenuListProps {
  onCreateMenu: () => void
}

export const MenuList = ({ onCreateMenu }: MenuListProps) => {
  const [query, setQuery] = useState({ limit: 10, offset: 0, q: "" })
  const { data, isLoading, error } = useAdminListMenus(query)
  const deleteMenu = useAdminDeleteMenuMutation()

  const columns = [
    columnHelper.accessor("name", {
      header: "Name",
      cell: ({ row }) => (
        <button
          onClick={() => (window.location.href = `/app/menus/${row.original.id}`)}
          className="hover:underline text-blue-600 text-left"
        >
          {row.original.name}
        </button>
      ),
    }),
    columnHelper.accessor("courses", {
      header: "Courses",
      cell: ({ row }) => row.original.courses?.length || 0,
    }),
    columnHelper.accessor("created_at", {
      header: "Created At",
      cell: ({ row }) => new Date(row.original.created_at).toLocaleDateString(),
    }),
    columnHelper.action({
      actions: ({ row }) => [
        {
          icon: "PencilSquare",
          label: "Edit",
          onClick: () => (window.location.href = `/app/menus/${row.original.id}`),
        },
        {
          icon: "Trash",
          label: "Delete",
          onClick: () => {
            if (confirm(`Are you sure you want to delete "${row.original.name}"?`)) {
              deleteMenu.mutate(row.original.id, {
                onSuccess: () => {
                  toast.success("Menu Deleted", {
                    description: `"${row.original.name}" has been deleted successfully.`,
                    duration: 3000,
                  })
                },
                onError: (error) => {
                  console.error("Error deleting menu:", error)
                  toast.error("Delete Failed", {
                    description: "There was an error deleting the menu. Please try again.",
                    duration: 5000,
                  })
                },
              })
            }
          },
        },
      ],
    }),
  ]

  const table = useDataTable({
    columns,
    data: data?.menus || [],
    getRowId: (row) => row.id,
    rowCount: data?.count ?? 0,
    isLoading,
    search: {
      state: query.q,
      onSearchChange: (q) => {
        setQuery({ ...query, q, offset: 0 })
      },
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
        })
      },
    },
  })

  return (
    <DataTable instance={table}>
      <DataTable.Toolbar>
        <DataTable.Search placeholder="Search menus..." />
        <Button 
          variant="primary" 
          size="base"
          onClick={onCreateMenu}
          className="ml-auto"
        >
          Create Menu
        </Button>
      </DataTable.Toolbar>

      <DataTable.Table />

      <DataTable.Pagination />
    </DataTable>
  )
}
