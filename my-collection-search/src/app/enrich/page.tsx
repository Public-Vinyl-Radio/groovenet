"use client";
import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Flex, Spinner } from "@chakra-ui/react";
import { useEnrichmentStore } from "@/stores/enrichmentStore";
import EnrichmentWizard from "@/components/enrichment/EnrichmentWizard";

export default function EnrichPage() {
  const router = useRouter();
  const queue = useEnrichmentStore((s) => s.queue);

  useEffect(() => {
    if (queue.length === 0) {
      router.replace("/tracks");
    }
  }, [queue.length, router]);

  if (queue.length === 0) {
    return (
      <Flex justify="center" pt={12}>
        <Spinner />
      </Flex>
    );
  }

  return <EnrichmentWizard />;
}
