import { redirect } from "next/navigation";
import SettingsShell from "@/components/settings/SettingsShell";
import { resolveSettingsSectionPath } from "@/components/settings/settingsSections";

type SettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The phone drill-in list, or the default section beside the rail on desktop.
 * `?section=<id>` links from the old tabbed page redirect to `/settings/<id>`;
 * an id nothing knows stays here.
 */
export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const { section } = await searchParams;
  const target = resolveSettingsSectionPath(typeof section === "string" ? section : null);
  if (target) redirect(target);
  return <SettingsShell section={null} />;
}
