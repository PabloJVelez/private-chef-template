import { useCallback, useMemo, useRef, useState } from "react"
import { Button, Label, Text } from "@medusajs/ui"
import { sdk } from "../../../../../sdk"

type UploadItem = {
  url: string
  file_id?: string
}

interface MenuMediaProps {
  value: { images: string[]; image_files: UploadItem[]; thumbnail?: string | null }
  onChange: (next: { images: string[]; image_files: UploadItem[]; thumbnail?: string | null }) => void
}

export function MenuMedia({ value, onChange }: MenuMediaProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const images = value.images || []
  const imageFilesMap = useMemo(() => {
    const map = new Map<string, string | undefined>()
    for (const f of value.image_files || []) {
      map.set(f.url, f.file_id)
    }
    return map
  }, [value.image_files])

  const pickFiles = () => inputRef.current?.click()

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      console.log("MenuMedia: no files selected", files)
      return
    }

    setIsUploading(true)
    try {
      console.log("MenuMedia: starting upload of", files.length, "file(s)")
      // Upload files one by one to give feedback and prevent overloading
      const newItems: UploadItem[] = []
      const newUrls: string[] = []

      for (const file of Array.from(files)) {
        console.log("MenuMedia: uploading file", { name: file.name, type: file.type, size: file.size })
        const fd = new FormData()
        fd.append("files", file, file.name)

        // Prefer official SDK if available
        // @ts-ignore - uploads resource exists in js-sdk Admin in runtime
        const uploaded = (await sdk.admin.uploads.create(fd)) as any
        console.log("MenuMedia: raw upload response", uploaded)

        // Normalize response to an array
        const list: any[] = Array.isArray(uploaded?.uploads)
          ? uploaded.uploads
          : Array.isArray(uploaded?.files)
          ? uploaded.files
          : Array.isArray(uploaded)
          ? uploaded
          : []
        console.log("MenuMedia: normalized uploads list length", list.length)
        for (const u of list) {
          const url: string | undefined = u?.url || u?.file_url || u?.download_url || u?.location || u?.signed_url
          const file_id: string | undefined = u?.id || u?.fileId || u?.key || u?.name
          if (!url) {
            console.warn("MenuMedia: upload item missing url", u)
            continue
          }
          const item: UploadItem = { url, file_id }
          newItems.push(item)
          newUrls.push(url)
        }
      }

      console.log("MenuMedia: accumulated new urls", newUrls)
      onChange({
        images: [...images, ...newUrls],
        image_files: [...(value.image_files || []), ...newItems],
        thumbnail: value.thumbnail ?? (images.length === 0 ? newUrls[0] : value.thumbnail),
      })
      console.log("MenuMedia: state updated", {
        imagesCount: images.length + newUrls.length,
        imageFilesCount: (value.image_files?.length || 0) + newItems.length,
        thumbnail: value.thumbnail ?? (images.length === 0 ? newUrls[0] : value.thumbnail),
      })
    } catch (e) {
      console.error("Upload failed", e)
    } finally {
      setIsUploading(false)
    }
  }

  const removeAt = useCallback(
    async (index: number) => {
      const url = images[index]
      const restUrls = images.filter((_, i) => i !== index)

      // If there is a file_id, attempt to delete immediately to prevent orphans
      const fileId = imageFilesMap.get(url)
      if (fileId) {
        try {
          // @ts-ignore - uploads resource exists in js-sdk Admin in runtime
          await sdk.admin.uploads.delete(fileId)
        } catch (e) {
          console.warn("Failed to delete uploaded file", e)
        }
      }

      const nextFiles = (value.image_files || []).filter((f) => f.url !== url)

      const nextThumb = value.thumbnail === url ? (restUrls[0] ?? null) : value.thumbnail
      onChange({ images: restUrls, image_files: nextFiles, thumbnail: nextThumb })
      console.log("MenuMedia: removed image", { url, nextCount: restUrls.length, nextThumb })
    },
    [images, value.image_files, value.thumbnail, imageFilesMap, onChange]
  )

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return
    const next = [...images]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange({ images: next, image_files: value.image_files || [], thumbnail: value.thumbnail })
    console.log("MenuMedia: moved image", { from, to })
  }

  const setCover = (url: string) => {
    onChange({ images, image_files: value.image_files || [], thumbnail: url })
    console.log("MenuMedia: set cover", { url })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label>Menu Images</Label>
          <Text size="small" className="text-gray-600">Upload, reorder, and choose a cover image.</Text>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
          <Button type="button" variant="secondary" onClick={pickFiles} disabled={isUploading}>
            {isUploading ? "Uploading..." : "+ Add Images"}
          </Button>
        </div>
      </div>

      {images.length === 0 ? (
        <div className="border rounded-md p-6 text-center text-gray-600">
          No images yet. Click “+ Add Images” to upload.
        </div>
      ) : (
        <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((url, index) => (
            <li key={url} className="border rounded-md overflow-hidden">
              <div className="aspect-square bg-gray-100">
                <img src={url} alt="Menu" className="w-full h-full object-cover" />
              </div>
              <div className="flex items-center justify-between p-2 gap-2">
                <div className="flex items-center gap-2">
                  <Button type="button" variant="secondary" size="small" onClick={() => move(index, index - 1)}>
                    ←
                  </Button>
                  <Button type="button" variant="secondary" size="small" onClick={() => move(index, index + 1)}>
                    →
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={value.thumbnail === url ? "primary" : "secondary"}
                    size="small"
                    onClick={() => setCover(url)}
                  >
                    {value.thumbnail === url ? "Cover" : "Set Cover"}
                  </Button>
                  <Button type="button" variant="transparent" size="small" onClick={() => removeAt(index)}>
                    ✕
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
