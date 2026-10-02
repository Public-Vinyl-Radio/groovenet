"use client";

import React from "react";
import {
  Button,
  Field,
  HStack,
  Input,
  NativeSelectField,
  NativeSelectRoot,
  Stack,
  Textarea,
} from "@chakra-ui/react";
import { toaster } from "@/components/ui/toaster";
import { useRecordCareMutations, useRecordCopiesQuery } from "@/hooks/useRecordCareQuery";
import type { CleaningMethod, RecordActionType, SleeveType } from "@/lib/recordCare";
import type { RecordCopyListItem } from "@/services/internalApi/recordCare";
import RecordSheet from "./RecordSheet";
import {
  buildRecordActionBody,
  copyKey,
  initialRecordActionState,
  recordActionFormError,
  type RecordActionFormState,
} from "./recordActionForm";
import {
  ACTION_OPTIONS,
  CLEANING_METHOD_OPTIONS,
  SLEEVE_OPTIONS,
  actionLabel,
  copyName,
} from "./recordCareFormat";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  releaseId: string;
  friendId: number;
  albumTitle?: string;
  /** The copy to log against; the release's default copy when omitted. */
  copy?: Pick<RecordCopyListItem, "id" | "is_default">;
  /** The action to start on; a cleaning when omitted. */
  actionType?: RecordActionType;
};

export default function RecordActionDialog({
  open,
  onOpenChange,
  releaseId,
  friendId,
  albumTitle,
  copy,
  actionType,
}: Props) {
  // The form resets each time it opens, as SpinFormDialog's does.
  const [form, setForm] = React.useState<RecordActionFormState>(() =>
    initialRecordActionState({ actionType, copy })
  );
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(initialRecordActionState({ actionType, copy }));
  }
  const update = (patch: Partial<RecordActionFormState>) =>
    setForm((current) => ({ ...current, ...patch }));

  const { copies } = useRecordCopiesQuery(
    { friend_id: friendId, release_id: releaseId },
    { enabled: open }
  );
  const { logAction, logActionPending } = useRecordCareMutations(friendId);

  const handleSave = async () => {
    const error = recordActionFormError(form);
    if (error) {
      toaster.create({ title: "Can't save yet", description: error, type: "error" });
      return;
    }
    try {
      await logAction(buildRecordActionBody(form, releaseId));
      toaster.create({
        title: `${actionLabel(form.actionType)} logged`,
        description: albumTitle,
        type: "success",
      });
      onOpenChange(false);
    } catch (error) {
      toaster.create({
        title: "Failed to log care",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    }
  };

  return (
    <RecordSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Log Record Care"
      saveLabel="Save"
      saving={logActionPending}
      onSave={handleSave}
    >
      <Stack gap={4}>
        <HStack gap={2} wrap="wrap" role="group" aria-label="Action">
          {ACTION_OPTIONS.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={form.actionType === option.value ? "solid" : "outline"}
              aria-pressed={form.actionType === option.value}
              onClick={() => update({ actionType: option.value })}
            >
              {option.label}
            </Button>
          ))}
        </HStack>

        {copies.length > 1 && (
          <Field.Root>
            <Field.Label>Copy</Field.Label>
            <NativeSelectRoot>
              <NativeSelectField
                value={form.copyKey}
                onChange={(event) => update({ copyKey: event.target.value })}
              >
                {copies.map((item, index) => (
                  <option key={copyKey(item)} value={copyKey(item)}>
                    {copyName(item, index)}
                  </option>
                ))}
              </NativeSelectField>
            </NativeSelectRoot>
          </Field.Root>
        )}

        <Field.Root>
          <Field.Label>When</Field.Label>
          <Input
            type="datetime-local"
            value={form.occurredAtInput}
            onChange={(event) => update({ occurredAtInput: event.target.value })}
          />
        </Field.Root>

        {form.actionType === "cleaned" && (
          <Field.Root>
            <Field.Label>Method</Field.Label>
            <NativeSelectRoot>
              <NativeSelectField
                value={form.method}
                onChange={(event) => update({ method: event.target.value as CleaningMethod | "" })}
              >
                <option value="">Not recorded</option>
                {CLEANING_METHOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </NativeSelectField>
            </NativeSelectRoot>
          </Field.Root>
        )}

        {form.actionType === "sleeved" && (
          <Field.Root>
            <Field.Label>New inner sleeve</Field.Label>
            <NativeSelectRoot>
              <NativeSelectField
                value={form.sleeveType}
                onChange={(event) => update({ sleeveType: event.target.value as SleeveType })}
              >
                {SLEEVE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </NativeSelectField>
            </NativeSelectRoot>
          </Field.Root>
        )}

        <Field.Root>
          <Field.Label>Note</Field.Label>
          <Textarea
            value={form.notes}
            onChange={(event) => update({ notes: event.target.value })}
            placeholder="Optional"
            rows={3}
          />
        </Field.Root>
      </Stack>
    </RecordSheet>
  );
}
