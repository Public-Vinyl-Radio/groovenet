import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Stack, Switch } from "@chakra-ui/react";
import { IncludeSimilarToggle } from "@/components/GenreFilter";

const meta: Meta<typeof IncludeSimilarToggle> = {
  title: "Components/IncludeSimilarToggle",
  component: IncludeSimilarToggle,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof IncludeSimilarToggle>;

export const Interactive: Story = {
  render: () => {
    const [checked, setChecked] = useState(false);
    return <IncludeSimilarToggle checked={checked} onChange={setChecked} />;
  },
};

/** Every state side by side (#899): each must read without colour, in every palette. */
export const States: Story = {
  render: () => (
    <Stack gap="4">
      {[
        { label: "Off", checked: false },
        { label: "On", checked: true },
        { label: "Off, disabled", checked: false, disabled: true },
        { label: "On, disabled", checked: true, disabled: true },
      ].map(({ label, checked, disabled }) => (
        <Switch.Root key={label} size="sm" defaultChecked={checked} disabled={disabled}>
          <Switch.HiddenInput />
          <Switch.Control />
          <Switch.Label>{label}</Switch.Label>
        </Switch.Root>
      ))}
    </Stack>
  ),
};
