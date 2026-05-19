// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook"

//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"

export default [
  ...tanstackConfig,
  {
    ignores: [
      "eslint.config.js",
      "prettier.config.js",
      "src/components/ui/**",
      "src/**/*.gen.ts",
      "storybook-static/**"
    ]
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./*", "../*"],
              message: "Use the @/ alias for imports in manual UI source files."
            }
          ]
        }
      ]
    }
  },
  ...storybook.configs["flat/recommended"]
]
