import React, { createContext, useContext, useState } from "react"
import type { LucideIcon } from "lucide-react"

export interface PageAction {
  label: string
  icon?: LucideIcon
  onClick: () => void
  variant?: "default" | "outline" | "ghost" | "destructive"
  disabled?: boolean
}

export interface PageState {
  title: string
  setTitle: (title: string) => void
  actions: PageAction[]
  setActions: (actions: PageAction[]) => void
}

const PageContext = createContext<PageState | undefined>(undefined)

export function PageProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState("")
  const [actions, setActions] = useState<PageAction[]>([])

  return (
    <PageContext.Provider value={{ title, setTitle, actions, setActions }}>
      {children}
    </PageContext.Provider>
  )
}

export function usePage() {
  const context = useContext(PageContext)
  if (context === undefined) {
    throw new Error("usePage must be used within an PageProvider")
  }
  return context
}
