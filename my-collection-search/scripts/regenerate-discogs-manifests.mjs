#!/usr/bin/env node

/**
 * Create empty Discogs manifest files for all friends in database
 * This allows the Discogs sync to download all releases fresh from Discogs API
 *
 * Usage:
 *   node scripts/regenerate-discogs-manifests.mjs
 */

import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DISCOGS_EXPORTS_DIR = path.resolve(__dirname, "..", "discogs_exports");

async function regenerateManifests() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log("Creating empty Discogs manifests for all users...\n");

    // Create exports directory if it doesn't exist
    if (!fs.existsSync(DISCOGS_EXPORTS_DIR)) {
      fs.mkdirSync(DISCOGS_EXPORTS_DIR, { recursive: true });
      console.log(`✅ Created directory: ${DISCOGS_EXPORTS_DIR}\n`);
    }

    // Get all friends (users)
    const friendsResult = await pool.query("SELECT id, username FROM friends ORDER BY id");
    const friends = friendsResult.rows;

    if (friends.length === 0) {
      console.log("⚠️  No friends found in database");
      return;
    }

    console.log(`Found ${friends.length} friends in database:\n`);
    friends.forEach((f) => console.log(`  - ${f.username} (ID: ${f.id})`));
    console.log("");

    const currentUser = process.env.DISCOGS_USERNAME;

    for (const friend of friends) {
      const { username } = friend;
      console.log(`📁 Creating manifest for ${username}...`);

      // Determine manifest file name
      const manifestFileName =
        currentUser && username === currentUser ? "manifest.json" : `manifest_${username}.json`;
      const manifestPath = path.join(DISCOGS_EXPORTS_DIR, manifestFileName);

      // Create empty manifest
      const manifest = {
        username,
        releaseIds: [],
        deletedReleaseIds: [],
        lastSynced: new Date().toISOString(),
      };

      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`  ✅ Created ${manifestFileName} (empty - ready for sync)`);
    }

    console.log("\n🎉 Empty manifests created!\n");
    console.log("Next steps:");
    console.log("  1. Run Discogs sync to download releases for each user");
    console.log("  2. The sync will populate releaseIds and download release files");
    console.log(`\nFiles written to: ${DISCOGS_EXPORTS_DIR}`);
  } catch (error) {
    console.error("❌ Error creating manifests:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
regenerateManifests();
