import { createFileRoute } from "@tanstack/react-router"
import { usePage } from "@/context/page.tsx"
import { Label } from "@radix-ui/react-label"
import { Input } from "@/components/ui/input.tsx"
import { type ChangeEvent, useState } from "react"
import { Button } from "@/components/ui/button.tsx"
import { uploadFindingFile } from "@/api/finding.ts"
import { toast } from "sonner"

export const Route = createFileRoute("/_authenticated/findings/import")({
  component: RouteComponent
})

function RouteComponent() {
  const [file, setFile] = useState<File | null>(null)
  const page = usePage()
  page.setTitle("Import Findings")

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0])
    }
  }

  const handleImport = async () => {
    if (file) {
      try {
        await uploadFindingFile("nuclei", file)
      } catch (error) {
        toast.error(`Failed to upload findings for import: ${error}`)
      }
    }
  }

  return (
    <div>
      <Label>Select file</Label>
      <Input type="file" onChange={handleFileChange} />
      <Button onClick={handleImport}>Import</Button>
    </div>
  )
}
