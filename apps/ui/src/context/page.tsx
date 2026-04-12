import React, { createContext, useContext, useEffect, useState } from "react"
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
  description: string
  setDescription: (description: string) => void
  actions: Array<PageAction>
  setActions: (actions: Array<PageAction>) => void
}

interface UsePageMetaOptions {
  title: string
  description?: string
  actions?: Array<PageAction>
}

const EMPTY_PAGE_ACTIONS: Array<PageAction> = []

const PageContext = createContext<PageState | undefined>(undefined)

export function PageProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [actions, setActions] = useState<Array<PageAction>>([])

  return (
    <PageContext.Provider
      value={{
        title,
        setTitle,
        description,
        setDescription,
        actions,
        setActions
      }}
    >
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

export function usePageMeta({
  title,
  description = "",
  actions = EMPTY_PAGE_ACTIONS
}: UsePageMetaOptions) {
  const { setTitle, setDescription, setActions } = usePage()

  useEffect(() => {
    setTitle(title)
    setDescription(description)
  }, [description, setDescription, setTitle, title])

  useEffect(() => {
    setActions(actions)
    return () => {
      setActions([])
    }
  }, [actions, setActions])
}
