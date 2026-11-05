"use client";

import React from "react";
import { Box, Flex, Heading, IconButton, Menu, Stack, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { FiChevronLeft, FiMoreHorizontal } from "react-icons/fi";
import { headerTarget, pageHeader } from "@/app/houseStyle";
import { useRootFlag } from "@/hooks/useRootFlag";
import Breadcrumbs, { type Crumb } from "@/components/layout/Breadcrumbs";
import { HeaderButton } from "@/components/layout/ListHeader";
import { placeActions, type HeaderAction } from "./placeActions";

// The parts lay themselves out on the root's grid by area (back, title,
// actions, context, tabs), so they can be written in any order and wrapped in
// a caller's own components.

const phoneOnly = { base: "flex", md: "none" } as const;
const desktopOnly = { base: "none", md: "flex" } as const;

export type PageHeaderRootProps = { children?: React.ReactNode };

/**
 * The header: on phones a solid 52px bar, sticky just under the status-bar
 * strip; from `md` up the same parts in rows. Either way a 2px ink rule closes
 * it, unless `PageHeader.Tabs` takes its place. Mounting one flips
 * `data-page-header` on <html>, which drops the shell's legacy top padding
 * (houseStyle `--content-pt`).
 */
export function PageHeaderRoot({ children }: PageHeaderRootProps) {
  useRootFlag("data-page-header", true);
  return (
    <Box as="header" data-testid="page-header" css={pageHeader.root}>
      {children}
    </Box>
  );
}

export type PageHeaderContextProps = {
  /** The trail ending in the current page; parents link. */
  crumbs?: Crumb[];
  /** Replaces the phone bar's back button, e.g. a form's Cancel. Phones only. */
  leading?: React.ReactNode;
};

/**
 * Where the page sits: the trail above the title from `md` up, and on phones a
 * back button to the last parent that links (or `leading` instead).
 */
export function PageHeaderContext({ crumbs = [], leading }: PageHeaderContextProps) {
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : undefined;
  let back: React.ReactNode = null;
  if (leading) {
    back = (
      <Flex data-testid="page-header-leading" gridArea="back" me={2} display={phoneOnly}>
        {leading}
      </Flex>
    );
  } else if (parent?.href) {
    back = (
      <IconButton
        asChild
        aria-label={`Back to ${parent.label}`}
        variant="ghost"
        gridArea="back"
        me={2}
        boxSize={headerTarget}
        minW={headerTarget}
        display={{ base: "inline-flex", md: "none" }}
      >
        <NextLink href={parent.href} aria-label={`Back to ${parent.label}`}>
          <FiChevronLeft />
        </NextLink>
      </IconButton>
    );
  }

  return (
    <>
      {crumbs.length > 0 && (
        <Breadcrumbs
          crumbs={crumbs}
          data-testid="page-header-breadcrumbs"
          gridArea="context"
          display={desktopOnly}
          mb={pageHeader.contextGap}
        />
      )}
      {back}
    </>
  );
}

export type PageHeaderTitleProps = {
  /** The page's one h1. A string truncates with the full text as a tooltip. */
  children: React.ReactNode;
  /** A count or a summary on the title's baseline ("4,044 results"). */
  meta?: React.ReactNode;
  /** Keep the meta in the phone bar. Short counts fit; summaries don't. */
  metaOnPhone?: boolean;
};

export function PageHeaderTitle({ children, meta, metaOnPhone = true }: PageHeaderTitleProps) {
  return (
    <Flex gridArea="title" align="baseline" gap={pageHeader.titleGap} minW={0}>
      <Heading
        as="h1"
        {...pageHeader.title}
        truncate
        title={typeof children === "string" ? children : undefined}
      >
        {children}
      </Heading>
      {meta !== undefined && meta !== null && (
        <Text
          as="span"
          data-testid="page-header-meta"
          {...pageHeader.meta}
          display={metaOnPhone ? "block" : desktopOnly}
          // The title gives way first; a meta wider than half the row truncates.
          flexShrink={0}
          maxW="50%"
          minW={0}
          truncate
          title={typeof meta === "string" ? meta : undefined}
        >
          {meta}
        </Text>
      )}
    </Flex>
  );
}

function ActionsMenu({ items, trigger }: { items: HeaderAction[]; trigger: React.ReactElement }) {
  return (
    <Menu.Root>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Positioner>
        <Menu.Content>
          {items.map((item) => (
            <Menu.Item
              key={item.label}
              value={item.label}
              onClick={item.onClick}
              disabled={item.disabled || item.loading}
            >
              {item.label}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  );
}

export type PageHeaderActionsProps = {
  /**
   * One list for both widths. Desktop: outline buttons, the first `primary`
   * solid, then ⋯. Phones: up to two 44px icons, then ⋯.
   */
  actions?: HeaderAction[];
  /** Custom controls before the desktop buttons (ViewModeSwitch, a search trigger). */
  desktop?: React.ReactNode;
  /** A custom control after the phone icons (a page's own menu, a month switcher). */
  phone?: React.ReactNode;
};

export function PageHeaderActions({ actions = [], desktop, phone }: PageHeaderActionsProps) {
  const placed = placeActions(actions);
  const hasPhone = placed.phoneIcons.length > 0 || placed.phoneMenu.length > 0 || Boolean(phone);
  const hasDesktop =
    placed.desktopButtons.length > 0 || placed.desktopMenu.length > 0 || Boolean(desktop);
  if (!hasPhone && !hasDesktop) return null;

  return (
    <Flex gridArea="actions" ms={pageHeader.actionsGap} align="center">
      {hasPhone && (
        <Flex data-testid="page-header-phone-actions" display={phoneOnly} align="center" gap={1}>
          {placed.phoneIcons.map((action) => (
            <IconButton
              key={action.label}
              aria-label={action.label}
              variant="ghost"
              boxSize={headerTarget}
              minW={headerTarget}
              onClick={action.onClick}
              disabled={action.disabled || action.loading}
            >
              {action.icon}
            </IconButton>
          ))}
          {placed.phoneMenu.length > 0 && (
            <ActionsMenu
              items={placed.phoneMenu}
              trigger={
                <IconButton
                  aria-label="More actions"
                  variant="ghost"
                  boxSize={headerTarget}
                  minW={headerTarget}
                >
                  <FiMoreHorizontal />
                </IconButton>
              }
            />
          )}
          {phone}
        </Flex>
      )}
      {hasDesktop && (
        <Flex
          data-testid="page-header-desktop-actions"
          display={desktopOnly}
          align="center"
          justify="flex-end"
          wrap="wrap"
          gap={3}
        >
          {desktop}
          {placed.desktopButtons.map((action) => (
            <HeaderButton
              key={action.label}
              variant={action === placed.solid ? "solid" : action.ghost ? "ghost" : "outline"}
              {...(action.ghost && action !== placed.solid && { borderColor: "transparent" })}
              onClick={action.onClick}
              disabled={action.disabled}
              loading={action.loading}
            >
              {action.icon}
              {action.label}
            </HeaderButton>
          ))}
          {placed.desktopMenu.length > 0 && (
            <ActionsMenu
              items={placed.desktopMenu}
              trigger={
                <HeaderButton aria-label="More actions" px={0} w="40px">
                  <FiMoreHorizontal aria-hidden="true" />
                </HeaderButton>
              }
            />
          )}
        </Flex>
      )}
    </Flex>
  );
}

/**
 * Tabs that close the header in place of the rule: pass the tab list (the
 * page wraps its content in the matching `Tabs.Root`).
 */
export function PageHeaderTabs({ children }: { children: React.ReactNode }) {
  return (
    <Box data-page-header-tabs="" gridArea="tabs" {...pageHeader.tabs}>
      {children}
    </Box>
  );
}

/** Under the rule, outside the header: the search row, filters, a view switch. */
export function PageHeaderToolbar({ children }: { children: React.ReactNode }) {
  return (
    <Stack data-testid="page-header-toolbar" gap={3} {...pageHeader.toolbar}>
      {children}
    </Stack>
  );
}
