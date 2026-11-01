# GrooveNet site

The standalone marketing website for [GrooveNet](https://github.com/Public-Vinyl-Radio/groovenet), the open-source, self-hosted vinyl collection management system maintained by [Public Vinyl Radio](https://publicvinylradio.com).

Production URL: https://groovenet.publicvinylradio.com

This site lives in the GrooveNet repository under `site/`. See [CLAUDE.md](CLAUDE.md) for how it is built, deployed and kept out of app releases.

## Local development

Requirements: the Node and npm pinned in the repository's `.mise.toml`. From the repository root:

```bash
just bootstrap-site   # npm ci --prefix site
just site-dev
```

Run validation and create the deployable static output:

```bash
just site-build   # astro check && astro build
just site-preview
```

Astro writes the static production site to `dist/`.

## Project structure

```
src/
  components/     Shared site components and architecture diagram
  layouts/        Base layout, global styling, SEO metadata
  pages/          Astro routes: /, /about, /docs
public/           Favicon, social image, and the verified GrooveNet demo asset
netlify.toml      Netlify build configuration and security headers
```

Most page copy lives directly in the route files. Shared navigation and footer material lives in `src/components`; global metadata and styles are in `src/layouts/BaseLayout.astro`. When GrooveNet capabilities change, update the relevant page copy against the main [GrooveNet README](https://github.com/Public-Vinyl-Radio/groovenet#readme).

## Netlify deployment

Netlify builds this directory: set the site's base directory to `site/`. Netlify then reads `netlify.toml`: build command `npm run build`, publish directory `dist`, and an `ignore` command that skips builds for commits touching neither `site/`, `docs/` nor `CHANGELOG.md`. The custom domain is `groovenet.publicvinylradio.com`.

## Links

- [GrooveNet application](https://github.com/Public-Vinyl-Radio/groovenet)
- [GrooveNet releases](https://github.com/Public-Vinyl-Radio/groovenet/releases)
- [GrooveNet issues](https://github.com/Public-Vinyl-Radio/groovenet/issues)
- [Public Vinyl Radio](https://publicvinylradio.com)
