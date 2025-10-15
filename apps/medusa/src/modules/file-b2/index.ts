import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import B2S3FileService from "./service"

export default ModuleProvider(Modules.FILE, {
  services: [B2S3FileService],
})

