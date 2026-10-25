"use client";

import React from "react";
import { Box, Table } from "@chakra-ui/react";

/** Cover (64px) plus its gap and the cell padding, so the "Album" heading sits over the title. */
const ALBUM_HEADING_INSET = "96px";

const heading = {
  textAlign: "left" as const,
  py: 3,
  px: 4,
  fontFamily: "label",
  fontSize: "11px",
  fontWeight: "medium",
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  color: "fg.muted",
  borderBottomWidth: "outline",
  borderColor: "border.ink",
};

/**
 * The albums list view: one outlined block with one shadow for the whole
 * table, scrolling sideways in its own box on a narrow screen. Rows are
 * `<AlbumResult layout="row" />`.
 */
export default function AlbumTable({ children }: { children: React.ReactNode }) {
  return (
    // The padding leaves room for the block's 6px hard shadow.
    <Box pr="6px" pb="6px">
      <Box overflowX="auto" borderWidth="outline" borderColor="border.ink" boxShadow="md" bg="bg">
        <Table.Root minW="880px" w="100%" css={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
          <Table.Header>
            <Table.Row bg="bg.subtle">
              <Table.ColumnHeader {...heading} w="34%" pl={ALBUM_HEADING_INSET}>
                Album
              </Table.ColumnHeader>
              <Table.ColumnHeader {...heading} w="120px">
                Release
              </Table.ColumnHeader>
              <Table.ColumnHeader {...heading} w="80px">
                Tracks
              </Table.ColumnHeader>
              <Table.ColumnHeader {...heading}>
                Genre
              </Table.ColumnHeader>
              <Table.ColumnHeader {...heading} w="130px">
                Rating
              </Table.ColumnHeader>
              <Table.ColumnHeader {...heading} w="64px" p={0}>
                <Box as="span" srOnly>
                  Actions
                </Box>
              </Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>{children}</Table.Body>
        </Table.Root>
      </Box>
    </Box>
  );
}
