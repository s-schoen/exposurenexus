import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/findings/$id')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authenticated/findings/$id"!</div>
}
