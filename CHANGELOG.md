# Changelog

## [0.2.1](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.2.0...v0.2.1) (2026-09-20)


### Bug Fixes

* **release:** keep workspace dependency ranges in step with versions ([#263](https://github.com/Public-Vinyl-Radio/groovenet/issues/263)) ([1d68be2](https://github.com/Public-Vinyl-Radio/groovenet/commit/1d68be26a0586f9e12b3edcc55f7a40b6050bcf7))
* **release:** release the client and CLI together ([#265](https://github.com/Public-Vinyl-Radio/groovenet/issues/265)) ([11a3be7](https://github.com/Public-Vinyl-Radio/groovenet/commit/11a3be7d81cec9dc5395f6ae54192af80fd3b104))

## [0.2.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.1.11...v0.2.0) (2026-09-20)


### ⚠ BREAKING CHANGES

* **cli:** remove the playback commands that never worked ([#261](https://github.com/Public-Vinyl-Radio/groovenet/issues/261))

### Features

* **cli:** remove the playback commands that never worked ([#261](https://github.com/Public-Vinyl-Radio/groovenet/issues/261)) ([75e5770](https://github.com/Public-Vinyl-Radio/groovenet/commit/75e5770dedd2f7f456ffaa5be940231800ffb5c3))
* **playlists:** add set metadata and history ([#257](https://github.com/Public-Vinyl-Radio/groovenet/issues/257)) ([f0e822c](https://github.com/Public-Vinyl-Radio/groovenet/commit/f0e822cce8abfb2aeb876f3c9e3225e5f914475b))


### Bug Fixes

* **albums:** correct vinyl side labels and identity hash mutation ([#245](https://github.com/Public-Vinyl-Radio/groovenet/issues/245)) ([fed0c13](https://github.com/Public-Vinyl-Radio/groovenet/commit/fed0c13d5d48308cd165479daec47d3a897f0224))
* **backup:** prevent concurrent Restic runs ([#241](https://github.com/Public-Vinyl-Radio/groovenet/issues/241)) ([5cfbb36](https://github.com/Public-Vinyl-Radio/groovenet/commit/5cfbb36cb2c2009f73d4e0aee8ab4b2909bdc241))
* **db:** keep the original error when a transaction rollback fails ([#243](https://github.com/Public-Vinyl-Radio/groovenet/issues/243)) ([58ad074](https://github.com/Public-Vinyl-Radio/groovenet/commit/58ad074c494e86f9ec5bed55cb00b3a0fa39526e))

## [0.1.11](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.1.10...v0.1.11) (2026-09-19)


### Bug Fixes

* **ci:** resolve CI warnings and pin Ubuntu runners ([#236](https://github.com/Public-Vinyl-Radio/groovenet/issues/236)) ([5c86a83](https://github.com/Public-Vinyl-Radio/groovenet/commit/5c86a83b5d04c2700bc0a2535838623fca7137d6))
* **release:** create separate Release Please PRs ([#234](https://github.com/Public-Vinyl-Radio/groovenet/issues/234)) ([c97e868](https://github.com/Public-Vinyl-Radio/groovenet/commit/c97e868ab98a2c501503b48635a8131e49ff472a))

## [0.1.10](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.1.9...v0.1.10) (2026-09-19)


### Features

* add optional developer tools nav and page ([#223](https://github.com/Public-Vinyl-Radio/groovenet/issues/223)) ([489b759](https://github.com/Public-Vinyl-Radio/groovenet/commit/489b7595199d42d7e29ab95ff387e9a22e780cea))
* **backup:** add repository monitoring ([#215](https://github.com/Public-Vinyl-Radio/groovenet/issues/215)) ([52ece6a](https://github.com/Public-Vinyl-Radio/groovenet/commit/52ece6aced72ae69996c933d32992168963796b9))
* **openapi:** document tracks/deleted and backup endpoints ([#233](https://github.com/Public-Vinyl-Radio/groovenet/issues/233)) ([d44330d](https://github.com/Public-Vinyl-Radio/groovenet/commit/d44330d382a1843d8064ac43e5ee9ee8c5492f43))

## [0.1.9](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.1.8...v0.1.9) (2026-09-13)


### Bug Fixes

* **worker:** use Python 3.13 for gamdl ([#209](https://github.com/Public-Vinyl-Radio/groovenet/issues/209)) ([01d9337](https://github.com/Public-Vinyl-Radio/groovenet/commit/01d9337db2db1bbe8a36165c5707e0a0e7bea259))

## [0.1.8](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.1.7...v0.1.8) (2026-09-13)


### Bug Fixes

* **client:** align track search with API ([#207](https://github.com/Public-Vinyl-Radio/groovenet/issues/207)) ([596d8c5](https://github.com/Public-Vinyl-Radio/groovenet/commit/596d8c5df7987559be50d2e5bbd2c8c8a3e5c5e7))

## [0.1.7](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.1.6...v0.1.7) (2026-09-13)


### Bug Fixes

* **cli:** publish from app releases only ([#205](https://github.com/Public-Vinyl-Radio/groovenet/issues/205)) ([db3225d](https://github.com/Public-Vinyl-Radio/groovenet/commit/db3225d4d7d1c24829428c59a19a641d6a3606f8))

## [0.1.6](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.1.5...v0.1.6) (2026-09-12)


### Features

* **albums:** enqueue album for enrichment ([#201](https://github.com/Public-Vinyl-Radio/groovenet/issues/201)) ([957354c](https://github.com/Public-Vinyl-Radio/groovenet/commit/957354c6966a948ee9c5b6408819749596644f00))


### Bug Fixes

* **albums:** sort recently added by Groovenet import time ([#196](https://github.com/Public-Vinyl-Radio/groovenet/issues/196)) ([d0bd652](https://github.com/Public-Vinyl-Radio/groovenet/commit/d0bd652e926b747d0ac8d8a3c3916f8a40e4055a))
* **build:** configure Node types for TypeScript 7 ([#194](https://github.com/Public-Vinyl-Radio/groovenet/issues/194)) ([79fd18f](https://github.com/Public-Vinyl-Radio/groovenet/commit/79fd18f89b61ae7474cc422c281e749f56c1c6fe))
* render env non-interactively with op inject --force ([#163](https://github.com/Public-Vinyl-Radio/groovenet/issues/163)) ([2e55f42](https://github.com/Public-Vinyl-Radio/groovenet/commit/2e55f42a3356ec9e2f584c8d015a8a85b58fff81))

## [0.1.5](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.1.4...v0.1.5) (2026-09-11)


### Features

* reorder playlist PDF export columns to #, ID, Pos ([#157](https://github.com/Public-Vinyl-Radio/groovenet/issues/157)) ([fde40a7](https://github.com/Public-Vinyl-Radio/groovenet/commit/fde40a7fd368ad47a485bd643b9b2fe41a44506b))
* unify track actions menu across card, view, and edit ([#162](https://github.com/Public-Vinyl-Radio/groovenet/issues/162)) ([1b3f888](https://github.com/Public-Vinyl-Radio/groovenet/commit/1b3f88844c1a946ac73ef04bc404df9fb9e85263))


### Bug Fixes

* keep myapp network alias so Caddy resolves the webapp ([#160](https://github.com/Public-Vinyl-Radio/groovenet/issues/160)) ([4bb805f](https://github.com/Public-Vinyl-Radio/groovenet/commit/4bb805f6011a13e95fc7dbbf5fcdd6de7ebf38f4))
* stop standalone build from tracing the whole project ([#159](https://github.com/Public-Vinyl-Radio/groovenet/issues/159)) ([befbe45](https://github.com/Public-Vinyl-Radio/groovenet/commit/befbe458ac07a5964a4e8be8be77b979a8e390ef))

## [0.1.4](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.1.3...v0.1.4) (2026-09-07)


### Features

* add update-available check to the About page ([#154](https://github.com/Public-Vinyl-Radio/groovenet/issues/154)) ([5bd9af7](https://github.com/Public-Vinyl-Radio/groovenet/commit/5bd9af7688fa8d98eeada8f2118d254cb4370948))

## [0.1.3](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.1.2...v0.1.3) (2026-09-07)


### Bug Fixes

* build webapp image from the runner stage (not migrator) ([#152](https://github.com/Public-Vinyl-Radio/groovenet/issues/152)) ([1657610](https://github.com/Public-Vinyl-Radio/groovenet/commit/16576107c39a29343a981f3b91f70fdc9fedbd38))

## [0.1.2](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.1.1...v0.1.2) (2026-09-06)


### Performance Improvements

* standalone webapp image, amd64-only builds, rename myapp to webapp ([#150](https://github.com/Public-Vinyl-Radio/groovenet/issues/150)) ([98c5d34](https://github.com/Public-Vinyl-Radio/groovenet/commit/98c5d34466a7edb4e3b6d57106cb9f60c6be3e7c))

## [0.1.1](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.1.0...v0.1.1) (2026-09-06)


### Features

* About page, GrooveNet favicon, and release versioning system ([#148](https://github.com/Public-Vinyl-Radio/groovenet/issues/148)) ([75cb5cd](https://github.com/Public-Vinyl-Radio/groovenet/commit/75cb5cd8f52505a9b98b10ecb5c8faa9b0227563))


### Bug Fixes

* cache pg Pool in production to prevent connection exhaustion ([78ea8d2](https://github.com/Public-Vinyl-Radio/groovenet/commit/78ea8d225e82378bc4de2fcb85076588ceb93738))
* **ci:** add yaml peer dep for npm ci lockfile sync ([875ba92](https://github.com/Public-Vinyl-Radio/groovenet/commit/875ba9227905a7ca4cab63e5ca451186aff6d143))
* stringify manifest releaseIds to prevent .replace() crash ([83394b9](https://github.com/Public-Vinyl-Radio/groovenet/commit/83394b991f09f1cdb7c98b5c04807c8ab2ae5d75))
* stringify manifest releaseIds to prevent .replace() crash ([1187758](https://github.com/Public-Vinyl-Radio/groovenet/commit/11877588b6dfab9f3718b157f7bf29d028c7fd55))
