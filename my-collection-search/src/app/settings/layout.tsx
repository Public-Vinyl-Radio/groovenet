import type { Metadata } from "next";
import type { ReactNode } from "react";
import SettingsProviders from "@/components/settings/SettingsProviders";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsProviders>{children}</SettingsProviders>;
}
