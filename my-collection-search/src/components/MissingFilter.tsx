"use client";

import React from "react";
import { Badge, Button, Checkbox, Menu, Portal, Stack } from "@chakra-ui/react";
import { LuChevronDown } from "react-icons/lu";
import type { MissingFilterOption } from "@/lib/trackFilters";

type MissingFilterProps<K extends string> = {
  options: MissingFilterOption<K>[];
  /** Whether each check is on. */
  active: Partial<Record<K, boolean>>;
  onToggle: (key: K) => void;
};

/**
 * Each option with whether it's on, and whether it's disabled: a nested
 * check is off while the check above it is on, since that one covers it.
 */
function optionStates<K extends string>(
  options: MissingFilterOption<K>[],
  active: Partial<Record<K, boolean>>
) {
  let parentOn = false;
  return options.map((option) => {
    const disabled = !!option.nested && parentOn;
    if (!option.nested) parentOn = !!active[option.key];
    return { option, checked: !!active[option.key], disabled };
  });
}

/**
 * The missing-data checks behind one button (#447), so they don't crowd the
 * filter row. Checks that are on also show as chips beside it, which can
 * remove them.
 */
export default function MissingFilter<K extends string>({
  options,
  active,
  onToggle,
}: MissingFilterProps<K>) {
  const count = options.filter((option) => active[option.key]).length;

  return (
    <Menu.Root closeOnSelect={false}>
      <Menu.Trigger asChild>
        <Button
          size="sm"
          variant="outline"
          borderRadius="full"
          flexShrink={0}
          aria-label={count > 0 ? `Missing data filters, ${count} on` : "Missing data filters"}
        >
          Missing
          {count > 0 && (
            <Badge size="xs" colorPalette="blue" variant="solid" borderRadius="full">
              {count}
            </Badge>
          )}
          <LuChevronDown />
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="200px">
            {optionStates(options, active).map(({ option, checked, disabled }) => (
              <Menu.CheckboxItem
                key={option.key}
                value={option.key}
                checked={checked}
                disabled={disabled}
                onCheckedChange={() => onToggle(option.key)}
                ps={option.nested ? 6 : undefined}
              >
                {option.label}
                <Menu.ItemIndicator />
              </Menu.CheckboxItem>
            ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

/** The same checks as a plain list, for the phone filter sheet. */
export function MissingChecklist<K extends string>({
  options,
  active,
  onToggle,
}: MissingFilterProps<K>) {
  return (
    <Stack gap={3}>
      {optionStates(options, active).map(({ option, checked, disabled }) => (
        <Checkbox.Root
          key={option.key}
          checked={checked}
          disabled={disabled}
          onCheckedChange={() => onToggle(option.key)}
          ps={option.nested ? 6 : undefined}
        >
          <Checkbox.HiddenInput />
          <Checkbox.Control />
          <Checkbox.Label>{option.label}</Checkbox.Label>
        </Checkbox.Root>
      ))}
    </Stack>
  );
}
