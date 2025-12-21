import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/findings/new')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authenticated/findings/new"!</div>
}
