"use client";

import React from "react";
import { Box } from "@chakra-ui/react";
import type { Crumb } from "@/components/layout/Breadcrumbs";
import { MAX_PHONE_ICONS, type HeaderAction } from "./placeActions";
import {
  PageHeaderActions,
  PageHeaderContext,
  PageHeaderRoot,
  PageHeaderTabs,
  PageHeaderTitle,
  PageHeaderToolbar,
  type PageHeaderRootProps,
} from "./parts";

export type { HeaderAction } from "./placeActions";
export type { PageHeaderActionsProps, PageHeaderContextProps, PageHeaderTitleProps } from "./parts";

export type PageHeaderAction = {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  /** Greyed out while a save/run is in flight. */
  disabled?: boolean;
};

export type PageHeaderOverflowItem = {
  label: string;
  onClick: () => void;
};

/** The props API from before the parts (#990); callers move to the parts in #993. */
type LegacyPageHeaderProps = {
  title: string;
  count?: number | string;
  /** A line after the title from `md` up ("4,044 tracks · 312 albums"); phones drop it. */
  summary?: string;
  /** Replaces the phone back button (a form's Cancel). */
  leading?: React.ReactNode;
  /**
   * Detail-page trail ending in the current page. Phones get a back button to
   * the last parent (unless `leading` is set); md+ shows the trail above the title.
   */
  breadcrumbs?: Crumb[];
  /** Phone icons, at most two; extras are dropped (use `overflow`). */
  actions?: PageHeaderAction[];
  /** A ready-made control (e.g. a page's own actions menu) after the actions; phones only. */
  trailing?: React.ReactNode;
  /** The phone ⋯ menu. */
  overflow?: PageHeaderOverflowItem[];
  /** Labelled controls at the right of the title row from `md` up (SELECT, LIST / GRID, ADD ALBUM). */
  desktopActions?: React.ReactNode;
  children?: never;
};

export type PageHeaderProps = LegacyPageHeaderProps | (PageHeaderRootProps & { title?: never });

function LegacyPageHeader({
  title,
  count,
  summary,
  leading,
  breadcrumbs,
  actions = [],
  trailing,
  overflow = [],
  desktopActions,
}: LegacyPageHeaderProps) {
  // Before the parts, `actions` and `overflow` were phone-only and a third
  // action was dropped; desktop had only `desktopActions`.
  const placed: HeaderAction[] = [
    ...actions.map((action, index): HeaderAction => ({
      ...action,
      phone: index < MAX_PHONE_ICONS ? "icon" : "hidden",
      desktop: "hidden",
    })),
    ...overflow.map((item): HeaderAction => ({ ...item, phone: "menu", desktop: "hidden" })),
  ];
  const hasCount = count !== undefined;
  const meta =
    hasCount || summary ? (
      <>
        {hasCount && (
          <span data-testid="page-header-count">
            {typeof count === "number" ? count.toLocaleString() : count}
          </span>
        )}
        {summary ? (
          <Box as="span" data-testid="page-header-summary" display={{ base: "none", md: "inline" }}>
            {hasCount ? ` · ${summary}` : summary}
          </Box>
        ) : null}
      </>
    ) : undefined;

  return (
    <PageHeaderRoot>
      <PageHeaderContext crumbs={breadcrumbs} leading={leading} />
      <PageHeaderTitle meta={meta} metaOnPhone={hasCount}>
        {title}
      </PageHeaderTitle>
      <PageHeaderActions actions={placed} phone={trailing} desktop={desktopActions} />
    </PageHeaderRoot>
  );
}

/**
 * The page header, composed from parts:
 *
 * ```tsx
 * <PageHeader>
 *   <PageHeader.Context crumbs={trail} />
 *   <PageHeader.Title meta="LP-322 · 11 tracks">Mezzanine</PageHeader.Title>
 *   <PageHeader.Actions actions={albumActions} desktop={<ViewModeSwitch … />} />
 * </PageHeader>
 * <PageHeader.Toolbar>…</PageHeader.Toolbar>
 * ```
 *
 * Given `title`, it renders today's props API through the same parts.
 */
function PageHeader(props: PageHeaderProps) {
  if (props.title !== undefined) return <LegacyPageHeader {...props} />;
  return <PageHeaderRoot>{props.children}</PageHeaderRoot>;
}

PageHeader.Context = PageHeaderContext;
PageHeader.Title = PageHeaderTitle;
PageHeader.Actions = PageHeaderActions;
PageHeader.Tabs = PageHeaderTabs;
PageHeader.Toolbar = PageHeaderToolbar;

export default PageHeader;
