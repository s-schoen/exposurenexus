import type { ReactNode } from "react";

interface DetailLayoutProps {
  /** The title and its description. */
  header: ReactNode;
  /** The `PropertiesPanel`. */
  panel: ReactNode;
  /** `DetailSection`s, split by hairlines. */
  children: ReactNode;
}

// Plane's work-item layout. It switches on its own width, so the same content fits the page and the
// peek: two columns with the properties panel on the right when wide, and stacked with the panel
// under the title when narrow. It renders full-bleed, so the shell and the peek drop their padding.
export function DetailLayout({ header, panel, children }: DetailLayoutProps) {
  return (
    <div data-full-bleed className="@container flex min-h-full flex-col">
      <div className="grid flex-1 grid-cols-1 content-start @3xl:grid-cols-[minmax(0,1fr)_22.5rem] @3xl:grid-rows-[auto_1fr]">
        <div className="min-w-0 px-5 pt-5 @3xl:col-start-1 @3xl:row-start-1 @3xl:px-8 @3xl:pt-6">
          <div className="mx-auto max-w-3xl">{header}</div>
        </div>
        <aside className="mt-4 border-y border-border px-5 py-4 @3xl:col-start-2 @3xl:row-span-2 @3xl:row-start-1 @3xl:mt-0 @3xl:border-y-0 @3xl:border-l @3xl:px-6 @3xl:py-5">
          {panel}
        </aside>
        <div className="min-w-0 px-5 pb-5 @3xl:col-start-1 @3xl:row-start-2 @3xl:px-8 @3xl:pb-6">
          <div className="mx-auto flex max-w-3xl flex-col divide-y divide-border">{children}</div>
        </div>
      </div>
    </div>
  );
}
