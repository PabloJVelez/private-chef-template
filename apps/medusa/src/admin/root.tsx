import { Outlet } from "react-router-dom"
import { Providers } from "./providers.js"

export default function Root() {
  return (
    <Providers>
      <Outlet />
    </Providers>
  )
} 