"use client";

import React from "react";
import { Field, Input, Stack, Text, Textarea } from "@chakra-ui/react";
import { toaster } from "@/components/ui/toaster";
import { useRecordCareMutations } from "@/hooks/useRecordCareQuery";
import type { RecordCopyListItem } from "@/services/internalApi/recordCare";
import RecordSheet from "./RecordSheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  releaseId: string;
  friendId: number;
  /** The copy to label or annotate; omit to add a copy. */
  copy?: RecordCopyListItem;
};

const LABEL_MAX = 100;

type FormState = { label: string; notes: string };

const initialState = (copy?: RecordCopyListItem): FormState => ({
  label: copy?.label ?? "",
  notes: copy?.notes ?? "",
});

/** Blank means none: an emptied field clears the stored value. */
const orNull = (value: string) => value.trim() || null;

/**
 * The fields to send: on an edit, only those that changed, so an unchanged
 * save sends nothing; on an add, only those filled in.
 */
function copyFormChanges(form: FormState, copy?: RecordCopyListItem) {
  const changes: { label?: string | null; notes?: string | null } = {};
  for (const field of ["label", "notes"] as const) {
    const value = orNull(form[field]);
    if (copy ? value !== copy[field] : value !== null) changes[field] = value;
  }
  return changes;
}

export default function RecordCopyFormDialog({ open, onOpenChange, releaseId, friendId, copy }: Props) {
  const isEdit = Boolean(copy);
  const [form, setForm] = React.useState<FormState>(() => initialState(copy));
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(initialState(copy));
  }

  const { addCopy, updateCopy, addCopyPending, updateCopyPending } =
    useRecordCareMutations(friendId);

  const handleSave = async () => {
    const changes = copyFormChanges(form, copy);
    try {
      if (copy) {
        if (Object.keys(changes).length === 0) {
          onOpenChange(false);
          return;
        }
        await updateCopy(copy, changes);
        toaster.create({ title: "Copy updated", type: "success" });
      } else {
        await addCopy({ release_id: releaseId, ...changes });
        toaster.create({ title: "Copy added", type: "success" });
      }
      onOpenChange(false);
    } catch (error) {
      toaster.create({
        title: isEdit ? "Failed to update copy" : "Failed to add copy",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    }
  };

  return (
    <RecordSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit Copy" : "Add a Copy"}
      saveLabel={isEdit ? "Save Changes" : "Add Copy"}
      saving={isEdit ? updateCopyPending : addCopyPending}
      onSave={handleSave}
    >
      <Stack gap={4}>
        {!isEdit && (
          <Text fontSize="sm" color="fg.muted">
            Another physical copy of this release, with its own cleaning and sleeve history.
          </Text>
        )}
        <Field.Root>
          <Field.Label>Label</Field.Label>
          <Input
            value={form.label}
            maxLength={LABEL_MAX}
            onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
            placeholder="DJ copy, sealed, copy 2"
          />
        </Field.Root>
        <Field.Root>
          <Field.Label>Notes</Field.Label>
          <Textarea
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Condition, pressing, where it came from"
            rows={3}
          />
        </Field.Root>
      </Stack>
    </RecordSheet>
  );
}
