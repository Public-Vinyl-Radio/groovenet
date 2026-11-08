"use client";
import PageContainer from "@/components/layout/PageContainer";
import PageHeader from "@/components/layout/PageHeader";
import SystemStatus from "@/components/system/SystemStatus";
import SystemStorage from "@/components/system/SystemStorage";
import SystemBackups from "@/components/system/SystemBackups";
import DatabaseRestore from "@/components/settings/DatabaseRestore";

export default function SystemPage() {
  return (
    <PageContainer mb="8">
      <PageHeader>
        <PageHeader.Title>System</PageHeader.Title>
        <PageHeader.Actions />
      </PageHeader>
      <SystemStatus />
      <SystemStorage />
      <SystemBackups />
      <DatabaseRestore />
    </PageContainer>
  );
}
