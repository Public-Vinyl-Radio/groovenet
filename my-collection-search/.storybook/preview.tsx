import type { Preview } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ChakraProvider } from '@/components/ui/provider';
import React from 'react';
import { fontClassName } from '@/app/fonts';
import { fontRoleIds, fontRoles, type FontRoleId } from '@/app/fontChoices';

const fontDataKey = { display: 'fontDisplay', body: 'fontBody', label: 'fontLabel' } as const;

function StoryProviders({
  children,
  fonts,
}: {
  children: React.ReactNode;
  fonts: Record<FontRoleId, string>;
}) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Infinity },
          mutations: { retry: false },
        },
      })
  );
  // The app sets these on <html> in layout.tsx; stories need them too, so the
  // house style's faces and the default palette apply.
  React.useEffect(() => {
    const root = document.documentElement;
    const classes = fontClassName.split(' ');
    root.classList.add(...classes);
    root.dataset.palette ??= 'sleeve';
    return () => root.classList.remove(...classes);
  }, []);
  // Check a story against each face from the toolbar (Display, Body, Labels).
  React.useEffect(() => {
    for (const role of fontRoleIds) document.documentElement.dataset[fontDataKey[role]] = fonts[role];
  }, [fonts]);
  return (
    <ChakraProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ChakraProvider>
  );
}

const fontToolbar = Object.fromEntries(
  fontRoleIds.map((role) => [
    `font${role}`,
    {
      description: `${fontRoles[role].label} font`,
      toolbar: {
        title: fontRoles[role].label,
        icon: 'paragraph',
        items: fontRoles[role].choices.map(({ id, label }) => ({ value: id, title: label })),
        dynamicTitle: true,
      },
    },
  ])
);

const preview: Preview = {
  initialGlobals: Object.fromEntries(fontRoleIds.map((role) => [`font${role}`, 'default'])),
  globalTypes: fontToolbar,
  decorators: [
    (Story, context) => (
      <StoryProviders
        fonts={
          Object.fromEntries(
            fontRoleIds.map((role) => [role, context.globals[`font${role}`] ?? 'default'])
          ) as Record<FontRoleId, string>
        }
      >
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
