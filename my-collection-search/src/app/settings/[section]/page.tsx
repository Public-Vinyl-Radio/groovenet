import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import SettingsShell from "@/components/settings/SettingsShell";
import {
  isSettingsSectionId,
  resolveSettingsSectionPath,
  settingsSectionLabel,
} from "@/components/settings/settingsSections";

type SectionPageProps = { params: Promise<{ section: string }> };

export async function generateMetadata({ params }: SectionPageProps): Promise<Metadata> {
  const { section } = await params;
  return isSettingsSectionId(section)
    ? { title: `${settingsSectionLabel(section)} · Settings` }
    : {};
}

/** One Settings section. An old tab id (`/settings/downloads`) redirects to its new home. */
export default async function SettingsSectionPage({ params }: SectionPageProps) {
  const { section } = await params;
  if (isSettingsSectionId(section)) return <SettingsShell section={section} />;
  const target = resolveSettingsSectionPath(section);
  if (target) redirect(target);
  notFound();
}
