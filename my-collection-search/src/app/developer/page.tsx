import { notFound } from "next/navigation";
import { developerToolsEnabled, storybookUrl } from "@/lib/developerTools";
import DeveloperToolsView from "./DeveloperToolsView";

export const dynamic = "force-dynamic";

export default function DeveloperPage() {
  if (!developerToolsEnabled()) {
    notFound();
  }

  return <DeveloperToolsView storybookUrl={storybookUrl()} />;
}
