import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, toast } from "@medusajs/ui"
import { useAdminRetrieveMenu, useAdminUpdateMenuMutation } from "../../../hooks/menus"
import { MenuForm } from "../components/menu-form"
import { useParams, useNavigate, type UIMatch } from "react-router-dom"
import type { AdminUpdateMenuDTO } from "../../../../sdk/admin/admin-menus"

interface MenuDetailsPageProps {
  params: {
    id: string
  }
}

const MenuDetailsPage = ({ params }: MenuDetailsPageProps) => {
  const { id } = useParams()
  const { data: menu, isLoading, refetch } = useAdminRetrieveMenu(id as string)
  const updateMenu = useAdminUpdateMenuMutation(id as string)
  const navigate = useNavigate()

  const handleSubmit = async (data: AdminUpdateMenuDTO) => {
    try {
      await updateMenu.mutateAsync(data)
      // Show success toast
      toast.success("Menu Updated", {
        description: "The menu has been updated successfully.",
        duration: 3000,
      })
      // Refresh the menu data
      await refetch()
    } catch (error) {
      console.error("Error updating menu:", error)
      toast.error("Update Failed", {
        description: "There was an error updating the menu. Please try again.",
        duration: 5000,
      })
    }
  }

  const handleCancel = () => {
    navigate("/menus")
  }

  if (isLoading) {
    return (
      <Container>
        <div className="flex items-center justify-center h-full">
          <span>Loading...</span>
        </div>
      </Container>
    )
  }

  if (!menu) {
    return (
      <Container>
        <div className="flex items-center justify-center h-full">
          <span>Menu not found</span>
        </div>
      </Container>
    )
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h1">Edit Menu</Heading>
      </div>
      
      <MenuForm
        initialData={menu}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isLoading={updateMenu.isPending}
      />
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Edit Menu",
})

const MenuDetailBreadcrumb = (props: UIMatch<unknown>) => {
  const id = props.params?.id as string | undefined
  const { data: menu } = useAdminRetrieveMenu(id ?? "", { enabled: Boolean(id) })
  if (!menu?.name) {
    return null
  }
  return <span>{menu.name}</span>
}

export const handle = {
  breadcrumb: (match: UIMatch<unknown>) => <MenuDetailBreadcrumb {...match} />,
}

export default MenuDetailsPage 