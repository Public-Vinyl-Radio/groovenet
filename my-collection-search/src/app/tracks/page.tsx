"use client";

import React, { Suspense } from "react";
import { Flex, Spinner } from "@chakra-ui/react";

import SearchResults from "@/components/SearchResults";
import PageContainer from "@/components/layout/PageContainer";
import PageHeader from "@/components/layout/PageHeader";

const SearchPage = () => {
  return (
    <>
      <Flex gap={4} direction="row">
        {/* Search Results */}
        <PageContainer>
          {/* SearchResults renders the header itself: its kebab needs the search state. */}
          <Suspense
            fallback={
              <>
                <PageHeader>
                  <PageHeader.Title>Tracks</PageHeader.Title>
                  <PageHeader.Actions />
                </PageHeader>
                <Flex justify="center" pt={6}>
                  <Spinner />
                </Flex>
              </>
            }
          >
            <SearchResults />
          </Suspense>
        </PageContainer>
      </Flex>
    </>
  );
};

const SearchPageWrapper = () => {
  return <SearchPage />;
};
export default SearchPageWrapper;
