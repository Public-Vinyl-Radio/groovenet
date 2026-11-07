# @groovenet/cli

Command-line collection search, playlists, record care and playback for GrooveNet.

See the [CLI guide and reference](https://groovenet.publicvinylradio.com/docs/cli/) for installation, configuration, commands and player keymaps.

For development, see [CLAUDE.md](CLAUDE.md).

### Artist review

Artists are shared across every friend's collection. Review unresolved legacy
strings with `groovenet artists review`; each item shows the original credits,
other albums using that spelling, and available Discogs payload / Apple file tags.
Nothing is split by punctuation automatically. File evidence is loaded for a
specific `--artist` or the current interactive item; missing local files are
shown as unavailable. Album/track examples are capped at 20 each, with Apple
file probing capped at five tracks per item.

```sh
groovenet artists review --list
groovenet artists review --artist 42 --json
groovenet artists review --artist 42 --accept --dry-run --json
groovenet artists review --artist 42 --merge 7 --json
groovenet artists review --unmerge 3 --json
groovenet artists review --artist 7 --name 'The Strokes' --sort-name 'Strokes, The'
groovenet artists review --artist 12 --placeholder
groovenet artists review --artist 12 --no-placeholder
groovenet artists review --artist 42 --split '[{"name":"Mexican Institute of Sound","role":"primary","position":0,"credited_as":"Mexican Institute Of Sound"},{"artist_id":7,"role":"primary","position":1,"credited_as":"Meridian brothers"}]' --dry-run --json
```

`--split` accepts existing `artist_id`s or new names (optional `sort_name`),
plus explicit `role`, zero-based `position`, and `credited_as`. Roles are
`primary`, `featured`, `remixer`, and `composer`. It replaces every credit of
the source identity, preserving the original album/track display strings.
Named credits reuse a known alias before creating a new artist. The original
identity retains a split override so later imports apply the same decision.

Merges preserve external IDs as redirects and move aliases to the canonical
artist. The response includes `merge_id`; `--unmerge` splits it back using the
saved credits and aliases. Undo refuses if either identity has changed since
the merge, including new imports, so it cannot discard later work. Undo later
merges first. Canonical renames keep the original spelling as an alias.

Each script action supports `--dry-run` and `--json`; dry runs execute the
validation and roll the transaction back. With no action, `--json` and `--list`
print a page without prompting (`--limit`, `--offset`). Interactive review shows
a preview before saving each decision and supports skip/quit; saved decisions
leave the unresolved queue immediately. Re-run to continue with the next page.
