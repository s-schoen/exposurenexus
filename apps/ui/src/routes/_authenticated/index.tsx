import { createFileRoute } from "@tanstack/react-router"
import { AlertCircleIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx"
import { usePage } from "@/context/page.tsx"

export const Route = createFileRoute("/_authenticated/")({
  component: App
})

function App() {
  const page = usePage()
  page.setTitle("Dashboard")

  return (
    <div className="w-full items-start">
      <Alert className="w-full" variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>WIP</AlertTitle>
        <AlertDescription>Not implemented yet</AlertDescription>
      </Alert>
    </div>
  )
}
