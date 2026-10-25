import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LuArrowUpDown, LuSearch } from "react-icons/lu";
import PageHeader from "@/components/layout/PageHeader";

const meta = {
  title: "App/Page header",
  component: PageHeader,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TitleOnly: Story = { args: { title: "Genres" } };

export const WithCount: Story = { args: { title: "Tracks", count: 4821 } };

export const WithActions: Story = {
  args: {
    title: "Albums",
    count: 612,
    actions: [
      { label: "Sort", icon: <LuArrowUpDown />, onClick: () => {} },
      { label: "Search", icon: <LuSearch />, onClick: () => {} },
    ],
  },
};

export const WithOverflow: Story = {
  args: {
    title: "Genres",
    actions: [{ label: "Search", icon: <LuSearch />, onClick: () => {} }],
    overflow: [{ label: "Show genres with no tracks", onClick: () => {} }],
  },
};
