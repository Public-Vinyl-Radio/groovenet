"use client";
import { Text } from "@chakra-ui/react";
import PageContainer from "@/components/layout/PageContainer";
import PageHeader from "@/components/layout/PageHeader";
import SystemStatus from "@/components/system/SystemStatus";
import SystemBackups from "@/components/system/SystemBackups";
import DatabaseRestore from "@/components/settings/DatabaseRestore";

export default function SystemPage() {
  return (
    <PageContainer mb="8">
      <PageHeader>
        <PageHeader.Title>System</PageHeader.Title>
        <PageHeader.Actions />
      </PageHeader>
      <Text color="fg.muted" display={{ base: "none", md: "block" }} mt={-2} mb={8}>
        How the server is doing, its backups, and restoring from one.
      </Text>
      <SystemStatus />
      <SystemBackups />
      <DatabaseRestore />
    </PageContainer>
  );
}
