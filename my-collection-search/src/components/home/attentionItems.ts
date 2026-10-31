import type { HomeResponse } from "@groovenet/contracts";

export type Attention = HomeResponse["attention"];

export const ATTENTION_ITEMS = [
  {
    key: "missing_audio",
    label: "Tracks missing audio",
    phoneLabel: "Missing audio",
    href: "/tracks?missingAudio=1",
    destination: "Tracks",
    strong: true,
  },
  {
    key: "missing_bpm_or_key",
    label: "Tracks missing BPM or key",
    phoneLabel: "Missing BPM or key",
    href: "/tracks?missingMetadata=1",
    destination: "Tracks",
    strong: true,
  },
  {
    key: "due_for_cleaning",
    label: "Records due for cleaning",
    phoneLabel: "Due for cleaning",
    href: "/chore?status=overdue",
    destination: "Chores",
    strong: false,
  },
  {
    key: "failed_jobs",
    label: "Failed jobs",
    phoneLabel: "Failed jobs",
    href: "/jobs?state=failed",
    destination: "Jobs",
    strong: true,
  },
] as const satisfies readonly {
  key: keyof Attention;
  label: string;
  phoneLabel: string;
  href: string;
  destination: string;
  strong: boolean;
}[];

/** An unavailable jobs count must never imply a healthy queue. */
export function isAllClear(attention: Attention): boolean {
  return ATTENTION_ITEMS.every(({ key }) => attention[key] === 0);
}
