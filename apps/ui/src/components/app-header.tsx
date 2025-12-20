import { AccountMenu } from "@/components/account-menu"

export default function AppHeader() {
  return (
    <div className="flex items-center justify-between px-4 py-4 bg-gray-400">
      <span className="text-2xl font-semibold text-primary">OpenVLP</span>
      <AccountMenu />
    </div>
  )
}
