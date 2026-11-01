# site

The GrooveNet marketing site: Astro 5, static output, `@astrojs/sitemap`, deployed
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

Route copy lives in `src/pages` (`/`, `/about`, `/docs`); shared pieces in
`src/components` and `src/layouts`.

## Content

The pages are hand-written Astro for now. Docs will be built with Starlight from
the repo-root `docs/` tree (#911) and screenshots will come from Playwright
against a prod-seeded stack (#912).

## Deploy

- Netlify's base directory must be `site/`; `netlify.toml` here holds the build
  command, `publish = "dist"`, Node 22, the security headers and an `ignore`
  command, so commits touching only the app don't rebuild the site.
- CI (`site` job in `test.yml`) runs `npm ci` and the build for changes under
  `site/`, `docs/` and `CHANGELOG.md`. There's no Codecov hook.
- release-please excludes `site/` and `docs/` from the root release, so use
  `docs(site): …` for site work; it never bumps the app version.
- `site/` is in `.prettierignore`: `prettier-plugin-astro` changed the built HTML (inline-link whitespace, CSS inlining), so the site stays as moved.
