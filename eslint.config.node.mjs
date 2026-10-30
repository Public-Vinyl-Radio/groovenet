import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier/flat";

// typescript-eslint needs the TypeScript compiler API, which TypeScript 7 does
// not ship, so every workspace uses the same TypeScript 6 alias (#747).
export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    ignores: ["**/build/**", "**/dist/**", "**/coverage/**", "**/node_modules/**"],
  },
  // Last, so Prettier owns layout.
  prettier,
);
