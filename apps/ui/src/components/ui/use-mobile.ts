import * as React from "react";

const MOBILE_BREAKPOINT = 768;

function subscribeToMobileBreakpoint(onStoreChange: () => void): () => void {
  const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mediaQuery.addEventListener("change", onStoreChange);

  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getIsMobileSnapshot(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function getServerIsMobileSnapshot(): false {
  return false;
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribeToMobileBreakpoint,
    getIsMobileSnapshot,
    getServerIsMobileSnapshot,
  );
}
