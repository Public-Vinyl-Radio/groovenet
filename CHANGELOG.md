# Changelog

## [0.3.14](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.3.13...v0.3.14) (2026-10-31)


### Features

* **api:** home summary endpoint ([#886](https://github.com/Public-Vinyl-Radio/groovenet/issues/886)) ([9db0b84](https://github.com/Public-Vinyl-Radio/groovenet/commit/9db0b84143463be75640c7ef850fdcac7b1a3d27))
* **nav:** move Tracks to /tracks and add Home to the nav ([#885](https://github.com/Public-Vinyl-Radio/groovenet/issues/885)) ([a2ecfee](https://github.com/Public-Vinyl-Radio/groovenet/commit/a2ecfeefee4a7204a060a446db30d06da0660223))
* **player:** add macOS Now Playing and media controls ([#871](https://github.com/Public-Vinyl-Radio/groovenet/issues/871)) ([53f9345](https://github.com/Public-Vinyl-Radio/groovenet/commit/53f9345aaa0ddf600f5c9c5b7d6c06d9e468aca9))
* **spins:** configured display time zone ([#868](https://github.com/Public-Vinyl-Radio/groovenet/issues/868)) ([7fc859b](https://github.com/Public-Vinyl-Radio/groovenet/commit/7fc859b6421054d45e17b88d03fcb74542718a16))
* **spins:** medium filter and cursor paging on the spin list API ([#872](https://github.com/Public-Vinyl-Radio/groovenet/issues/872)) ([c108156](https://github.com/Public-Vinyl-Radio/groovenet/commit/c108156cfcc5dc0e46cc8157c34f84da25a89289))
* **spins:** monthly recap endpoint ([#873](https://github.com/Public-Vinyl-Radio/groovenet/issues/873)) ([3a3c2ef](https://github.com/Public-Vinyl-Radio/groovenet/commit/3a3c2ef35bc88c40b841eb6146cb63e382156361))
* **spins:** monthly recap page ([#877](https://github.com/Public-Vinyl-Radio/groovenet/issues/877)) ([90aedd9](https://github.com/Public-Vinyl-Radio/groovenet/commit/90aedd9a80e8dd04554e3d4d1fdbca4c15d67398))
* **spins:** record the player output on digital spins ([#876](https://github.com/Public-Vinyl-Radio/groovenet/issues/876)) ([b438bc4](https://github.com/Public-Vinyl-Radio/groovenet/commit/b438bc453a27a6462c55fafa3d6e0315c0d2f2d1))
* **spins:** redesign the spins page as a listening log ([#874](https://github.com/Public-Vinyl-Radio/groovenet/issues/874)) ([836958a](https://github.com/Public-Vinyl-Radio/groovenet/commit/836958a0c91e8e54de0bf0e9420372793c4bb9d7))
* **spins:** spin detail panel (desktop) and modal (phone) ([#875](https://github.com/Public-Vinyl-Radio/groovenet/issues/875)) ([f7529da](https://github.com/Public-Vinyl-Radio/groovenet/commit/f7529da3b487c5d7c522388cae5795d044282aff))

## [0.3.13](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.3.12...v0.3.13) (2026-10-30)


### Bug Fixes

* **dev:** single TypeScript version and a clean bootstrap ([#857](https://github.com/Public-Vinyl-Radio/groovenet/issues/857)) ([4d2f63f](https://github.com/Public-Vinyl-Radio/groovenet/commit/4d2f63f5715b57b19f5e0250ea832196586ed917))

## [0.3.12](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.3.11...v0.3.12) (2026-10-29)


### Features

* **cli:** show album art in the player TUI ([#851](https://github.com/Public-Vinyl-Radio/groovenet/issues/851)) ([85aa553](https://github.com/Public-Vinyl-Radio/groovenet/commit/85aa5532ad16d8e0cbc28652ff53fdef122790ca))


### Bug Fixes

* preserve Discogs date_added on album edits and import it onto tracks ([#849](https://github.com/Public-Vinyl-Radio/groovenet/issues/849)) ([2d86ab0](https://github.com/Public-Vinyl-Radio/groovenet/commit/2d86ab0a1d7882b2635c864a4a6608a7d548e1a9))

## [0.3.11](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.3.10...v0.3.11) (2026-10-28)


### Features

* **cli:** add player TUI Play on picker and runtime targets ([#846](https://github.com/Public-Vinyl-Radio/groovenet/issues/846)) ([893a00d](https://github.com/Public-Vinyl-Radio/groovenet/commit/893a00dd3b802ed0c5592bc511d07e7a9e661211))
* **cli:** add player TUI playlists view ([#845](https://github.com/Public-Vinyl-Radio/groovenet/issues/845)) ([4dbdd9a](https://github.com/Public-Vinyl-Radio/groovenet/commit/4dbdd9af4cea44e0ffeb7d590917b2ae44a1c479))
* **cli:** add player TUI search for tracks and albums ([#844](https://github.com/Public-Vinyl-Radio/groovenet/issues/844)) ([87dd22d](https://github.com/Public-Vinyl-Radio/groovenet/commit/87dd22d0d82b0d3c70c3e31b79233372fc6c9b80))
* **cli:** configurable keymap for the player TUI ([#835](https://github.com/Public-Vinyl-Radio/groovenet/issues/835)) ([972a865](https://github.com/Public-Vinyl-Radio/groovenet/commit/972a865b15cceef85bcf547a6ad9fd1e63498f08))
* **cli:** groovenet status segment for tmux and status bars ([#833](https://github.com/Public-Vinyl-Radio/groovenet/issues/833)) ([d94b991](https://github.com/Public-Vinyl-Radio/groovenet/commit/d94b991ee5b2be2b5a239df59f1bff8e175b32e0))
* **cli:** player TUI foundation with ANSI theme, primitives and responsive layouts ([#838](https://github.com/Public-Vinyl-Radio/groovenet/issues/838)) ([c8a7a07](https://github.com/Public-Vinyl-Radio/groovenet/commit/c8a7a07f75e8e3ff5faa3b0f9932d242f3920484))
* **cli:** player TUI queue view, Now Playing card and bottom strip ([#840](https://github.com/Public-Vinyl-Radio/groovenet/issues/840)) ([a4aadcf](https://github.com/Public-Vinyl-Radio/groovenet/commit/a4aadcf42caa937b5f68ecb64042c553a3bce08e))
* **genres:** add build this crate state for thin genres ([#834](https://github.com/Public-Vinyl-Radio/groovenet/issues/834)) ([4287eac](https://github.com/Public-Vinyl-Radio/groovenet/commit/4287eac966a074353015431f30bd6a515730060b))
* **genres:** build albums-first genre detail pages ([#831](https://github.com/Public-Vinyl-Radio/groovenet/issues/831)) ([955598a](https://github.com/Public-Vinyl-Radio/groovenet/commit/955598afdce11fdf1836514dedbc741c84d44632))
* **genres:** turn index into a collection discovery page ([#818](https://github.com/Public-Vinyl-Radio/groovenet/issues/818)) ([8458a78](https://github.com/Public-Vinyl-Radio/groovenet/commit/8458a788ab2b0678345baacf1daab2941c169366))
* **player:** add a third OwnTone engine for a Bedroom server player ([#843](https://github.com/Public-Vinyl-Radio/groovenet/issues/843)) ([96b1318](https://github.com/Public-Vinyl-Radio/groovenet/commit/96b13181ff4cf419c12555476c70f506588fbcff))
* **player:** add atomic session joins and all-player events ([#836](https://github.com/Public-Vinyl-Radio/groovenet/issues/836)) ([156f0eb](https://github.com/Public-Vinyl-Radio/groovenet/commit/156f0eb5ab542145f0a90c40a9565d22e1d70771))


### Bug Fixes

* **ui:** constrain long album tracklist titles ([#837](https://github.com/Public-Vinyl-Radio/groovenet/issues/837)) ([a500345](https://github.com/Public-Vinyl-Radio/groovenet/commit/a500345750ca471c80696184bf5b368233731ef7))

## [0.3.10](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.3.9...v0.3.10) (2026-10-26)


### Features

* **api:** playlist list returns covers, set data and collaborator ([#778](https://github.com/Public-Vinyl-Radio/groovenet/issues/778)) ([db8a07f](https://github.com/Public-Vinyl-Radio/groovenet/commit/db8a07fcdf3779b7517a9bdb7d4b3d5029472629))
* **player:** allow commands without expected revision ([#810](https://github.com/Public-Vinyl-Radio/groovenet/issues/810)) ([f2fe8ef](https://github.com/Public-Vinyl-Radio/groovenet/commit/f2fe8ef5b59a0b27b08d5969b4d67c2a35126679))
* **player:** atomic queue replacement and HA sender recognition ([#807](https://github.com/Public-Vinyl-Radio/groovenet/issues/807)) ([2e20762](https://github.com/Public-Vinyl-Radio/groovenet/commit/2e20762575314edccc73adb0a93182b0d901c00b))
* **player:** log server player plays per queue entry ([#814](https://github.com/Public-Vinyl-Radio/groovenet/issues/814)) ([facd807](https://github.com/Public-Vinyl-Radio/groovenet/commit/facd807989d20046c17716cec4c6dbe295521cd3))
* **player:** make browser session lifetime configurable ([#808](https://github.com/Public-Vinyl-Radio/groovenet/issues/808)) ([cff09aa](https://github.com/Public-Vinyl-Radio/groovenet/commit/cff09aa3eb55ed615bcef66dd762086d887aa049))
* **player:** persist per-player availability policy ([#813](https://github.com/Public-Vinyl-Radio/groovenet/issues/813)) ([fe91b34](https://github.com/Public-Vinyl-Radio/groovenet/commit/fe91b347d6ee25ee78878d97e367ab3241bda98a))
* **player:** play on picker and shared server queue in the main player ([#811](https://github.com/Public-Vinyl-Radio/groovenet/issues/811)) ([0f7c849](https://github.com/Public-Vinyl-Radio/groovenet/commit/0f7c849ca037eb4b7be69e8ea20cf98441822926))
* **player:** provision web credentials from 1Password ([#755](https://github.com/Public-Vinyl-Radio/groovenet/issues/755)) ([427983b](https://github.com/Public-Vinyl-Radio/groovenet/commit/427983b44c19d4b76138dc08f05a457dce6349f9))
* **ui:** album actions menu as a retro modal on phones ([#763](https://github.com/Public-Vinyl-Radio/groovenet/issues/763)) ([#785](https://github.com/Public-Vinyl-Radio/groovenet/issues/785)) ([72eb4b0](https://github.com/Public-Vinyl-Radio/groovenet/commit/72eb4b0c94425acadd9be285f65350736455b5fd))
* **ui:** centred retro modals replace mobile bottom sheets ([#752](https://github.com/Public-Vinyl-Radio/groovenet/issues/752)) ([ea97a6a](https://github.com/Public-Vinyl-Radio/groovenet/commit/ea97a6a3e886940f12a927a04708fb0e0df1f7fc))
* **ui:** group playlists by month with timeline dividers ([#775](https://github.com/Public-Vinyl-Radio/groovenet/issues/775)) ([ac4b321](https://github.com/Public-Vinyl-Radio/groovenet/commit/ac4b3217e22e8bf25dd92865f38cab23feb64708))
* **ui:** live set ticket card ([#779](https://github.com/Public-Vinyl-Radio/groovenet/issues/779)) ([61939f6](https://github.com/Public-Vinyl-Radio/groovenet/commit/61939f664aab1bea6da05f71ad8c078ee03816eb))
* **ui:** playlist card with cover mosaic ([#776](https://github.com/Public-Vinyl-Radio/groovenet/issues/776)) ([ed08921](https://github.com/Public-Vinyl-Radio/groovenet/commit/ed08921aa6d88ad4813ffe975ed58a0231fb4f3d))
* **ui:** playlist timeline day column ([#780](https://github.com/Public-Vinyl-Radio/groovenet/issues/780)) ([73ff445](https://github.com/Public-Vinyl-Radio/groovenet/commit/73ff4450d8e34c75cb834bf22ab8b26e0fc3c8e5))
* **ui:** playlists desktop cards view ([#782](https://github.com/Public-Vinyl-Radio/groovenet/issues/782)) ([fd7d9c9](https://github.com/Public-Vinyl-Radio/groovenet/commit/fd7d9c9309b9caccc31590e7feb253c8a718f5e3))
* **ui:** playlists desktop list view ([#784](https://github.com/Public-Vinyl-Radio/groovenet/issues/784)) ([344ceb1](https://github.com/Public-Vinyl-Radio/groovenet/commit/344ceb16e50d25e4c7182b259a6d1ef0d14c461f))
* **ui:** playlists page header and toolbar ([#774](https://github.com/Public-Vinyl-Radio/groovenet/issues/774)) ([0cdbbd7](https://github.com/Public-Vinyl-Radio/groovenet/commit/0cdbbd76c75fb0fa846ccccc80baa21f48dfb701))
* **ui:** record and spin form sheets as retro modals on phones ([#763](https://github.com/Public-Vinyl-Radio/groovenet/issues/763)) ([#787](https://github.com/Public-Vinyl-Radio/groovenet/issues/787)) ([eee932b](https://github.com/Public-Vinyl-Radio/groovenet/commit/eee932b9ebe4fd0b5c510e25fd8e90b17c74209d))
* **ui:** restyle player with transport strip, readable queue and docked desktop bar ([#809](https://github.com/Public-Vinyl-Radio/groovenet/issues/809)) ([779cc74](https://github.com/Public-Vinyl-Radio/groovenet/commit/779cc741466b9510da1c97ef98c725640d747bb6))
* **ui:** retro modals for playlist actions ([#757](https://github.com/Public-Vinyl-Radio/groovenet/issues/757)) ([a3a342a](https://github.com/Public-Vinyl-Radio/groovenet/commit/a3a342a4081c89dcda6acfd5b09d31272c7c3969))
* **ui:** shared list header pieces and outlined filter chips ([#794](https://github.com/Public-Vinyl-Radio/groovenet/issues/794)) ([#795](https://github.com/Public-Vinyl-Radio/groovenet/issues/795)) ([ffbc97d](https://github.com/Public-Vinyl-Radio/groovenet/commit/ffbc97d0ff3a397a11ff2d635450d4e21aca1058))
* **ui:** simplified albums search with filters modal ([#761](https://github.com/Public-Vinyl-Radio/groovenet/issues/761)) ([a9f21e0](https://github.com/Public-Vinyl-Radio/groovenet/commit/a9f21e0d709668fb7f6f6648c2d19065cd84fd80))
* **ui:** simplified tracks search with options modal ([#758](https://github.com/Public-Vinyl-Radio/groovenet/issues/758)) ([9fe5cc3](https://github.com/Public-Vinyl-Radio/groovenet/commit/9fe5cc339301a4073659c60e2c800579ec4b8d67))
* **ui:** spin and copy action menus as retro modals on phones ([#763](https://github.com/Public-Vinyl-Radio/groovenet/issues/763)) ([#786](https://github.com/Public-Vinyl-Radio/groovenet/issues/786)) ([978ddd9](https://github.com/Public-Vinyl-Radio/groovenet/commit/978ddd9ba0f7fb1ca46595835b935c350efa0dc3))
* **ui:** Tracks desktop header with search-mode menu and filters panel ([#794](https://github.com/Public-Vinyl-Radio/groovenet/issues/794)) ([#796](https://github.com/Public-Vinyl-Radio/groovenet/issues/796)) ([78eac7a](https://github.com/Public-Vinyl-Radio/groovenet/commit/78eac7a2da4ca18916ed8b4158b74862d60afec2))


### Bug Fixes

* **player:** reject ambiguous HA output name mappings ([#812](https://github.com/Public-Vinyl-Radio/groovenet/issues/812)) ([c73f338](https://github.com/Public-Vinyl-Radio/groovenet/commit/c73f3382dfd431d4ad4607f5577fa889e64f540f))
* **ui:** playlist meta line wraps into columns on narrow screens ([#773](https://github.com/Public-Vinyl-Radio/groovenet/issues/773)) ([fb744ac](https://github.com/Public-Vinyl-Radio/groovenet/commit/fb744ac6a6db2f8c87bf7264a739082fb393f48f))
* **ui:** track page phone header menu and scope toggle ([#763](https://github.com/Public-Vinyl-Radio/groovenet/issues/763)) ([#788](https://github.com/Public-Vinyl-Radio/groovenet/issues/788)) ([f7d4a09](https://github.com/Public-Vinyl-Radio/groovenet/commit/f7d4a0996adcf82bf5daade067490a4f4b7c19a7))
* **worktree:** store golden seeds under herdr ([#777](https://github.com/Public-Vinyl-Radio/groovenet/issues/777)) ([a797394](https://github.com/Public-Vinyl-Radio/groovenet/commit/a79739464cddb85b7f36a931186cc8a5145ac1dd))
* **worktree:** stream production seed covers from app container ([#783](https://github.com/Public-Vinyl-Radio/groovenet/issues/783)) ([a8c008d](https://github.com/Public-Vinyl-Radio/groovenet/commit/a8c008d7320fde088677e496f3471d4d07df7bd6))

## [0.3.9](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.3.8...v0.3.9) (2026-10-25)


### Features

* **albums:** list and card views in house style ([#731](https://github.com/Public-Vinyl-Radio/groovenet/issues/731)) ([3ec87b4](https://github.com/Public-Vinyl-Radio/groovenet/commit/3ec87b48b5941d6ab3bc27d374f288bdc640e18b))
* **albums:** redesign album page in house style ([#728](https://github.com/Public-Vinyl-Radio/groovenet/issues/728)) ([1fce973](https://github.com/Public-Vinyl-Radio/groovenet/commit/1fce973bd8ece95ec7136ce57f538e8c90e8ec9a))
* **cli:** control persistent named server players ([#726](https://github.com/Public-Vinyl-Radio/groovenet/issues/726)) ([657c93f](https://github.com/Public-Vinyl-Radio/groovenet/commit/657c93fca77eb8079e50c123e46389258731aea3))
* **player:** add opt-in OwnTone backend with explicit EOF events ([#701](https://github.com/Public-Vinyl-Radio/groovenet/issues/701)) ([12b6b0a](https://github.com/Public-Vinyl-Radio/groovenet/commit/12b6b0a31016e7c9b67a7d559e9dcd9e6267934a))
* **player:** add optional MPRIS desktop controls ([#679](https://github.com/Public-Vinyl-Radio/groovenet/issues/679)) ([b9a3bf2](https://github.com/Public-Vinyl-Radio/groovenet/commit/b9a3bf2a66ea3ba790ed291cf7755a5f72024858))
* **player:** control persistent server players from the web ([#743](https://github.com/Public-Vinyl-Radio/groovenet/issues/743)) ([ef2cd93](https://github.com/Public-Vinyl-Radio/groovenet/commit/ef2cd93113599a3b59643a0bdd0353b4cfeb93d9))
* **player:** persist named server players and independent queues ([#725](https://github.com/Public-Vinyl-Radio/groovenet/issues/725)) ([9f82664](https://github.com/Public-Vinyl-Radio/groovenet/commit/9f82664b2450a71747427593007906facabf9949))
* **playlists:** table/card track list view on the playlist page ([#713](https://github.com/Public-Vinyl-Radio/groovenet/issues/713)) ([edfd0e5](https://github.com/Public-Vinyl-Radio/groovenet/commit/edfd0e5eab92e7333562763c4db8e98baadb68e1))
* **settings:** appearance — palette and light/dark/system picker ([#677](https://github.com/Public-Vinyl-Radio/groovenet/issues/677)) ([3c43663](https://github.com/Public-Vinyl-Radio/groovenet/commit/3c436631b761ed362d5eabfa94ca283b8b3eb0fd))
* **settings:** choose display, body and label fonts ([#686](https://github.com/Public-Vinyl-Radio/groovenet/issues/686)) ([c3ac994](https://github.com/Public-Vinyl-Radio/groovenet/commit/c3ac99409b6e042ab3fa07b22d92d9b850d32255))
* **settings:** custom colour palette with contrast checks ([#696](https://github.com/Public-Vinyl-Radio/groovenet/issues/696)) ([ad232ba](https://github.com/Public-Vinyl-Radio/groovenet/commit/ad232bac162881250e815d21f1457af22ab667b2))
* **tracks:** redesign the track page header and mix-aware related tracks ([#721](https://github.com/Public-Vinyl-Radio/groovenet/issues/721)) ([696c11d](https://github.com/Public-Vinyl-Radio/groovenet/commit/696c11da70b5bfae83b2dd5cedeec9f7eb9da42c))
* **tracks:** table list view for related tracks ([#702](https://github.com/Public-Vinyl-Radio/groovenet/issues/702)) ([1794581](https://github.com/Public-Vinyl-Radio/groovenet/commit/1794581b0a4af62157e80292210a0086bc09b040))
* **ui:** add Riso, Midnight and Mono palettes ([#682](https://github.com/Public-Vinyl-Radio/groovenet/issues/682)) ([f7933cd](https://github.com/Public-Vinyl-Radio/groovenet/commit/f7933cdbb54d8271ba9502df2d9113ab6d0725aa))
* **ui:** page header for secondary and edit pages ([#749](https://github.com/Public-Vinyl-Radio/groovenet/issues/749)) ([3145192](https://github.com/Public-Vinyl-Radio/groovenet/commit/31451928a4599700d17283e5f26c86d1d6243125))
* **ui:** palette-driven theme tokens with Sleeve default ([#674](https://github.com/Public-Vinyl-Radio/groovenet/issues/674)) ([c2cc5e6](https://github.com/Public-Vinyl-Radio/groovenet/commit/c2cc5e69aba7998f84a5820e64c8494426d6f357))
* **ui:** realign track cards with the house style ([#723](https://github.com/Public-Vinyl-Radio/groovenet/issues/723)) ([bcb32d8](https://github.com/Public-Vinyl-Radio/groovenet/commit/bcb32d88b9ae4e578dd50b28710e549c39f330d8))
* **ui:** retro house style with square outlines and hard shadows ([#678](https://github.com/Public-Vinyl-Radio/groovenet/issues/678)) ([c6fc301](https://github.com/Public-Vinyl-Radio/groovenet/commit/c6fc30103bbef290b31a859724490def858cff1e))
* **ui:** shared breadcrumbs for detail pages ([#746](https://github.com/Public-Vinyl-Radio/groovenet/issues/746)) ([8f88d01](https://github.com/Public-Vinyl-Radio/groovenet/commit/8f88d0194fb8e0d3d8a964b09cc30feae5dccb30))
* **ui:** shared mobile page header ([#742](https://github.com/Public-Vinyl-Radio/groovenet/issues/742)) ([925c26f](https://github.com/Public-Vinyl-Radio/groovenet/commit/925c26fb1bd0679a0b889057979d4824b686bc73))


### Bug Fixes

* **deploy:** preserve server players and resolve credentials from 1Password ([#729](https://github.com/Public-Vinyl-Radio/groovenet/issues/729)) ([1716439](https://github.com/Public-Vinyl-Radio/groovenet/commit/1716439d3a79abe717fd296ebe90fe57589e05f0))
* **dev:** mount synced album covers and add prod golden seed ([#744](https://github.com/Public-Vinyl-Radio/groovenet/issues/744)) ([42024c9](https://github.com/Public-Vinyl-Radio/groovenet/commit/42024c9cbf8d40a178bd903a850b59c4e5258a35))
* **player:** recover verified failed sessions and preserve errors ([#732](https://github.com/Public-Vinyl-Radio/groovenet/issues/732)) ([437ac38](https://github.com/Public-Vinyl-Radio/groovenet/commit/437ac38763defcdc3b9c5773fcfae7e598634fa8))
* **player:** scroll long TUI lists and harden cover-art hiding ([#659](https://github.com/Public-Vinyl-Radio/groovenet/issues/659)) ([e67145d](https://github.com/Public-Vinyl-Radio/groovenet/commit/e67145da3dd8df9cb041580bd0aa6e25d6da972d))
* **ui:** handle iOS PWA safe areas in the app shell ([#737](https://github.com/Public-Vinyl-Radio/groovenet/issues/737)) ([3d3cd5a](https://github.com/Public-Vinyl-Radio/groovenet/commit/3d3cd5ab508e680f8cee926525c1122d62bb3716))
* **ui:** keep the sidebar full height at the bottom of the page ([#695](https://github.com/Public-Vinyl-Radio/groovenet/issues/695)) ([09858ae](https://github.com/Public-Vinyl-Radio/groovenet/commit/09858aebd85c65705e6ffa973cd198d89ae4aa6b))
* **ui:** stop clipping track row badges and tidy the search toolbar ([#697](https://github.com/Public-Vinyl-Radio/groovenet/issues/697)) ([54d9ea3](https://github.com/Public-Vinyl-Radio/groovenet/commit/54d9ea3ce2f4a04a234a916ba7039133010a33d6))

## [0.3.8](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.3.7...v0.3.8) (2026-10-23)


### Features

* **mcp:** add player tools for status, transport, queue and devices ([#654](https://github.com/Public-Vinyl-Radio/groovenet/issues/654)) ([370668d](https://github.com/Public-Vinyl-Radio/groovenet/commit/370668dbcab5c0f9dc379bbda2c078da99eb80dc))
* **mcp:** return track refs, duration and release in search_tracks ([#640](https://github.com/Public-Vinyl-Radio/groovenet/issues/640)) ([4f267d0](https://github.com/Public-Vinyl-Radio/groovenet/commit/4f267d0535e6f85ac15c974c987fccb9f9fc62a3))
* **player:** complete daemon controls for [#610](https://github.com/Public-Vinyl-Radio/groovenet/issues/610) ([#635](https://github.com/Public-Vinyl-Radio/groovenet/issues/635)) ([b7b1ca3](https://github.com/Public-Vinyl-Radio/groovenet/commit/b7b1ca3b69a6ac5f7fbd981d34433ee86303553a))
* **player:** hide the cover-art window by default, add player_artwork option ([#648](https://github.com/Public-Vinyl-Radio/groovenet/issues/648)) ([acb2a4c](https://github.com/Public-Vinyl-Radio/groovenet/commit/acb2a4c7312c437809b3b67d8c83651cf39a0dfe))
* **player:** log plays from track-change events ([#658](https://github.com/Public-Vinyl-Radio/groovenet/issues/658)) ([df14f14](https://github.com/Public-Vinyl-Radio/groovenet/commit/df14f1422d0884f7a176304583adcb0064a9f572))


### Bug Fixes

* **contracts:** add repository field so npm provenance publishing succeeds ([#636](https://github.com/Public-Vinyl-Radio/groovenet/issues/636)) ([cc3838a](https://github.com/Public-Vinyl-Radio/groovenet/commit/cc3838a85b4780fafed4d6bb675510260df3e70e))
* **mcp:** document and validate generate_ai_playlist payload ([#638](https://github.com/Public-Vinyl-Radio/groovenet/issues/638)) ([bea4942](https://github.com/Public-Vinyl-Radio/groovenet/commit/bea4942e5ad2caefca0f6d5635fbc966d66a1069))
* **upload:** save the raw Essentia analysis for UI audio uploads ([#643](https://github.com/Public-Vinyl-Radio/groovenet/issues/643)) ([f54b777](https://github.com/Public-Vinyl-Radio/groovenet/commit/f54b7770d62bb2dd0f435cab0ef7a182ba024bed))


### Performance Improvements

* **docker:** cache dev installs and separate web build layers ([#646](https://github.com/Public-Vinyl-Radio/groovenet/issues/646)) ([f05f053](https://github.com/Public-Vinyl-Radio/groovenet/commit/f05f053b79eba3a3c3821bcc5c29a7bcdfdba0fa))

## [0.3.7](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.3.6...v0.3.7) (2026-10-22)


### Features

* **cli:** set playlist tracks from a file ([#631](https://github.com/Public-Vinyl-Radio/groovenet/issues/631)) ([3714aa0](https://github.com/Public-Vinyl-Radio/groovenet/commit/3714aa04a7dd72362a89baa280f957e75dfcc9d8))


### Bug Fixes

* **player:** handle optional playlist ref positions and publish publicly ([#632](https://github.com/Public-Vinyl-Radio/groovenet/issues/632)) ([c81c0e0](https://github.com/Public-Vinyl-Radio/groovenet/commit/c81c0e09db8f63605fcdd3254459d8299145e01a))

## [0.3.6](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.3.5...v0.3.6) (2026-10-21)


### Features

* **cli:** add local player daemon and TUI ([#628](https://github.com/Public-Vinyl-Radio/groovenet/issues/628)) ([2adaaa2](https://github.com/Public-Vinyl-Radio/groovenet/commit/2adaaa28c0ee6493be255f8068a2cef42251db7d))


### Bug Fixes

* **essentia:** store BPM confidence from the beat histogram ([#607](https://github.com/Public-Vinyl-Radio/groovenet/issues/607)) ([356ba4b](https://github.com/Public-Vinyl-Radio/groovenet/commit/356ba4b8ef369253272290bed33e913c1538156d))
* **mcp:** send track objects when creating a playlist ([#629](https://github.com/Public-Vinyl-Radio/groovenet/issues/629)) ([ae4003f](https://github.com/Public-Vinyl-Radio/groovenet/commit/ae4003f40144c216a125cd1010f519efdea91f19))
* **player:** don't persist the player queue before restore completes ([#602](https://github.com/Public-Vinyl-Radio/groovenet/issues/602)) ([f901b90](https://github.com/Public-Vinyl-Radio/groovenet/commit/f901b9051128d347c0406e7ed100280e4fe7d905))

## [0.3.5](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.3.4...v0.3.5) (2026-10-19)


### Features

* **recommendations:** count similar genres as partial overlap ([#593](https://github.com/Public-Vinyl-Radio/groovenet/issues/593)) ([e9ac912](https://github.com/Public-Vinyl-Radio/groovenet/commit/e9ac91226440508f5f491e38968ab5e11e7a41b8))


### Bug Fixes

* **app:** bump Next to 16.4.2 to fix Gzip drain listener leak ([#588](https://github.com/Public-Vinyl-Radio/groovenet/issues/588)) ([acad398](https://github.com/Public-Vinyl-Radio/groovenet/commit/acad3983c1126819327b09780fb07ece9bce4730))
* **worker:** pin download-worker to Python 3.13 and smoke-test gamdl ([#599](https://github.com/Public-Vinyl-Radio/groovenet/issues/599)) ([0a347fa](https://github.com/Public-Vinyl-Radio/groovenet/commit/0a347fa0679987e5c2204c3fa15cd75da1ee2e8f))

## [0.3.4](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.3.3...v0.3.4) (2026-10-18)


### Features

* **settings:** fold default Discogs sync into a unified Discogs page ([#579](https://github.com/Public-Vinyl-Radio/groovenet/issues/579)) ([55d43e5](https://github.com/Public-Vinyl-Radio/groovenet/commit/55d43e5e1e25666bb6629516501bf0ad2a835cd3))


### Bug Fixes

* **contracts:** set publishConfig.access to public ([#568](https://github.com/Public-Vinyl-Radio/groovenet/issues/568)) ([efac33e](https://github.com/Public-Vinyl-Radio/groovenet/commit/efac33e359d81378b69d534c769e6c60f49a3950))
* **deps:** bump pinned npm from 12.0.0 to 12.0.1 ([#565](https://github.com/Public-Vinyl-Radio/groovenet/issues/565)) ([0170708](https://github.com/Public-Vinyl-Radio/groovenet/commit/017070811afd304ffa18bca65bd170ad3ac9dc99))
* **dev:** fix dev container startup crash and stale contracts node_modules ([#566](https://github.com/Public-Vinyl-Radio/groovenet/issues/566)) ([c37ce84](https://github.com/Public-Vinyl-Radio/groovenet/commit/c37ce841342af3510cf121a8cc9463136bdd34d6))
* **download-worker:** run analysis as a separate job and restart essentia/ga-service ([#583](https://github.com/Public-Vinyl-Radio/groovenet/issues/583)) ([e58fb1d](https://github.com/Public-Vinyl-Radio/groovenet/commit/e58fb1d5be76b7fd49a5449fc174f7c291b7ea14))
* **enrich:** strip null bytes from AI-generated fields before writing to Postgres ([#580](https://github.com/Public-Vinyl-Radio/groovenet/issues/580)) ([a0627f8](https://github.com/Public-Vinyl-Radio/groovenet/commit/a0627f8dbcddf314c0f236d44bcf0e344f594ced))
* **playlists:** delete playlist_tracks with their playlist and add FK cascade ([#582](https://github.com/Public-Vinyl-Radio/groovenet/issues/582)) ([94386e9](https://github.com/Public-Vinyl-Radio/groovenet/commit/94386e9fb4709ae50b64b96d753ac54cad94a67f))
* **search:** show the album's library identifier in track search results ([#564](https://github.com/Public-Vinyl-Radio/groovenet/issues/564)) ([e37931b](https://github.com/Public-Vinyl-Radio/groovenet/commit/e37931b020925a5448278242139f58ed06be130b))

## [0.3.3](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.3.2...v0.3.3) (2026-10-17)


### Features

* **albums:** add ability to delete an album ([#542](https://github.com/Public-Vinyl-Radio/groovenet/issues/542)) ([414c9b6](https://github.com/Public-Vinyl-Radio/groovenet/commit/414c9b6f04ec30c4ab0579cfbc821779ba2e4a33))
* **albums:** preserve taxonomy overrides through Discogs sync ([#516](https://github.com/Public-Vinyl-Radio/groovenet/issues/516)) ([5da280a](https://github.com/Public-Vinyl-Radio/groovenet/commit/5da280affa665e8293ee8feb0f25928a4be0c39d))
* **cli,mcp:** expose similar genres with scores and signals ([#543](https://github.com/Public-Vinyl-Radio/groovenet/issues/543)) ([63a27b7](https://github.com/Public-Vinyl-Radio/groovenet/commit/63a27b7c967c8b6de7d0d0a7da45edec5f9fc271))
* **docker:** add on-demand container for one-off maintenance scripts ([#533](https://github.com/Public-Vinyl-Radio/groovenet/issues/533)) ([fddf7a6](https://github.com/Public-Vinyl-Radio/groovenet/commit/fddf7a679ee6e793c4b95269dfc0ddf9e72305ef))
* **genres:** similar genres from taxonomy and album co-occurrence ([#377](https://github.com/Public-Vinyl-Radio/groovenet/issues/377)) ([#499](https://github.com/Public-Vinyl-Radio/groovenet/issues/499)) ([9ee9e94](https://github.com/Public-Vinyl-Radio/groovenet/commit/9ee9e946844ff6bab260ca89e611bb68ecd4c275))
* **observability:** report exceptions from backend services ([#563](https://github.com/Public-Vinyl-Radio/groovenet/issues/563)) ([a055428](https://github.com/Public-Vinyl-Radio/groovenet/commit/a0554287ff5e399aa0c45dcb6f6d85c71a853f80))
* **playlists:** make genre and style badges in playlist stats clickable ([#509](https://github.com/Public-Vinyl-Radio/groovenet/issues/509)) ([1323064](https://github.com/Public-Vinyl-Radio/groovenet/commit/132306481d06d48e1f89bbd0c7c82ca7b1a6cf3e))
* **search:** add an "Include similar" toggle for the genre filter ([#501](https://github.com/Public-Vinyl-Radio/groovenet/issues/501)) ([d318951](https://github.com/Public-Vinyl-Radio/groovenet/commit/d318951abe0991f7f31d9282521b098ca8723379))
* **search:** flag uncertain keys with an indicator + popover ([#535](https://github.com/Public-Vinyl-Radio/groovenet/issues/535)) ([c5aaaca](https://github.com/Public-Vinyl-Radio/groovenet/commit/c5aaacaf7ab9b0494c32ae9f0bb2e65eba69491b))
* **search:** redesign track results with row and card layouts ([#520](https://github.com/Public-Vinyl-Radio/groovenet/issues/520)) ([351dd8a](https://github.com/Public-Vinyl-Radio/groovenet/commit/351dd8a30a73435efd86fe26c27fd7b8d08afbac))


### Bug Fixes

* **app:** avoid overlapping pg client queries ([#559](https://github.com/Public-Vinyl-Radio/groovenet/issues/559)) ([c295bcd](https://github.com/Public-Vinyl-Radio/groovenet/commit/c295bcdc6a73ece9c9949f10e64c7b640b64e41c))
* **build:** suppress Turbopack tracing for runtime volume paths ([#529](https://github.com/Public-Vinyl-Radio/groovenet/issues/529)) ([c041647](https://github.com/Public-Vinyl-Radio/groovenet/commit/c041647fb000fd57617e46ae4f1cd5646cdcc1a6))
* **deploy:** commit real PROD_*_VOLUME values in .env.tpl instead of blanks ([#540](https://github.com/Public-Vinyl-Radio/groovenet/issues/540)) ([dc8768e](https://github.com/Public-Vinyl-Radio/groovenet/commit/dc8768e401ce16594e164b97569e585edd7d4b2f))
* **deploy:** create volume symlinks where the server actually runs from ([#562](https://github.com/Public-Vinyl-Radio/groovenet/issues/562)) ([fce9fce](https://github.com/Public-Vinyl-Radio/groovenet/commit/fce9fcef821ae1bc21e1ff0052c629894817d6f7))
* **deploy:** give db/redis a container_name so a colliding stack fails loudly ([#544](https://github.com/Public-Vinyl-Radio/groovenet/issues/544)) ([2008079](https://github.com/Public-Vinyl-Radio/groovenet/commit/2008079cd0d7c3ffa53c1bc9a3429d649fd7bd43))
* **deploy:** point standalone server CMD at its actual nested path ([#560](https://github.com/Public-Vinyl-Radio/groovenet/issues/560)) ([a7f62b9](https://github.com/Public-Vinyl-Radio/groovenet/commit/a7f62b9e6462472873e66b81ed5abd824d70bcff))
* **deploy:** require per-host external volume names in docker-compose.prod.yml ([#539](https://github.com/Public-Vinyl-Radio/groovenet/issues/539)) ([6c4bbb6](https://github.com/Public-Vinyl-Radio/groovenet/commit/6c4bbb6f043d7e7a0b3454af273e071aea01af47))
* **deps:** pin npm 12.0.0 across bootstrap, Docker, and CI ([#517](https://github.com/Public-Vinyl-Radio/groovenet/issues/517)) ([dfc4798](https://github.com/Public-Vinyl-Radio/groovenet/commit/dfc47984d822f72609afb6e5107d347cc5d587fa))
* **developer-tools:** package Storybook in app images ([#525](https://github.com/Public-Vinyl-Radio/groovenet/issues/525)) ([70b026c](https://github.com/Public-Vinyl-Radio/groovenet/commit/70b026cee04ed3f8825c83e6ed79c08a4ca493b8))
* **discogs-sync:** report per-track upsert failures ([#536](https://github.com/Public-Vinyl-Radio/groovenet/issues/536)) ([55cad0b](https://github.com/Public-Vinyl-Radio/groovenet/commit/55cad0bbb07cfc6acca3118332305661590e78d2))
* **enrich:** surface track save failures instead of failing silently ([#554](https://github.com/Public-Vinyl-Radio/groovenet/issues/554)) ([0a70403](https://github.com/Public-Vinyl-Radio/groovenet/commit/0a70403b19e1d8ab9fd773abbaa3b410ca58dc34))
* **essentia:** also check chords_key for key-profile disagreement ([#530](https://github.com/Public-Vinyl-Radio/groovenet/issues/530)) ([c20adbc](https://github.com/Public-Vinyl-Radio/groovenet/commit/c20adbc74b8123ad5dde657f05e03cbbf0f952e0))
* **essentia:** pick key by consensus among the three profiles, not always edma ([#537](https://github.com/Public-Vinyl-Radio/groovenet/issues/537)) ([da3c07a](https://github.com/Public-Vinyl-Radio/groovenet/commit/da3c07a868e1609793bd1d7e1024fd93fc52dbe9))
* **essentia:** surface key confidence and profile disagreement ([#527](https://github.com/Public-Vinyl-Radio/groovenet/issues/527)) ([a41e9dd](https://github.com/Public-Vinyl-Radio/groovenet/commit/a41e9dd2cc4ad6e6bc105c3d52c4bd1a4fab496c))

## [0.3.2](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.3.1...v0.3.2) (2026-10-10)


### Features

* **albums:** album artwork preview, restore, upload and similarity-gated bulk matching ([#496](https://github.com/Public-Vinyl-Radio/groovenet/issues/496)) ([36e7ae9](https://github.com/Public-Vinyl-Radio/groovenet/commit/36e7ae907962302dd8399f7f1d6e8b8d535200e5))
* **command-palette:** search genres and albums, search everywhere ([#492](https://github.com/Public-Vinyl-Radio/groovenet/issues/492)) ([c510995](https://github.com/Public-Vinyl-Radio/groovenet/commit/c510995043d042776162e355d3d5e9f364c061ab))
* **genres:** genre pages ([#376](https://github.com/Public-Vinyl-Radio/groovenet/issues/376)) ([#458](https://github.com/Public-Vinyl-Radio/groovenet/issues/458)) ([c1f9143](https://github.com/Public-Vinyl-Radio/groovenet/commit/c1f91432c143bd21cd2b08c6028d03770538a547))
* **genres:** show track genres on every track list ([#493](https://github.com/Public-Vinyl-Radio/groovenet/issues/493)) ([25b06b3](https://github.com/Public-Vinyl-Radio/groovenet/commit/25b06b397728fbb514fcd96884308b00014489b7))
* **jobs:** show embedding queue status and failures on the jobs page ([#477](https://github.com/Public-Vinyl-Radio/groovenet/issues/477)) ([12ab1d2](https://github.com/Public-Vinyl-Radio/groovenet/commit/12ab1d2f784d095ed032ce1c34c6ea4257599ced))
* **now-playing:** publish record labels in MQTT metadata ([#498](https://github.com/Public-Vinyl-Radio/groovenet/issues/498)) ([4d92af2](https://github.com/Public-Vinyl-Radio/groovenet/commit/4d92af292ac9312c705ee24d6264947b8980b943))
* **now-playing:** track live plays and publish them to MQTT ([#466](https://github.com/Public-Vinyl-Radio/groovenet/issues/466)) ([cdd77e2](https://github.com/Public-Vinyl-Radio/groovenet/commit/cdd77e2ad92253ca434c2526d66ef1d081902439))
* **pwa:** add standalone pull-to-refresh ([#481](https://github.com/Public-Vinyl-Radio/groovenet/issues/481)) ([12bdb8d](https://github.com/Public-Vinyl-Radio/groovenet/commit/12bdb8d503ba50998f881878919b2ac759571adc))
* **worktree:** add worktree-gc and herdr-done ([#474](https://github.com/Public-Vinyl-Radio/groovenet/issues/474)) ([ff33d68](https://github.com/Public-Vinyl-Radio/groovenet/commit/ff33d68137650ca9149c03bdbfb3e88649929552))
* **worktree:** start a coding agent from herdr-task ([#464](https://github.com/Public-Vinyl-Radio/groovenet/issues/464)) ([ea63dc4](https://github.com/Public-Vinyl-Radio/groovenet/commit/ea63dc45a49ac838fe79fa894bb97b53a430b687))


### Bug Fixes

* **backup:** stream pg_dump and restores to disk instead of buffering ([#459](https://github.com/Public-Vinyl-Radio/groovenet/issues/459)) ([#460](https://github.com/Public-Vinyl-Radio/groovenet/issues/460)) ([d7b1c45](https://github.com/Public-Vinyl-Radio/groovenet/commit/d7b1c45b6ca4de2db2f87b1a24c88c429f0ae92e))
* **db:** raise maintenance_work_mem so restore can build ivfflat indexes ([#491](https://github.com/Public-Vinyl-Radio/groovenet/issues/491)) ([a23e930](https://github.com/Public-Vinyl-Radio/groovenet/commit/a23e93024def83064a1f1a055c979310b23d29fd))
* **genres:** accept nullable album metadata ([#479](https://github.com/Public-Vinyl-Radio/groovenet/issues/479)) ([86c9a3b](https://github.com/Public-Vinyl-Radio/groovenet/commit/86c9a3b468cf01dd0060083d28fc2441e87465db))
* **player:** finished-queue idle state, mobile dismiss, artwork fallback, title truncation ([#483](https://github.com/Public-Vinyl-Radio/groovenet/issues/483)) ([747a8b5](https://github.com/Public-Vinyl-Radio/groovenet/commit/747a8b55c5351dac826d28d67a47f5666a5b83a8))
* **settings:** tabbed layout and dark-mode colours ([#489](https://github.com/Public-Vinyl-Radio/groovenet/issues/489)) ([9c7a819](https://github.com/Public-Vinyl-Radio/groovenet/commit/9c7a819eebfa7ee1cf35b7498137728bb9b53c54))
* **tracks:** treat missing hasVectors as unknown, not missing ([#478](https://github.com/Public-Vinyl-Radio/groovenet/issues/478)) ([be01dd8](https://github.com/Public-Vinyl-Radio/groovenet/commit/be01dd882f40ca05b80bf221ae617b20ba45d719))

## [0.3.1](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.3.0...v0.3.1) (2026-10-06)


### Features

* **cli:** groovenet genres review for fast reconciliation decisions ([#442](https://github.com/Public-Vinyl-Radio/groovenet/issues/442)) ([4c2205b](https://github.com/Public-Vinyl-Radio/groovenet/commit/4c2205b1d5ff5eb34281d470299912c5777d1760))
* **embeddings:** add a context embedding for natural-language retrieval ([#411](https://github.com/Public-Vinyl-Radio/groovenet/issues/411)) ([805820b](https://github.com/Public-Vinyl-Radio/groovenet/commit/805820b4aa6b91cf4717e05727dcbe2ee248b4bd))
* **embeddings:** evaluate AI track notes for semantic retrieval ([#404](https://github.com/Public-Vinyl-Radio/groovenet/issues/404)) ([4b4ba62](https://github.com/Public-Vinyl-Radio/groovenet/commit/4b4ba62b21f1fd5a0b32883d60b26ddb829fde93))
* **embeddings:** evaluate candidate embedding texts and models ([#382](https://github.com/Public-Vinyl-Radio/groovenet/issues/382)) ([#406](https://github.com/Public-Vinyl-Radio/groovenet/issues/406)) ([c897c77](https://github.com/Public-Vinyl-Radio/groovenet/commit/c897c773632ca2e16e5d6b77bd4709653a1f3907))
* **enrich:** constrain AI genre suggestions to the taxonomy ([#437](https://github.com/Public-Vinyl-Radio/groovenet/issues/437)) ([1d1c2e1](https://github.com/Public-Vinyl-Radio/groovenet/commit/1d1c2e1ef57313882308e35d546d32090a9a5b72))
* **enrichment:** default AI metadata off in the enrichment wizard ([#426](https://github.com/Public-Vinyl-Radio/groovenet/issues/426)) ([9aab91b](https://github.com/Public-Vinyl-Radio/groovenet/commit/9aab91bb33e14080be5e4eb549792feecebb5fca))
* **genres:** add canonical taxonomy and admin API ([#414](https://github.com/Public-Vinyl-Radio/groovenet/issues/414)) ([2a72ae6](https://github.com/Public-Vinyl-Radio/groovenet/commit/2a72ae6f9a3f1fa7ff75b0d31b55d6a26d5bde43))
* **genres:** clickable genre badges ([#376](https://github.com/Public-Vinyl-Radio/groovenet/issues/376)) ([#453](https://github.com/Public-Vinyl-Radio/groovenet/issues/453)) ([fc4c2c2](https://github.com/Public-Vinyl-Radio/groovenet/commit/fc4c2c2e557ecf87842f6859a9c6e4fc6e759fd2))
* **genres:** pick track genres from the taxonomy, and badge them ([#432](https://github.com/Public-Vinyl-Radio/groovenet/issues/432)) ([41f7511](https://github.com/Public-Vinyl-Radio/groovenet/commit/41f751180dfdffc9fcad8a0db4759a756830c051))
* **genres:** reconcile local_tags onto the taxonomy via reviewed proposals ([#438](https://github.com/Public-Vinyl-Radio/groovenet/issues/438)) ([a8e658f](https://github.com/Public-Vinyl-Radio/groovenet/commit/a8e658f356b780bb4514c46301d3de849e7eff33))
* **genres:** scope local_tags reconciliation to one friend ([#439](https://github.com/Public-Vinyl-Radio/groovenet/issues/439)) ([dd19ee6](https://github.com/Public-Vinyl-Radio/groovenet/commit/dd19ee6627e3472cc74d29ea11a4e6d9c440078b))
* **genres:** store track genres as taxonomy links, with descriptors ([#431](https://github.com/Public-Vinyl-Radio/groovenet/issues/431)) ([1454744](https://github.com/Public-Vinyl-Radio/groovenet/commit/14547442fbbe130d7b757efdcb15fdeb1555cefb))
* **search:** cap natural-language results at 3 per release ([#424](https://github.com/Public-Vinyl-Radio/groovenet/issues/424)) ([#427](https://github.com/Public-Vinyl-Radio/groovenet/issues/427)) ([923ea08](https://github.com/Public-Vinyl-Radio/groovenet/commit/923ea082ca87eb2409bc3ee39f41690f51f046c9))
* **search:** filter tracks and albums by genre, including subgenres ([#375](https://github.com/Public-Vinyl-Radio/groovenet/issues/375)) ([#444](https://github.com/Public-Vinyl-Radio/groovenet/issues/444)) ([1f18c6f](https://github.com/Public-Vinyl-Radio/groovenet/commit/1f18c6f926627374fe89b555be3f6b1ddec7fc51))
* **search:** genre filter in the search and albums UI, with genre counts ([#375](https://github.com/Public-Vinyl-Radio/groovenet/issues/375)) ([#446](https://github.com/Public-Vinyl-Radio/groovenet/issues/446)) ([0e974f8](https://github.com/Public-Vinyl-Radio/groovenet/commit/0e974f88b956a526f857607e512fd9e5e195d26b))
* **search:** group the missing-data filters into a dropdown, and add BPM/key/rating controls ([#447](https://github.com/Public-Vinyl-Radio/groovenet/issues/447)) ([#449](https://github.com/Public-Vinyl-Radio/groovenet/issues/449)) ([82136ff](https://github.com/Public-Vinyl-Radio/groovenet/commit/82136ff7591e29d34ab1b67d61a7f7682717737a))
* **search:** natural-language track search over context embeddings ([#413](https://github.com/Public-Vinyl-Radio/groovenet/issues/413)) ([11eaa54](https://github.com/Public-Vinyl-Radio/groovenet/commit/11eaa54d5f5110ee4ccbfcbeef391e222d06fa31))


### Bug Fixes

* **dev:** run the app as the checkout owner on Linux bind mounts ([#430](https://github.com/Public-Vinyl-Radio/groovenet/issues/430)) ([19bf8ac](https://github.com/Public-Vinyl-Radio/groovenet/commit/19bf8ac14858288d9e23303cb2a11415ad182057))
* **discogs:** store empty imported local tags as null ([#445](https://github.com/Public-Vinyl-Radio/groovenet/issues/445)) ([d58bfb2](https://github.com/Public-Vinyl-Radio/groovenet/commit/d58bfb21c136b7fc697991edd33935cec18595c7))
* **embeddings:** skip the periodic sweep while embedding jobs are pending ([#420](https://github.com/Public-Vinyl-Radio/groovenet/issues/420)) ([9218762](https://github.com/Public-Vinyl-Radio/groovenet/commit/921876223546be0231c9108333f43f8bc1340d0a))
* **embeddings:** version embedding templates and fix identity accent normalization ([#410](https://github.com/Public-Vinyl-Radio/groovenet/issues/410)) ([1b41408](https://github.com/Public-Vinyl-Radio/groovenet/commit/1b41408faf174765ddfa6a93a1518b830329717f))
* **genres:** fewer new-genre proposals, and skip empty array local_tags ([#441](https://github.com/Public-Vinyl-Radio/groovenet/issues/441)) ([3d8db71](https://github.com/Public-Vinyl-Radio/groovenet/commit/3d8db7187713cb7f908c06c8ea65db45f6613bb6))
* **genres:** map local_tags to the most specific genre, and match spelling variants ([#443](https://github.com/Public-Vinyl-Radio/groovenet/issues/443)) ([b9d8f1a](https://github.com/Public-Vinyl-Radio/groovenet/commit/b9d8f1a2e1cfda5d239c1eeb383022b5e6b5faa7))
* **genres:** require a third of an album's tagged tracks to match a genre ([#448](https://github.com/Public-Vinyl-Radio/groovenet/issues/448)) ([#454](https://github.com/Public-Vinyl-Radio/groovenet/issues/454)) ([5fe2d77](https://github.com/Public-Vinyl-Radio/groovenet/commit/5fe2d7761e4aa6334ef72e4c2c767a8426ffe32d))
* **migrations:** include genre seed in migrator image ([#417](https://github.com/Public-Vinyl-Radio/groovenet/issues/417)) ([e236c41](https://github.com/Public-Vinyl-Radio/groovenet/commit/e236c4142141327f0dbc39b98b6e69b13b6f9940))
* **migrations:** reorder genre taxonomy migration after embedding migrations ([#418](https://github.com/Public-Vinyl-Radio/groovenet/issues/418)) ([d126f36](https://github.com/Public-Vinyl-Radio/groovenet/commit/d126f366c7e5f83f8dd622b4d512f7d161d34fbb))
* **recommendations:** keep track suggestions to the selected library ([#428](https://github.com/Public-Vinyl-Radio/groovenet/issues/428)) ([bacee27](https://github.com/Public-Vinyl-Radio/groovenet/commit/bacee272558e8adbf5ffba2740d6d24303cf8cc5))
* **search:** apply BPM, key and rating filters in every search mode ([#422](https://github.com/Public-Vinyl-Radio/groovenet/issues/422)) ([96a05e3](https://github.com/Public-Vinyl-Radio/groovenet/commit/96a05e3db201d0a12c839d71eb6a28d11b49f86e))
* **test:** probe throwaway Postgres over TCP before running tests ([#423](https://github.com/Public-Vinyl-Radio/groovenet/issues/423)) ([bcb0830](https://github.com/Public-Vinyl-Radio/groovenet/commit/bcb0830c835eeb84c28651468314696deb398c4a))


### Performance Improvements

* **embeddings:** batch queue jobs and prioritize interactive work ([#452](https://github.com/Public-Vinyl-Radio/groovenet/issues/452)) ([9073940](https://github.com/Public-Vinyl-Radio/groovenet/commit/907394002253588c95cc9ffac6b0374f835478b9))

## [0.3.0](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.2.10...v0.3.0) (2026-10-04)


### ⚠ BREAKING CHANGES

* **embeddings:** remove the legacy tracks.embedding prompt embedding ([#402](https://github.com/Public-Vinyl-Radio/groovenet/issues/402))

### Features

* **embeddings:** backfill API, CLI and status ([#392](https://github.com/Public-Vinyl-Radio/groovenet/issues/392)) ([a7ff8f9](https://github.com/Public-Vinyl-Radio/groovenet/commit/a7ff8f9094f51b3677d1c57f0128830cded0c7be))
* **embeddings:** feed ga-service audio_vibe vectors from track_embeddings ([#401](https://github.com/Public-Vinyl-Radio/groovenet/issues/401)) ([2c8b6f9](https://github.com/Public-Vinyl-Radio/groovenet/commit/2c8b6f9b15da1c03552a5018e82bef63fd89802c))
* **embeddings:** move generation onto a retryable background queue ([#389](https://github.com/Public-Vinyl-Radio/groovenet/issues/389)) ([c56af27](https://github.com/Public-Vinyl-Radio/groovenet/commit/c56af2797841691751000ec5cbf3298309dc06f9))
* **embeddings:** provider interface and multi-model support for identity/audio_vibe ([#394](https://github.com/Public-Vinyl-Radio/groovenet/issues/394)) ([f492a5b](https://github.com/Public-Vinyl-Radio/groovenet/commit/f492a5beef06df0e4ce8e6474c95c2d5c0ddbcfa))
* **embeddings:** remove the legacy tracks.embedding prompt embedding ([#402](https://github.com/Public-Vinyl-Radio/groovenet/issues/402)) ([079dc1b](https://github.com/Public-Vinyl-Radio/groovenet/commit/079dc1bf6973e1be7a65301689e461533327d868))
* **records:** add CLI commands and MCP tools ([#391](https://github.com/Public-Vinyl-Radio/groovenet/issues/391)) ([a43a647](https://github.com/Public-Vinyl-Radio/groovenet/commit/a43a6475ef80b0001a235cd51cbee0d81e31aee5))
* **spins:** log a playlist as spins ([#395](https://github.com/Public-Vinyl-Radio/groovenet/issues/395)) ([db091a1](https://github.com/Public-Vinyl-Radio/groovenet/commit/db091a184ffa4e453926a4753db1c44dd7f1e3bd))


### Bug Fixes

* **ui:** stop splitting Discogs genres like 'Funk / Soul' into two badges ([#403](https://github.com/Public-Vinyl-Radio/groovenet/issues/403)) ([0827ffb](https://github.com/Public-Vinyl-Radio/groovenet/commit/0827ffb22b6e374c357c0c21fe8c1161816abe31))

## [0.2.10](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.2.9...v0.2.10) (2026-10-02)


### Features

* **records:** record care UI — log care, copies on album detail, chores view ([#367](https://github.com/Public-Vinyl-Radio/groovenet/issues/367)) ([0909d8f](https://github.com/Public-Vinyl-Radio/groovenet/commit/0909d8fc8a13848caf4297b98b7cdc805242ca8d))
* **records:** track physical copies and care actions ([#358](https://github.com/Public-Vinyl-Radio/groovenet/issues/358)) ([52f32fc](https://github.com/Public-Vinyl-Radio/groovenet/commit/52f32fcdd409c8a30c54392a1befb2df201af1a4))


### Bug Fixes

* **spins:** keep one play of a recording on two releases as one spin ([#366](https://github.com/Public-Vinyl-Radio/groovenet/issues/366)) ([ed314c6](https://github.com/Public-Vinyl-Radio/groovenet/commit/ed314c62acd414e3f97c02c35dd808ecbaf18e66))

## [0.2.9](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.2.8...v0.2.9) (2026-09-30)


### Features

* **analytics:** instrument spins, sets, recommendations and sync; IDs-only events ([#347](https://github.com/Public-Vinyl-Radio/groovenet/issues/347)) ([66ae6ca](https://github.com/Public-Vinyl-Radio/groovenet/commit/66ae6ca9a99cd774bb4c74efec7f59d6f3d6a22d))
* **analytics:** report download outcomes and instrument enrich, palette and recommendations ([#348](https://github.com/Public-Vinyl-Radio/groovenet/issues/348)) ([ccf654d](https://github.com/Public-Vinyl-Radio/groovenet/commit/ccf654de72767e81303289209401939aab792b38))
* **analytics:** wrap analytics behind a provider-agnostic module with an off switch ([#344](https://github.com/Public-Vinyl-Radio/groovenet/issues/344)) ([262d52b](https://github.com/Public-Vinyl-Radio/groovenet/commit/262d52b3d91042860806c78ba0bb55cdc3311931))


### Bug Fixes

* **spins:** stop the aggregation lookback splitting a play into duplicate spins ([#350](https://github.com/Public-Vinyl-Radio/groovenet/issues/350)) ([c7bcc35](https://github.com/Public-Vinyl-Radio/groovenet/commit/c7bcc350fb0b3e1f0c6b1f8706b4e2463b8513a4))

## [0.2.8](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.2.7...v0.2.8) (2026-09-28)


### Features

* **spins:** edit spins and move delete into an actions menu ([#341](https://github.com/Public-Vinyl-Radio/groovenet/issues/341)) ([8a1057d](https://github.com/Public-Vinyl-Radio/groovenet/commit/8a1057d29f256ba73cc6ec0b5e257830c68b486f))
* **spins:** show what was played on album spin rows ([#337](https://github.com/Public-Vinyl-Radio/groovenet/issues/337)) ([82ddb48](https://github.com/Public-Vinyl-Radio/groovenet/commit/82ddb4857e64bee7a73a94491f377ffadf21ee30))
* **spins:** show what was played on recent spin cards ([#340](https://github.com/Public-Vinyl-Radio/groovenet/issues/340)) ([abb90de](https://github.com/Public-Vinyl-Radio/groovenet/commit/abb90de1b1f36c79946b28d0318a5a7016756775))


### Bug Fixes

* **detections:** keep detections a spin points to when pruning ([#343](https://github.com/Public-Vinyl-Radio/groovenet/issues/343)) ([0298ed3](https://github.com/Public-Vinyl-Radio/groovenet/commit/0298ed3473d679a6ac27b7e638ecdb88bae61307))

## [0.2.7](https://github.com/Public-Vinyl-Radio/groovenet/compare/v0.2.6...v0.2.7) (2026-09-26)


### Features

* **cli:** derive a set's tracklist with groovenet sets ([#321](https://github.com/Public-Vinyl-Radio/groovenet/issues/321)) ([976db63](https://github.com/Public-Vinyl-Radio/groovenet/commit/976db63c4dfe91d62995f3fc3342842b9186ef4a))
* **cli:** review a set's differences and correct the playlist ([#326](https://github.com/Public-Vinyl-Radio/groovenet/issues/326)) ([61a0ca5](https://github.com/Public-Vinyl-Radio/groovenet/commit/61a0ca5cfb6d8ee07ae79fe6c4e52ee3056c485c))
* **fingerprint:** match every window of a set recording ([#319](https://github.com/Public-Vinyl-Radio/groovenet/issues/319)) ([56c9887](https://github.com/Public-Vinyl-Radio/groovenet/commit/56c988767c6989b318c0bf5c4a6ea0b3749d74ef))
* **fingerprint:** run set recordings on their own worker ([#316](https://github.com/Public-Vinyl-Radio/groovenet/issues/316)) ([68fbaed](https://github.com/Public-Vinyl-Radio/groovenet/commit/68fbaedb01ea556b2fcf94abc1904c4d7b0e3534))
* **obs:** structured logging and counters for the audio ingest pipeline ([#329](https://github.com/Public-Vinyl-Radio/groovenet/issues/329)) ([689ec77](https://github.com/Public-Vinyl-Radio/groovenet/commit/689ec77bbd726a86cf4e1cd90d533fe2c837b62f))
* **release:** deploy main's tested images as a release candidate ([#322](https://github.com/Public-Vinyl-Radio/groovenet/issues/322)) ([e66cc0f](https://github.com/Public-Vinyl-Radio/groovenet/commit/e66cc0fc08a8a579fcf19832e0c49ed789679f67))
* **sets:** derive a tracklist and a diff from a set recording ([#320](https://github.com/Public-Vinyl-Radio/groovenet/issues/320)) ([f0f47e4](https://github.com/Public-Vinyl-Radio/groovenet/commit/f0f47e4519b729c116339f657f3a5c0fc0d1d1a4))


### Bug Fixes

* **fingerprints:** re-fingerprint replaced audio, cheaply ([#327](https://github.com/Public-Vinyl-Radio/groovenet/issues/327)) ([d6c3b33](https://github.com/Public-Vinyl-Radio/groovenet/commit/d6c3b332a53dae53ab0dfbdb08d07744532b9b38))
* **release:** check out a release candidate's commit on the box ([#323](https://github.com/Public-Vinyl-Radio/groovenet/issues/323)) ([350bbbd](https://github.com/Public-Vinyl-Radio/groovenet/commit/350bbbd3ce934509379fb06ca67d01ecfb096a2c))
* **release:** tag release PRs that only bump the root package ([#314](https://github.com/Public-Vinyl-Radio/groovenet/issues/314)) ([045089d](https://github.com/Public-Vinyl-Radio/groovenet/commit/045089de16fb70262e686adf4d9466fcb7fb0837))
* **sets:** let the app write set recordings, and never hang an upload ([#324](https://github.com/Public-Vinyl-Radio/groovenet/issues/324)) ([68ec293](https://github.com/Public-Vinyl-Radio/groovenet/commit/68ec2936194e738c869090c8cfdd4375ed14dac7))
* **sets:** stop repetitive music splitting one play into several ([#325](https://github.com/Public-Vinyl-Radio/groovenet/issues/325)) ([9a429e3](https://github.com/Public-Vinyl-Radio/groovenet/commit/9a429e39820be205db4fa30cc008ed7d3c8b7ee2))
* **vinyl:** fewer false plays, and spins from buffered audio ([#328](https://github.com/Public-Vinyl-Radio/groovenet/issues/328)) ([52eeb1d](https://github.com/Public-Vinyl-Radio/groovenet/commit/52eeb1d6d6fbfe1f12ae29f4b69c5856281be0b7))


### Performance Improvements

* **fingerprint:** pack the reference index into numpy arrays ([#318](https://github.com/Public-Vinyl-Radio/groovenet/issues/318)) ([4e8e46d](https://github.com/Public-Vinyl-Radio/groovenet/commit/4e8e46d0376a1463b73ce626f9aba32b7f1e29ee))

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
