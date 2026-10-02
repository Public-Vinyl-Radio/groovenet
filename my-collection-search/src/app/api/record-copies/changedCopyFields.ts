/** The copy fields an edit set, for `record_copy_edited` — names, never values. */
export function changedCopyFields(changes: {
  label?: string | null;
  notes?: string | null;
}): ("label" | "notes")[] {
  return (["label", "notes"] as const).filter((field) => changes[field] !== undefined);
}
