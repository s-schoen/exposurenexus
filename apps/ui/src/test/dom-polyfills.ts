// Browser APIs the app shell uses that jsdom lacks.
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }) as MediaQueryList;
window.scrollTo = () => undefined;
Element.prototype.scrollIntoView = () => undefined;
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Base UI's ScrollArea calls getAnimations. Base UI's own animations-disabled flag keeps popups
// unmounting synchronously on close, as they do without getAnimations.
Element.prototype.getAnimations = () => [];
Object.assign(globalThis, { BASE_UI_ANIMATIONS_DISABLED: true });
