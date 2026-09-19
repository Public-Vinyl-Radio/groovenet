# Non-secret config — committed values
POSTGRES_USER=djplaylist
POSTGRES_DB=djplaylist
DISCOGS_FOLDER_ID=0
APP_AUDIO_MOUNT=
WORKER_AUDIO_MOUNT=
APP_ALBUM_COVERS_SRC=
WORKER_ALBUM_COVERS_SRC=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
JOB_TTL_ACTIVE_SECONDS=604800
JOB_TTL_TERMINAL_SECONDS=259200
BACKUP_HEALTH_MAX_AGE_HOURS=30
ENABLE_DEVELOPER_TOOLS=true
# Static Storybook served same-origin by the app (see docker-compose.prod.yml).
# Build it with `just build-storybook` before deploying.
STORYBOOK_URL=/storybook/index.html

# Secrets from 1Password
POSTGRES_PASSWORD=op://Homelab/groovenet/POSTGRES_PASSWORD
DATABASE_URL=op://Homelab/groovenet/DATABASE_URL
OPENAI_API_KEY=op://Homelab/groovenet/OPENAI_API_KEY
APPLE_MUSIC_TEAM_ID=op://Homelab/groovenet/APPLE_MUSIC_TEAM_ID
APPLE_MUSIC_KEY_ID=op://Homelab/groovenet/APPLE_MUSIC_KEY_ID
APPLE_MUSIC_PRIVATE_KEY=op://Homelab/groovenet/APPLE_MUSIC_PRIVATE_KEY
DISCOGS_USER_TOKEN=op://Homelab/groovenet/DISCOGS_USER_TOKEN
DISCOGS_USERNAME=op://Homelab/groovenet/DISCOGS_USERNAME
YOUTUBE_API_KEY=op://Homelab/groovenet/YOUTUBE_API_KEY
NEXT_PUBLIC_POSTHOG_KEY=op://Homelab/groovenet/NEXT_PUBLIC_POSTHOG_KEY
RESTIC_REPOSITORY=op://Homelab/groovenet/RESTIC_REPOSITORY
RESTIC_PASSWORD=op://Homelab/groovenet/RESTIC_PASSWORD
B2_ACCOUNT_ID=op://Homelab/groovenet/B2_ACCOUNT_ID
B2_ACCOUNT_KEY=op://Homelab/groovenet/B2_ACCOUNT_KEY
