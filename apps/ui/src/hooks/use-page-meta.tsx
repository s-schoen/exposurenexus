import React, { createContext, useContext, useEffect, useState } from "react";

import type { LucideIcon } from "lucide-react";

export interface PageAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: "default" | "outline" | "ghost" | "destructive";
  disabled?: boolean;
}

/** A parent page in the header breadcrumbs. The current page is the title. */
export interface PageBreadcrumb {
  label: string;
  to: string;
}

export interface PageMeta {
  title: string;
  /** The page column's heading when it says more than the title, as on edit pages ("Edit role"). */
  heading?: string;
  icon?: LucideIcon;
  breadcrumbs: Array<PageBreadcrumb>;
  count?: number;
  actions: Array<PageAction>;
  /** Less common actions, listed in the header's ⋯ menu. */
  menu: Array<PageAction>;
}

type UsePageMetaOptions = Partial<Omit<PageMeta, "title">> & Pick<PageMeta, "title">;

const EMPTY_PAGE_ACTIONS: Array<PageAction> = [];
const EMPTY_BREADCRUMBS: Array<PageBreadcrumb> = [];
const EMPTY_PAGE_META: PageMeta = {
  title: "",
  breadcrumbs: EMPTY_BREADCRUMBS,
  actions: EMPTY_PAGE_ACTIONS,
  menu: EMPTY_PAGE_ACTIONS,
};

type SetPageMeta = React.Dispatch<React.SetStateAction<PageMeta>>;

const PageContext = createContext<PageMeta | undefined>(undefined);
// The setter gets its own context so pages that publish meta don't re-render when it changes:
// with a single context, a page passing a new `actions` array each render re-rendered forever.
const SetPageMetaContext = createContext<SetPageMeta | undefined>(undefined);

export function PageProvider({ children }: { children: React.ReactNode }) {
  const [meta, setMeta] = useState<PageMeta>(EMPTY_PAGE_META);

  return (
    <SetPageMetaContext.Provider value={setMeta}>
      <PageContext.Provider value={meta}>{children}</PageContext.Provider>
    </SetPageMetaContext.Provider>
  );
}

export function usePage() {
  const context = useContext(PageContext);
  if (context === undefined) {
    throw new Error("usePage must be used within an PageProvider");
  }
  return context;
}

function useSetPageMeta() {
  const context = useContext(SetPageMetaContext);
  if (context === undefined) {
    throw new Error("usePageMeta must be used within an PageProvider");
  }
  return context;
}

export function usePageMeta({
  title,
  heading,
  icon,
  breadcrumbs = EMPTY_BREADCRUMBS,
  count,
  actions = EMPTY_PAGE_ACTIONS,
  menu = EMPTY_PAGE_ACTIONS,
}: UsePageMetaOptions) {
  const setMeta = useSetPageMeta();

  useEffect(() => {
    setMeta((previous) => ({ ...previous, title, heading, icon, breadcrumbs, count }));
  }, [breadcrumbs, count, heading, icon, setMeta, title]);

  useEffect(() => {
    setMeta((previous) => ({ ...previous, actions, menu }));
    return () => {
      setMeta((previous) => ({
        ...previous,
        actions: EMPTY_PAGE_ACTIONS,
        menu: EMPTY_PAGE_ACTIONS,
      }));
    };
  }, [actions, menu, setMeta]);
}
