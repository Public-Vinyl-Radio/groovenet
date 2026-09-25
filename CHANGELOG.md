# Changelog

## [0.2.6](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.2.5...v0.2.6) (2026-09-25)


### Features

* **obs:** add the vinyl pipeline debug page ([#309](https://github.com/Public-Vinyl-Radio/groovenet/issues/309)) ([d42c7ef](https://github.com/Public-Vinyl-Radio/groovenet/commit/d42c7ef2b6f412b5e82da5792fb628a4ddab884e))


### Bug Fixes

* **ingest:** chown the audio-ingest volume at startup ([#311](https://github.com/Public-Vinyl-Radio/groovenet/issues/311)) ([78b2ab4](https://github.com/Public-Vinyl-Radio/groovenet/commit/78b2ab48b11172819a305a3108add747dba60d8b))
* **restore:** stop using DROP OWNED on full restores ([#310](https://github.com/Public-Vinyl-Radio/groovenet/issues/310)) ([ee8dd8e](https://github.com/Public-Vinyl-Radio/groovenet/commit/ee8dd8e3bf15772803912ffe029da1445a649aef))

## [0.2.5](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.2.4...v0.2.5) (2026-09-22)


### Features

* **fingerprints:** index new audio automatically instead of by hand ([#305](https://github.com/Public-Vinyl-Radio/groovenet/issues/305)) ([299e42b](https://github.com/Public-Vinyl-Radio/groovenet/commit/299e42b561e169e827a1061e358bf11b3de64da6))


### Bug Fixes

* **ingest:** make the audio-ingest volume writable by the app ([#301](https://github.com/Public-Vinyl-Radio/groovenet/issues/301)) ([6ee2225](https://github.com/Public-Vinyl-Radio/groovenet/commit/6ee2225fb6699738558b4406a01c2ab2994c2739))
* **matcher:** refuse a query window with too little fingerprint variety ([#307](https://github.com/Public-Vinyl-Radio/groovenet/issues/307)) ([c40cfcf](https://github.com/Public-Vinyl-Radio/groovenet/commit/c40cfcf857fb14de1629c5e1e5c7caaaa2a9a8f8))
* **spins:** wire play aggregation into a trigger and a scheduler ([#308](https://github.com/Public-Vinyl-Radio/groovenet/issues/308)) ([d18bda6](https://github.com/Public-Vinyl-Radio/groovenet/commit/d18bda605fc0d56d5da4403ff0b273d7f9b26ccc))

## [0.2.4](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.2.3...v0.2.4) (2026-09-21)


### Features

* **obs:** read APIs and CLI for the vinyl ingest pipeline ([#300](https://github.com/Public-Vinyl-Radio/groovenet/issues/300)) ([7dc74cc](https://github.com/Public-Vinyl-Radio/groovenet/commit/7dc74cc8360cc341f604c0008b861d77ca1be846))
* **spins:** aggregate detections into automatic sessions ([#296](https://github.com/Public-Vinyl-Radio/groovenet/issues/296)) ([2045bc8](https://github.com/Public-Vinyl-Radio/groovenet/commit/2045bc8678c91faa18a78073da16d2b0f4029036))

## [0.2.3](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.2.2...v0.2.3) (2026-09-21)


### Bug Fixes

* **deploy:** default the fingerprint matcher to chromaprint ([#295](https://github.com/Public-Vinyl-Radio/groovenet/issues/295)) ([925324f](https://github.com/Public-Vinyl-Radio/groovenet/commit/925324f949b1dfa177dc9b6d6b74908cfd39b95c))

## [0.2.2](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.2.1...v0.2.2) (2026-09-21)


### Features

* **api:** POST /api/audio/ingest for vinyl listener audio chunks ([#293](https://github.com/Public-Vinyl-Radio/groovenet/issues/293)) ([4c51a39](https://github.com/Public-Vinyl-Radio/groovenet/commit/4c51a39173af8f1b6b1f325ba398bff85743ab4b))
* **api:** queue ingested audio and manage the ingest lifecycle ([#294](https://github.com/Public-Vinyl-Radio/groovenet/issues/294)) ([a96dbe0](https://github.com/Public-Vinyl-Radio/groovenet/commit/a96dbe0565a027d1b116edb5c61f9956db5de971))
* **cli:** groovenet fingerprint-library reference indexing command ([#288](https://github.com/Public-Vinyl-Radio/groovenet/issues/288)) ([a16cf63](https://github.com/Public-Vinyl-Radio/groovenet/commit/a16cf6351f8c70c4d37c47ff22dc62173133168d))
* **db:** add audio ingest records ([#286](https://github.com/Public-Vinyl-Radio/groovenet/issues/286)) ([5d5347f](https://github.com/Public-Vinyl-Radio/groovenet/commit/5d5347f919d941d78db25a20ad8b2b42ce635f88))
* **db:** add raw play detections ([#289](https://github.com/Public-Vinyl-Radio/groovenet/issues/289)) ([cb0c285](https://github.com/Public-Vinyl-Radio/groovenet/commit/cb0c2856cb0ef567694a02c5a5673e6873823e88))
* **db:** add reference fingerprint index schema ([#285](https://github.com/Public-Vinyl-Radio/groovenet/issues/285)) ([c9e1a03](https://github.com/Public-Vinyl-Radio/groovenet/commit/c9e1a03aa01548e0a399c2ef178739958d71affa))
* **infra:** sweep the audio ingest volume on a retention policy ([#290](https://github.com/Public-Vinyl-Radio/groovenet/issues/290)) ([dc38c55](https://github.com/Public-Vinyl-Radio/groovenet/commit/dc38c55353599ee432462f95a8631d463e1087a4))
* **service:** fingerprint-service skeleton with stubbed matcher ([#287](https://github.com/Public-Vinyl-Radio/groovenet/issues/287)) ([3c23983](https://github.com/Public-Vinyl-Radio/groovenet/commit/3c239835866b4d56751a9a11489c59d655165c31))
* **service:** match ingested audio against the reference fingerprint index ([#292](https://github.com/Public-Vinyl-Radio/groovenet/issues/292)) ([5a28ebc](https://github.com/Public-Vinyl-Radio/groovenet/commit/5a28ebc1472379d19394a0d0d06daf335b54e261))


### Bug Fixes

* **build:** silence runtime path tracing warnings ([#291](https://github.com/Public-Vinyl-Radio/groovenet/issues/291)) ([8b95cdc](https://github.com/Public-Vinyl-Radio/groovenet/commit/8b95cdc4981abf41846accbd8f9028c1b68ba0ad))
* **dev:** skip NFS mount when host is unset ([#283](https://github.com/Public-Vinyl-Radio/groovenet/issues/283)) ([7af6519](https://github.com/Public-Vinyl-Radio/groovenet/commit/7af65192e4c96674652babc9746a0dd17e09106c))

## [0.2.1](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.2.0...v0.2.1) (2026-09-20)


### Bug Fixes

* **release:** keep workspace dependency ranges in step with versions ([#263](https://github.com/Public-Vinyl-Radio/groovenet/issues/263)) ([1d68be2](https://github.com/Public-Vinyl-Radio/groovenet/commit/1d68be26a0586f9e12b3edcc55f7a40b6050bcf7))
* **release:** put every package in one release PR ([#267](https://github.com/Public-Vinyl-Radio/groovenet/issues/267)) ([a092b03](https://github.com/Public-Vinyl-Radio/groovenet/commit/a092b03098b67248c8cdc58484487af7ea0e90c7))
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
