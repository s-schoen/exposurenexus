import React, { createContext, useContext, useState } from "react"

export interface PageState {
  title: string
  setTitle: (title: string) => void
}

const PageContext = createContext<PageState | undefined>(undefined)

export function PageProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState("")

  return (
    <PageContext.Provider value={{ title, setTitle }}>
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
