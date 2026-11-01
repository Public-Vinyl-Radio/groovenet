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
  components/     One component per landing-page section, plus header, footer and frames
  data/           roadmap.yml, screenshot slots, and palettes.json (generated: just site-tokens)
  layouts/        Base layout: metadata, self-hosted fonts, Mono palette tokens
  lib/            Turns the palette export into CSS
  pages/          Astro routes: /, /about, /docs
  styles/         Global styles
public/           Favicon, social card, robots.txt, and fonts (generated: just site-tokens)
netlify.toml      Netlify build configuration and security headers
```

Landing-page copy lives in its section component; the roadmap in `src/data/roadmap.yml`. Palettes and fonts are exported from the app, so never edit `src/data/palettes.json` or `public/fonts/` by hand. When GrooveNet capabilities change, update the relevant page copy against the main [GrooveNet README](https://github.com/Public-Vinyl-Radio/groovenet#readme).

## Netlify deployment

Netlify builds this directory: set the site's base directory to `site/`. Netlify then reads `netlify.toml`: build command `npm run build`, publish directory `dist`, and an `ignore` command that skips builds for commits touching neither `site/`, `docs/` nor `CHANGELOG.md`. The custom domain is `groovenet.publicvinylradio.com`.

## Links

- [GrooveNet application](https://github.com/Public-Vinyl-Radio/groovenet)
- [GrooveNet releases](https://github.com/Public-Vinyl-Radio/groovenet/releases)
- [GrooveNet issues](https://github.com/Public-Vinyl-Radio/groovenet/issues)
- [Public Vinyl Radio](https://publicvinylradio.com)
