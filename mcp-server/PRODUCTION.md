# Using MCP Server with Production Data

This guide explains how to use Claude Code to interact with your production DJ collection.

## Overview

You now have **two MCP server configurations**:

1. **groovenet-local** - Queries local Docker stack (localhost:3000)
2. **groovenet-prod** - Queries production server

## Setup

### 1. Update Production URL

Edit `.mcp.json` and replace `your-production-server.com` with your actual domain:

```json
{
  "mcpServers": {
    "groovenet-prod": {
      "env": {
        "API_BASE": "https://dj.yourdomain.com/api",
        "API_KEY": "your-secret-api-key-here"
      }
    }
  }
}
```

### 2. Secure Your Production API (IMPORTANT!)

Your production API needs authentication to prevent unauthorized access.

**Option A: Add API Key Middleware (Recommended)**

Create `/my-collection-search/src/middleware.ts`:

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Skip auth for public routes
  if (
    request.nextUrl.pathname.startsWith("/_next") ||
    request.nextUrl.pathname.startsWith("/static") ||
    request.nextUrl.pathname === "/"
  ) {
    return NextResponse.next();
  }

  // Check for API key on API routes
  if (request.nextUrl.pathname.startsWith("/api")) {
    const apiKey = request.headers.get("authorization")?.replace("Bearer ", "");
    const expectedKey = process.env.API_KEY;

    if (!expectedKey || apiKey !== expectedKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
```

Add to your production `.env`:

```bash
API_KEY=your-super-secret-key-here-use-strong-random-string
```

**Option B: Use VPN/IP Whitelist**

Configure your production server to only allow API access from:

- Your home IP address
- VPN IP range
- Trusted networks

### 3. Generate a Secure API Key

```bash
# Generate a random API key
openssl rand -hex 32
# Example output: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0

# Add to .mcp.json:
"API_KEY": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0"
```

## Usage

### Query Local Data

```bash
cd /Users/saegey/Projects/dj-playlist
claude --mcp groovenet-local

# Or set as default in this directory
echo "groovenet-local" > .claude-mcp
```

Then ask:

- "Search for techno tracks in my local dev database"
- "Create a test playlist"

### Query Production Data

```bash
cd /Users/saegey/Projects/dj-playlist
claude --mcp groovenet-prod

# Or set as default
echo "groovenet-prod" > .claude-mcp
```

Then ask:

- "Search for all my unreleased techno tracks"
- "Find tracks that would mix well after Amelie Lens - Feel It"
- "Create a 90-minute progressive house set for my Friday gig"
- "Show me all 5-star rated tracks missing Spotify URLs"
- "Analyze my last 10 playlists - what's my average BPM?"

## Use Cases

### 1. Playlist Curation

```
"Create a 2-hour techno set starting at 128 BPM,
building to 135 BPM, focusing on tracks I rated 4+ stars"
```

### 2. Track Discovery

```
"Find tracks in my collection that are harmonically
compatible with 'Carl Cox - Inferno' (7A/Am)"
```

### 3. Collection Analysis

```
"What percentage of my collection has been analyzed for BPM?
Show me the breakdown by genre"
```

### 4. Missing Metadata

```
"List 50 tracks missing Apple Music URLs so I can backfill them"
```

### 5. Gig Preparation

```
"Generate 3 different opening sets (45 min each) for a
progressive house night, all starting around 120 BPM"
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ You: "Find tracks with BPM 128-132"                 │
└─────────────────┬───────────────────────────────────┘
                  │
      ┌───────────▼──────────┐
      │   Claude Code        │
      │   (Local Mac)        │
      └───────────┬──────────┘
                  │
      ┌───────────▼──────────┐
      │  MCP Server          │
      │  (Local Mac)         │
      │  with API_BASE env   │
      └───────────┬──────────┘
                  │
          ┌───────┴────────┐
          │                │
    ┌─────▼─────┐    ┌────▼────────┐
    │ localhost │    │ Production  │
    │   :3000   │    │   Server    │
    │  (Docker) │    │  (Cloud)    │
    └───────────┘    └─────────────┘
```

## Security Checklist

- [ ] API_KEY set in production .env
- [ ] API_KEY added to .mcp.json (keep secret!)
- [ ] Middleware validates API key on all /api routes
- [ ] .mcp.json added to .gitignore (never commit API keys!)
- [ ] HTTPS enabled on production server
- [ ] Consider IP whitelisting for extra security
- [ ] Rotate API keys periodically

## Troubleshooting

**"Unauthorized" errors:**

- Check API_KEY matches between .mcp.json and production .env
- Verify middleware.ts is deployed and running
- Check production logs for auth errors

**"Connection refused":**

- Verify production server is running
- Check API_BASE URL is correct (https, correct domain)
- Test with curl: `curl -H "Authorization: Bearer YOUR_KEY" https://your-server.com/api/playlists`

**Slow responses:**

- Production queries may be slower than local
- Consider adding caching to frequently used endpoints
- Use limit parameters to reduce result sizes

## Advanced: Multiple Production Environments

Add staging, demo, or team member servers:

```json
{
  "mcpServers": {
    "groovenet-local": { ... },
    "groovenet-staging": {
      "env": {
        "API_BASE": "https://staging.yourdomain.com/api",
        "API_KEY": "staging-api-key"
      }
    },
    "groovenet-prod": { ... }
  }
}
```

## Tips

1. **Always test locally first** before creating playlists on production
2. **Use descriptive names** when creating production playlists
3. **Back up** your production database regularly
4. **Monitor API usage** to detect unusual patterns
5. **Version control** your prompts - save good playlist generation prompts for reuse

## Example Session

```bash
$ claude --mcp groovenet-prod

> Search for all progressive house tracks from 2024
  that I rated 5 stars

[MCP returns 15 tracks...]

> Create a playlist called "Best of 2024 - Progressive"
  with these tracks, ordered by BPM ascending

✓ Playlist created with ID: 123

> Now generate an AI-optimized version using the genetic
  algorithm for smooth transitions

[GA service generates optimized order...]

✓ Generated optimized playlist with fitness score: 0.94
```

Your production collection is now accessible through natural language! 🎵
