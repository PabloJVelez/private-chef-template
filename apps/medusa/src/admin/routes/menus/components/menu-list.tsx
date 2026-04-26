import { useAdminListMenus, useAdminDeleteMenuMutation, useAdminDuplicateMenuMutation } from "../../../hooks/menus"
import { DataTable, createDataTableColumnHelper, useDataTable, Button, toast, Badge, usePrompt } from "@medusajs/ui"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import type { AdminMenuDTO } from "../../../../sdk/admin/admin-menus"

const columnHelper = createDataTableColumnHelper<AdminMenuDTO>()

interface MenuListProps {
  onCreateMenu: () => void
}

export const MenuList = ({ onCreateMenu }: MenuListProps) => {
  const navigate = useNavigate()
  const [query, setQuery] = useState({ limit: 10, offset: 0, q: "" })
  const { data, isLoading, error } = useAdminListMenus(query)
  const deleteMenu = useAdminDeleteMenuMutation()
  const duplicateMenu = useAdminDuplicateMenuMutation()
  const prompt = usePrompt()

  const columns = [
    columnHelper.accessor("name", {
      header: "Name",
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => navigate(`/menus/${row.original.id}`)}
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
    columnHelper.accessor("status", {
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status || "draft"
        const color = status === "active" ? "green" : status === "inactive" ? "grey" : "orange"
        return <Badge color={color}>{status}</Badge>
      },
    }),
    columnHelper.accessor("created_at", {
      header: "Created At",
      cell: ({ row }) => new Date(row.original.created_at).toLocaleDateString(),
    }),
    columnHelper.action({
      actions: ({ row }) => [
        {
          label: "Edit",
          onClick: () => navigate(`/menus/${row.original.id}`),
        },
        {
          label: "Duplicate",
          onClick: () => {
            duplicateMenu.mutate(
              { id: row.original.id },
              {
                onSuccess: () => {
                  toast.success("Menu Duplicated", {
                    description: `A draft copy of "${row.original.name}" was created.`,
                    duration: 3000,
                  })
                },
                onError: (error) => {
                  console.error("Error duplicating menu:", error)
                  toast.error("Duplicate Failed", {
                    description: "There was an error duplicating the menu. Please try again.",
                    duration: 5000,
                  })
                },
              }
            )
          },
        },
        {
          label: "Delete",
          onClick: async () => {
            const confirmed = await prompt({
              title: "Delete menu?",
              description: `Are you sure you want to delete "${row.original.name}"? This action cannot be undone.`,
              confirmText: "Delete",
              cancelText: "Cancel",
              variant: "confirmation",
            })

            if (!confirmed) {
              return
            }

            deleteMenu.mutate(row.original.id, {
              onSuccess: () => {
                toast.success("Menu Deleted", {
                  description: `"${row.original.name}" has been deleted successfully.`,
                  duration: 3000,
                })
              },
              onError: (error) => {
                const message =
                  error && typeof error === "object" && "message" in error
                    ? String((error as { message?: unknown }).message)
                    : "There was an error deleting the menu. Please try again."

                console.error("Error deleting menu:", error)
                toast.error("Delete Failed", {
                  description: message,
                  duration: 5000,
                })
              },
            })
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
