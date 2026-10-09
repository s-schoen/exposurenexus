import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

import { App, createAppRouter } from "@/app.tsx";

import "@/styles.css";
import * as TanStackQueryProvider from "@/integrations/tanstack-query/root-provider.tsx";

const TanStackQueryProviderContext = TanStackQueryProvider.getContext();
const router = createAppRouter(TanStackQueryProviderContext);

// `pnpm dev:mock` serves the API from MSW; production builds drop this branch and its import.
async function enableMocking() {
  if (import.meta.env.MODE !== "mock") {
    return;
  }
  const { startMocking } = await import("@/mocks/browser.ts");
  await startMocking();
}

// Render the app
const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
  void enableMocking().then(() => {
    ReactDOM.createRoot(rootElement).render(
      <StrictMode>
        <TanStackQueryProvider.Provider {...TanStackQueryProviderContext}>
          <App router={router} />
        </TanStackQueryProvider.Provider>
      </StrictMode>,
    );
  });
}
