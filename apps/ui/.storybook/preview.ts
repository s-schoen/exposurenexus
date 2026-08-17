import { sb } from "storybook/test";

import type { Preview } from "@storybook/react-vite";

import "../src/styles.css";

sb.mock(import("../src/api/user.ts"), { spy: true });
sb.mock(import("../src/hooks/use-finding-lifecycle.ts"), { spy: true });

const preview: Preview = {
  parameters: {
    options: {
      storySort: {
        order: [
          "App",
          ["Shell", ["Header", "Sidebar", "AccountMenu"]],
          "Resources",
          [
            "Assets",
            ["Table", "Detail", "CreateDialog", "Combobox", "InfoItem"],
            "Findings",
            ["Table", "Detail", "StatusBadge", "SeverityChart"],
            "Vulnerabilities",
            ["Table", "Detail", "Form"],
            "Users",
            ["Table", "Detail", "Form"],
            "Roles",
            ["Table", "Detail", "Form"],
            "Custom Fields",
            ["Table", "Detail", "Form"],
          ],
          "Components",
        ],
      },
    },

    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: "todo",
    },
  },
};

export default preview;
