import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier/flat";

// typescript-eslint currently needs the TypeScript 6 API. The root alias keeps
// linting supported while the package workspaces retain their TypeScript 7
// compiler dependencies.
export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    ignores: ["**/build/**", "**/dist/**", "**/coverage/**", "**/node_modules/**"],
  },
  // Last, so Prettier owns layout.
  prettier,
);
