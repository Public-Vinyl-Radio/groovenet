// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

// Raw Chakra scales and literal white/black: fixed whatever the palette or mode.
const COLOUR_PROPS =
  "/^(color|bg|background|backgroundColor|borderColor|border[A-Z][a-z]+Color|outlineColor|fill|stroke)$/";
const RAW_COLOUR =
  "/^((gray|red|blue|green|orange|purple|yellow|cyan|teal|pink)\\.[0-9]{2,3}|(white|black)(Alpha\\.[0-9]+)?)$/";
const RAW_PALETTE = "/^(gray|red|blue|green|orange|purple|yellow|cyan|teal|pink)$/";

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Existing codebase has broad `any` usage and migration debt.
      "@typescript-eslint/no-explicit-any": "off",
      // New React hook safety rules are useful but too disruptive as an immediate baseline.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      // `const { field, ...rest } = obj` to omit a field is an established
      // pattern here (e.g. dropping local_tags before returning a track);
      // the unused destructured sibling isn't a real unused variable.
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
      // Chakra v3 ignores colorScheme (renamed to colorPalette); catch it before it ships (#482).
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='colorScheme']",
          message: "Chakra v3 has no `colorScheme` prop; use `colorPalette` instead.",
        },
        {
          // Palettes can only recolour what reads a semantic token (#666).
          selector: `JSXAttribute[name.name=${COLOUR_PROPS}] Literal[value=${RAW_COLOUR}]`,
          message:
            "Use a semantic token (fg.muted, bg.subtle, accent.fg, status.*…), not a raw palette colour.",
        },
        {
          selector: `Property[key.name=${COLOUR_PROPS}] > Literal[value=${RAW_COLOUR}]`,
          message:
            "Use a semantic token (fg.muted, bg.subtle, accent.fg, status.*…), not a raw palette colour.",
        },
        {
          selector: `JSXAttribute[name.name='colorPalette'] Literal[value=${RAW_PALETTE}]`,
          message: "Use colorPalette accent, neutral, danger or status.*, not a raw palette.",
        },
      ],
    },
  },
  {
    // Analytics goes through src/lib/analytics (#338); only its providers may
    // talk to a vendor SDK.
    ignores: ["src/lib/analytics/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["posthog-js", "posthog-node"].map((name) => ({
            name,
            message: "Use @/lib/analytics/client or @/lib/analytics/server instead.",
          })),
          patterns: [
            {
              group: ["posthog-js/*", "posthog-node/*"],
              message: "Use @/lib/analytics/client or @/lib/analytics/server instead.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "public/storybook/**",
      "tmp/**",
      "*.min.js",
    ],
  },
  ...storybook.configs["flat/recommended"],
  // Last, so Prettier owns layout.
  prettier,
];

export default eslintConfig;
