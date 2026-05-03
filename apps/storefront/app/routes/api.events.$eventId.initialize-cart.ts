import { setCartId } from "@libs/util/server/cookies.server"
import { baseMedusaConfig } from "@libs/util/server/client.server"
import { type ActionFunctionArgs, data } from "react-router"

export async function action({ request, params }: ActionFunctionArgs) {
  const eventId = params.eventId
  if (!eventId) {
    return data({ message: "Event id is required" }, { status: 400 })
  }

  const formData = await request.formData()
  const quantity = Number.parseInt(String(formData.get("quantity") || "1"), 10)
  const cartId = formData.get("cart_id")

  const response = await fetch(
    `${baseMedusaConfig.baseUrl}/store/chef-events/${eventId}/initialize-cart`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-publishable-api-key": baseMedusaConfig.publishableKey || "",
      },
      body: JSON.stringify({
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        cart_id: typeof cartId === "string" && cartId.length > 0 ? cartId : undefined,
      }),
    }
  )

  const payload = await response.json()
  if (!response.ok) {
    return data(payload, { status: response.status })
  }

  const headers = new Headers()
  if (payload?.cart?.id) {
    await setCartId(headers, payload.cart.id)
  }

  return data(payload, { headers })
}
