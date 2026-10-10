# Now-playing MQTT metadata

When `MQTT_URL` is configured, the now-playing tracker publishes retained
snapshots under `groovenet/now_playing/<source_id>` by default. Override the
prefix with `MQTT_TOPIC_PREFIX`. Home Assistant discovery uses the `/state`
topic for playback state and `/json` for the sensor's attributes.

The JSON snapshot includes track title, artist, album, release ID, position,
year, record label, BPM, key, genres, artwork URL, duration, and observed timing.
`year` preserves the track's string or numeric year. `label` is the matching
album's record label, resolved using both the release ID and collection owner.
Missing labels are `null`; idle snapshots clear both `year` and `label` to
`null` so consumers do not retain the previous record's release metadata.

Consumers can read `year` and `label` directly from the discovered Home
Assistant sensor. A combined media player must forward those attributes for
displays that subscribe to the player rather than the Groovenet sensor.
