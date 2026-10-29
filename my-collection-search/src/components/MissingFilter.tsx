import type { MissingFilterOption } from "@/lib/trackFilters";

/**
 * Each option with whether it's on, and whether it's disabled: a nested
 * check is off while the check above it is on, since that one covers it.
 */
export function optionStates<K extends string>(
  options: MissingFilterOption<K>[],
  active: Partial<Record<K, boolean>>,
) {
  let parentOn = false;
  return options.map((option) => {
    const disabled = !!option.nested && parentOn;
    if (!option.nested) parentOn = !!active[option.key];
    return { option, checked: !!active[option.key], disabled };
  });
}
