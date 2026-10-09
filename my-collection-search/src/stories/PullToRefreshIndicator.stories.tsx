import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import PullToRefreshIndicator from "@/components/PullToRefreshIndicator";

const meta = {
  title: "App/Pull to refresh indicator",
  component: PullToRefreshIndicator,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PullToRefreshIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pulling: Story = {
  args: { distance: 44, refreshing: false },
  render: (args) => (
    <div style={{ minHeight: "100vh", padding: 24, background: "#f7f7f7" }}>
      <PullToRefreshIndicator {...args} />
      Pull down at the top of the page to refresh.
    </div>
  ),
};

export const Refreshing: Story = {
  args: { distance: 72, refreshing: true },
  render: Pulling.render,
};
