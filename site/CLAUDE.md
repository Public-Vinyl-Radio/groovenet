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
component per section in `src/components` (`Hero`, `Features`, `Interfaces`,
`Appearance`, `Roadmap`), so a new section from the design slots in as another component.
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
- **Features:** card copy, docs links, icons and screenshot keys live in
  `src/data/features.ts`. Slots with an `imageDark` follow the visitor's mode.
  Two lead cards (set sheet, Play on) keep their HTML stand-ins on purpose; the
  real shots live in the docs (#939).
- **Roadmap:** generated at build time from GitHub issue labels (below), with
  `src/data/roadmap.yml` as the fallback. Real items only.
- **Copy** is from the design, checked against the code: the phone shots are
  the web app at 390px, and the native iOS app is an early client.
- **Docs:** Starlight at `/docs`, loaded from root `docs/` with `glob({ base:
  "../docs" })` in `src/content.config.ts`. Add a `.md` or `.mdx` file under
  getting-started, configuration, using or vinyl-tracking. Give it `title`,
  `description` and `sidebar.order` frontmatter; folder sidebars update automatically.
  Use `/docs/…/` links. Run `just format` after staging new Markdown: root docs
  are formatted even though `site/` is ignored by Prettier.
- **Docs screenshots:** plain Markdown `![alt](…/x-light.png)`. `src/lib/theme-screenshots.mjs`
  (a Sätteri plugin pair, Astro 7's default processor; tests in `theme-screenshots.test.mjs`)
  adds the `-dark.png` sibling when it exists, and `docs.css` shows one by
  `:root[data-theme]`, never `prefers-color-scheme`. `starlight-image-zoom` (pinned)
  zooms the visible one. An image with no `-dark` pair, such as `set-sheet-pdf.png`
  (black on white, bordered), renders unchanged. Both twins keep the alt text.
- **Release notes:** the docs loader reads root `CHANGELOG.md` at build time;
  never edit that release-please-owned file or commit a generated copy.
- **Docs theme:** `src/components/docs/` wraps the shared Header/Footer and adds
  search, theme controls and edit links. `src/styles/docs.css` maps Starlight
  variables to the same generated Mono tokens and self-hosted fonts as the landing page.
- `just site-build` runs `astro check`, builds Pagefind and checks all rendered
  internal links and anchors with `scripts/check-links.mjs`. A bad link fails
  the build. `npm test --prefix site` tests that guard. Check docs and marketing
  at desktop and phone widths in both themes before shipping.

## Roadmap

`src/lib/roadmap.mjs` fetches open issues labelled `roadmap:now`, `roadmap:next`
and `roadmap:later` from the GitHub REST API; `src/content.config.ts` loads them
into the `roadmap` collection that `Roadmap.astro` renders. Items link to their
issue. Within a column: milestone first (by due date), then oldest first.
Unlabelled and closed issues don't appear.

Site copy lives in the issue body, as an HTML comment (invisible on GitHub):

```
<!-- roadmap
title: Weekly wantlist recommendations
note: Records to look for, drawn from what you play.
-->
```

Other fields are ignored. Without a marker with a non-empty `title:`, the issue
is skipped and the build logs a warning naming it. Empty columns are omitted.

- **`GITHUB_TOKEN`** (optional, Netlify env var): a fine-grained, read-only token
  for the public repo. Without it, requests are unauthenticated: 60 an hour per
  IP, and Netlify's build IPs are shared.
- **Fallback:** a failed request, a ~5 s timeout or no usable roadmap items uses the
  committed `roadmap.yml` and logs why. A GitHub outage never fails a deploy.
  `just site-roadmap` rewrites that file from GitHub (and leaves it alone when
  no usable items remain).
- **Daily refresh:** `.github/workflows/site-roadmap.yml` POSTs the
  `NETLIFY_BUILD_HOOK` repo secret once a day, and skips when it's unset.
- **Tests:** `npm test --prefix site` (`node:test`, no dependencies, fetch mocked).

## Refreshing screenshots

The PNGs are committed and taken by Playwright (`my-collection-search/e2e/screenshots.spec.ts`,
skipped unless `RUN_SCREENSHOTS=1`) against a worktree stack restored from the
prod seed. CI has no seeded stack, so they only change when someone runs:

```bash
just worktree-seed-prod && just worktree-up   # if the stack isn't prod-seeded yet
just site-screenshots                         # all shots, Mono light/dark + one hero per palette
just site-screenshots --palette riso --mode dark   # extra variants, for docs
just site-screenshots --only settings --out /tmp/settings-before   # scratch copy, nothing committed
```

- `--only <prefix>` takes just the files whose name starts with it (`settings`,
  `home-desktop`); a prefix that matches nothing fails. It combines with
  `--palette` and `--mode`.
- `--out <dir>` writes there (created if missing) instead of `src/assets/screenshots/`,
  skips compression, and includes the `reference` shots below.

Refresh them after a visible UI change, or with a new seed. The command
sets the palette through `PUT /api/settings/appearance` and puts the saved one
back afterwards, takes every shot at 2x (`<page>-<viewport>[-<palette>]-<mode>.png`),
then recompresses them losslessly (`scripts/compress-screenshots.mjs`). The 2x PNGs
are exempt from the 1 MiB pre-commit limit; keep that exception limited to this asset directory.

- **Stable:** the clock, time zone, Spins month and Now playing queue are
  constants at the top of the spec. After a new seed, move `CLOCK` and
  `SPINS_MONTH` to the seed's date, and check `QUEUE_PLAYLIST_ID` still exists.
  A second run with no app change gives no diff.
- **Content:** collection data is public; no privacy masks are needed. Only
  developer controls, toasts and Home's live Now playing card are hidden for stability.
  Settings is the exception: it shows credentials and personal data, so those
  shots run `maskSettings` in the spec before capture, replacing Discogs
  usernames with `collector-N`, emails, token-like strings, backup hosts and
  server paths, and password inputs. Add a rule there when a section grows a new
  field that holds a secret, and check every Settings image by eye.
- **Reference shots:** the Settings sections (`settings-<id>-<viewport>[-<palette>]-<mode>.png`,
  28 of them, full page) are marked `reference: true` in the spec. They are not
  used by the site, so a plain run skips them; only `--only` or `--out` takes them.
  Don't commit them. If a docs page needs one, reference it from
  `src/data/screenshots.ts` or Markdown and drop `reference` for that shot.
  `appearance-desktop-*` is the older viewport crop the docs use; it is unchanged.
- **Docs:** all pages get Mono light and dark versions. The default run also
  captures a Home hero in Sleeve, Riso and Midnight. `--palette` selects just
  that palette; `--mode` selects one mode. Mono filenames omit the palette suffix.
  Fixed album and genre routes are next to the clock constants in the spec.
  The optimiser shot shows its actions menu; enrichment shows setup, so neither
  invokes a service or changes collection data. Link images from `docs/using/` with
  `../../site/src/assets/screenshots/<file>.png` Markdown paths; Astro processes them at build time.
- **Serving 2x:** a frame's `widths` must include twice its largest display
  width (`BrowserFrame` shows 760px, so 1520). Astro never upscales.

### Player TUI screenshots

`tui-<view>.png` and `tui-queue-browse.gif` are the `groovenet player` TUI
(#931), on the CLI docs page only; the landing page keeps its stand-ins. Same
prod-seeded stack, its own command:

```bash
just site-tui-screenshots              # every TUI shot, then compress
just site-tui-screenshots --calibrate  # check the cell grid (font, size) against METRICS
```

- **Tools:** VHS through mise (`vhs@0.12.1`), plus `ttyd`, `ffmpeg` and `mpv`
  from Homebrew (mise has no macOS ttyd). The recipe checks each and says what
  to install. The tapes pin JetBrains Mono, so it must be installed.
- **Playback is real and silent:** the recipe makes a throwaway home in
  `/tmp/gntui.*` (CLI config pointing at `APP_PORT`, `mpv.conf` with
  `mute=yes`, its own daemon socket; never `~/.groovenet`), queues playlist 176,
  seeks to 1:37 and pauses, so elapsed time never moves. Every tape opens the
  TUI on that daemon through `tui-tapes/player.sh`, and the daemon is stopped
  and the home removed on exit.
- **Tapes:** `tui-tapes/<shot>.tape`, sharing `config.tape` (font, size,
  padding, 120×40 cells, a Mono-dark theme). They wait for text, not just time,
  and pick fixed entities: the Mezzanine album search and the FLOW STATE
  playlist (175). Raw captures land in `tui-tapes/.out/` (ignored).
- **Covers in post:** xterm.js has no Kitty graphics, so the TUI runs with
  `GROOVENET_TUI_ART=off` and `GROOVENET_TUI_ART_SLOTS=<file>`, and reports each
  art slot as a cell rectangle with its cover URLs. `scripts/tui-screenshots.mjs`
  turns cells into pixels with the calibrated `METRICS` (documented there),
  checks the terminal was 120×40 and the slot count is right, fetches the cover
  from the app and pastes it in at capture resolution; for the GIF, ffmpeg
  overlays it on the clip (one track, so the slot never moves). Pure helpers
  are tested in `tui-screenshots.test.mjs`.
- **Stable:** two runs give byte-identical PNGs. The GIF's frame timing can
  shift by a frame between runs. `tui-devices.png` lists the capturing
  machine's own mpv outputs, so it changes with the machine.
- **Changing the look:** after editing `config.tape`, run `--calibrate` and
  update `METRICS` and its comment from the measured values.

## Deploy

Netlify skips unchanged content via `scripts/netlify-ignore.sh` (hooks always build); watched paths mirror `.github/scripts/ci-changes.mjs` and are checked by `npm test`.

- Netlify's base directory must be `site/`; `netlify.toml` here holds the build
  command, `publish = "dist"`, Node 22 with npm 12.0.1 (`engines.npm`), the security headers and an `ignore`
  command, so commits touching only the app don't rebuild the site.
- CI (`site` job in `test.yml`) runs `npm ci` and the build for changes under
  `site/`, `docs/` and `CHANGELOG.md`. There's no Codecov hook.
- release-please excludes `site/` and `docs/` from the root release, so use
  `docs(site): …` for site work; it never bumps the app version.
- `site/` is in `.prettierignore`: `prettier-plugin-astro` changed the built HTML (inline-link whitespace, CSS inlining), so the site stays as moved.
