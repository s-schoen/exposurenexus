import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import type { LucideIcon } from "lucide-react";

export interface PageAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: "default" | "outline" | "ghost" | "destructive";
  disabled?: boolean;
}

export interface PageState {
  title: string;
  setTitle: (title: string) => void;
  description: string;
  setDescription: (description: string) => void;
  actions: Array<PageAction>;
  setActions: (actions: Array<PageAction>) => void;
}

interface UsePageMetaOptions {
  title: string;
  description?: string;
  actions?: Array<PageAction>;
}

const EMPTY_PAGE_ACTIONS: Array<PageAction> = [];

type PageSetters = Pick<PageState, "setTitle" | "setDescription" | "setActions">;

const PageContext = createContext<PageState | undefined>(undefined);
// Setters get their own context so pages that publish meta don't re-render when it changes:
// with a single context, a page passing a new `actions` array each render re-rendered forever.
const PageSettersContext = createContext<PageSetters | undefined>(undefined);

export function PageProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [actions, setActions] = useState<Array<PageAction>>([]);
  // `useState` setters are stable, so this value never changes.
  const setters = useMemo(() => ({ setTitle, setDescription, setActions }), []);

  return (
    <PageSettersContext.Provider value={setters}>
      <PageContext.Provider
        value={{
          title,
          description,
          actions,
          ...setters,
        }}
      >
        {children}
      </PageContext.Provider>
    </PageSettersContext.Provider>
  );
}

export function usePage() {
  const context = useContext(PageContext);
  if (context === undefined) {
    throw new Error("usePage must be used within an PageProvider");
  }
  return context;
}

function usePageSetters() {
  const context = useContext(PageSettersContext);
  if (context === undefined) {
    throw new Error("usePageMeta must be used within an PageProvider");
  }
  return context;
}

export function usePageMeta({
  title,
  description = "",
  actions = EMPTY_PAGE_ACTIONS,
}: UsePageMetaOptions) {
  const { setTitle, setDescription, setActions } = usePageSetters();

  useEffect(() => {
    setTitle(title);
    setDescription(description);
  }, [description, setDescription, setTitle, title]);

  useEffect(() => {
    setActions(actions);
    return () => {
      setActions([]);
    };
  }, [actions, setActions]);
}
