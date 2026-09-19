import type { StorybookConfig } from '@storybook/nextjs-vite';
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getAbsolutePath(value: string) {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

const config: StorybookConfig = {
  stories: [
    "../src/stories/**/*.stories.@(js|jsx|mjs|ts|tsx)",
  ],
  addons: [],
  framework: getAbsolutePath('@storybook/nextjs-vite'),
  viteFinal: async (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@/providers/PlaylistPlayerProvider": resolve(
        __dirname,
        "../src/__storybook__/mocks/PlaylistPlayerProvider.tsx"
      ),
    };
    return config;
  },
};
export default config;
