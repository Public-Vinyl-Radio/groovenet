import type { Preview } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ChakraProvider } from '@/components/ui/provider';
import React from 'react';

function StoryProviders({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Infinity },
          mutations: { retry: false },
        },
      })
  );
  return (
    <ChakraProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ChakraProvider>
  );
}

const preview: Preview = {
  decorators: [
    (Story) => (
      <StoryProviders>
        <Story />
      </StoryProviders>
    ),
  ],
  parameters: {
    // Mount the mocked Next.js App Router so components using next/navigation
    // hooks (useRouter, usePathname, ...) render instead of throwing
    // "invariant expected app router to be mounted".
    nextjs: {
      appDirectory: true,
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    viewport: {
      options: {
        mobile375: {
          name: 'Mobile (375)',
          styles: { width: '375px', height: '812px' },
        },
        mobile430: {
          name: 'Mobile (430)',
          styles: { width: '430px', height: '932px' },
        },
        tablet768: {
          name: 'Tablet (768)',
          styles: { width: '768px', height: '1024px' },
        },
        desktop1280: {
          name: 'Desktop (1280)',
          styles: { width: '1280px', height: '900px' },
        },
      },
    },
  },
};

export default preview;
