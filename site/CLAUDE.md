# site

The GrooveNet marketing site: Astro 7, static output, `@astrojs/sitemap`, deployed
by Netlify to https://groovenet.publicvinylradio.com. Moved here from the old
`groovenet-site` repo in #910.

A standalone package with its own `package-lock.json`, **not** an npm workspace.
It keeps its own TypeScript for `astro check`, so the root TypeScript 6 alias
doesn't apply here.

## Run

```bash
just bootstrap-site   # npm ci --prefix site (also part of just bootstrap)
just site-dev         # astro dev
just site-build       # astro check && astro build, into site/dist
just site-preview     # serve the built site
```

Marketing routes live in `src/pages` (`/`, `/about`); the landing page is one
component per section in `src/components` (`Hero`, `Interfaces`, `Appearance`,
`Roadmap`), so a new section from the design slots in as another component.
The design is the Claude canvas linked from #914. No UI framework: the tabs,
the Appearance demo and the copy button are small inline `<script>`s.

## Palettes and fonts come from the app

`src/data/palettes.json` and `public/fonts/` are **generated**, never edited:
`just site-tokens` exports the app's palettes (`my-collection-search/src/app/palettes/`)
and font roles (`fontChoices.ts`) and copies the app's woff2 files and OFL
licences. `my-collection-search/src/app/siteTokens.test.ts` fails while the
committed copy differs, and checks the demo's text pairs reach 4.5:1 in every
palette and mode. Run `just site-tokens` after changing a palette or a font.
`src/lib/tokens.ts` turns the export into CSS: the page itself is Mono, light
or dark from `prefers-color-scheme`. The app ships Inter in 400–600 only, so
headings are 600, not the canvas's 800.

## Content

- **Screenshots:** `src/data/screenshots.ts` has one entry per slot, its
  `image` an imported PNG from `src/assets/screenshots/`; a slot without one
  renders a labelled placeholder. See "Refreshing screenshots" below.
- **Roadmap:** `src/data/roadmap.yml`, a content collection (`src/content.config.ts`).
  Real items only.
- **Copy** is from the design, checked against the code: the phone shots are
  the web app at 390px, and the native iOS app is an early client.
- **Docs:** Starlight at `/docs`, loaded from root `docs/` with `glob({ base:
  "../docs" })` in `src/content.config.ts`. Add a `.md` or `.mdx` file under
  getting-started, configuration, using or vinyl-tracking. Give it `title`,
  `description` and `sidebar.order` frontmatter; folder sidebars update automatically.
  Use `/docs/…/` links. Run `just format` after staging new Markdown: root docs
  are formatted even though `site/` is ignored by Prettier.
- **Release notes:** the docs loader reads root `CHANGELOG.md` at build time;
  never edit that release-please-owned file or commit a generated copy.
- **Docs theme:** `src/components/docs/` wraps the shared Header/Footer and adds
  search, theme controls and edit links. `src/styles/docs.css` maps Starlight
  variables to the same generated Mono tokens and self-hosted fonts as the landing page.
- `just site-build` runs `astro check`, builds Pagefind and checks all rendered
  internal links and anchors with `scripts/check-links.mjs`. A bad link fails
  the build. `npm test --prefix site` tests that guard. Check docs and marketing
  at desktop and phone widths in both themes before shipping.

## Refreshing screenshots

The PNGs are committed and taken by Playwright (`my-collection-search/e2e/screenshots.spec.ts`,
skipped unless `RUN_SCREENSHOTS=1`) against a worktree stack restored from the
prod seed. CI has no seeded stack, so they only change when someone runs:

```bash
just worktree-seed-prod && just worktree-up   # if the stack isn't prod-seeded yet
just site-screenshots                         # all shots, Sleeve, each in its own mode
just site-screenshots --palette riso --mode dark   # extra variants, for docs
```

Refresh them after a visible UI change, or with a new seed. The command
sets the palette through `PUT /api/settings/appearance` and puts the saved one
back afterwards, takes every shot at 2x (`<page>-<viewport>[-<palette>]-<mode>.png`),
then recompresses them losslessly (`scripts/compress-screenshots.mjs`).

- **Stable:** the clock, time zone, Spins month and Now playing queue are
  constants at the top of the spec. After a new seed, move `CLOCK` and
  `SPINS_MONTH` to the seed's date, and check `QUEUE_PLAYLIST_ID` still exists.
  A second run with no app change gives no diff.
- **Privacy:** the seed is the real collection. Look at every PNG before
  committing: no friend usernames other than the owner's, notes, listener or
  source names, emails, keys or hostnames. Hide anything new through the
  spec's `HIDE` list or a `mask`, or pick another view, and list it there.
- **Serving 2x:** a frame's `widths` must include twice its largest display
  width (`BrowserFrame` shows 760px, so 1520). Astro never upscales.

## Deploy

- Netlify's base directory must be `site/`; `netlify.toml` here holds the build
  command, `publish = "dist"`, Node 22 with npm 12.0.1 (`engines.npm`), the security headers and an `ignore`
  command, so commits touching only the app don't rebuild the site.
- CI (`site` job in `test.yml`) runs `npm ci` and the build for changes under
  `site/`, `docs/` and `CHANGELOG.md`. There's no Codecov hook.
- release-please excludes `site/` and `docs/` from the root release, so use
  `docs(site): …` for site work; it never bumps the app version.
- `site/` is in `.prettierignore`: `prettier-plugin-astro` changed the built HTML (inline-link whitespace, CSS inlining), so the site stays as moved.
