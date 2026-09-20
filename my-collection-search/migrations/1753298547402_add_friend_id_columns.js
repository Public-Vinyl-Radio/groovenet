export const shorthands = undefined;

/**
 * Migration: Add friend_id columns to tracks and playlist_tracks tables
 *
 * This migration adds friend_id foreign key columns to both tracks and playlist_tracks
 * tables to properly reference the friends table instead of relying on username strings.
 *
 * Changes:
 * - Add friend_id column to tracks table with foreign key constraint
 * - Add friend_id column to playlist_tracks table with foreign key constraint
 * - Create indexes on the new friend_id columns for performance
 * - Populate friend_id values based on existing username data
 * - Keep username column for backwards compatibility during transition
 */
export function up(pgm) {
  // Add friend_id column to tracks table
  pgm.addColumn('tracks', {
    friend_id: {
      type: 'integer',
      references: 'friends(id)',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    }
  });

  // Add friend_id column to playlist_tracks table
  pgm.addColumn('playlist_tracks', {
    friend_id: {
      type: 'integer',
      references: 'friends(id)',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    }
  });

  // Create indexes on friend_id columns for performance
  pgm.createIndex('tracks', 'friend_id', { name: 'idx_tracks_friend_id' });
  pgm.createIndex('playlist_tracks', 'friend_id', { name: 'idx_playlist_tracks_friend_id' });

  // Create missing friends for any tracks that don't have matching friends
  pgm.sql(`
    INSERT INTO friends (username, added_at)
    SELECT DISTINCT t.username, NOW()
    FROM tracks t
    LEFT JOIN friends f ON t.username = f.username
    WHERE f.username IS NULL
    AND t.username IS NOT NULL
    ON CONFLICT (username) DO NOTHING
  `);

  // Populate friend_id in tracks table based on username
  pgm.sql(`
    UPDATE tracks
    SET friend_id = friends.id
    FROM friends
    WHERE tracks.username = friends.username
    AND tracks.username IS NOT NULL
  `);

  // Handle tracks with NULL username by assigning to default friend
  pgm.sql(`
    UPDATE tracks
    SET friend_id = (SELECT id FROM friends ORDER BY id LIMIT 1)
    WHERE friend_id IS NULL
  `);

  // Populate friend_id in playlist_tracks table based on tracks.friend_id
  pgm.sql(`
    UPDATE playlist_tracks
    SET friend_id = tracks.friend_id
    FROM tracks
    WHERE playlist_tracks.track_id = tracks.track_id
    AND playlist_tracks.friend_id IS NULL
  `);

  // Handle any remaining NULL playlist_tracks by using first friend
  pgm.sql(`
    UPDATE playlist_tracks
    SET friend_id = (SELECT id FROM friends ORDER BY id LIMIT 1)
    WHERE friend_id IS NULL
  `);

  // Add NOT NULL constraints after data population
  pgm.alterColumn('tracks', 'friend_id', { notNull: true });
  pgm.alterColumn('playlist_tracks', 'friend_id', { notNull: true });
}

export function down(pgm) {
  // Remove indexes
  pgm.dropIndex('tracks', 'friend_id', { name: 'idx_tracks_friend_id' });
  pgm.dropIndex('playlist_tracks', 'friend_id', { name: 'idx_playlist_tracks_friend_id' });

  // Remove friend_id columns
  pgm.dropColumn('tracks', 'friend_id');
  pgm.dropColumn('playlist_tracks', 'friend_id');
}
