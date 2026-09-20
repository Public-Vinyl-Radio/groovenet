export const shorthands = undefined;

/**
 * Migration: Add gamdl settings table for per-user download preferences
 *
 * This migration creates a new table to store gamdl download preferences
 * for each friend/user, including quality settings, format preferences,
 * and other download configuration options.
 *
 * Changes:
 * - Create gamdl_settings table with friend_id foreign key
 * - Add columns for quality, format, and other preferences
 * - Create indexes for performance
 * - Populate with default settings for existing friends
 */
export function up(pgm) {
  // Create gamdl_settings table
  pgm.createTable('gamdl_settings', {
    id: 'id',
    friend_id: {
      type: 'integer',
      notNull: true,
      references: 'friends(id)',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
      unique: true // One settings record per friend
    },

    // Audio quality preference
    audio_quality: {
      type: 'varchar(20)',
      notNull: true,
      default: 'best',
      comment: 'Audio quality preference: best, high, standard'
    },

    // Audio format preference
    audio_format: {
      type: 'varchar(10)',
      notNull: true,
      default: 'm4a',
      comment: 'Audio format preference: m4a, mp3, aac, flac'
    },

    // Whether to save cover art separately
    save_cover: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'Save cover art as separate file'
    },

    // Cover format preference
    cover_format: {
      type: 'varchar(10)',
      notNull: true,
      default: 'jpg',
      comment: 'Cover format: jpg, png, raw'
    },

    // Whether to download lyrics
    save_lyrics: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'Download and save lyrics'
    },

    // Lyrics format preference
    lyrics_format: {
      type: 'varchar(10)',
      notNull: true,
      default: 'lrc',
      comment: 'Lyrics format: lrc, srt, ttml'
    },

    // Overwrite existing files
    overwrite_existing: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'Overwrite existing files'
    },

    // Skip music videos in albums/playlists
    skip_music_videos: {
      type: 'boolean',
      notNull: true,
      default: true,
      comment: 'Skip downloading music videos'
    },

    // Maximum retry attempts
    max_retries: {
      type: 'integer',
      notNull: true,
      default: 3,
      comment: 'Maximum retry attempts for failed downloads'
    },

    // Timestamps
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp')
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp')
    }
  });

  // Create index on friend_id for fast lookups
  pgm.createIndex('gamdl_settings', 'friend_id', { name: 'idx_gamdl_settings_friend_id' });

  // Add check constraints for valid enum values
  pgm.addConstraint('gamdl_settings', 'chk_audio_quality',
    "CHECK (audio_quality IN ('best', 'high', 'standard', 'lossless'))"
  );

  pgm.addConstraint('gamdl_settings', 'chk_audio_format',
    "CHECK (audio_format IN ('m4a', 'mp3', 'aac', 'flac'))"
  );

  pgm.addConstraint('gamdl_settings', 'chk_cover_format',
    "CHECK (cover_format IN ('jpg', 'png', 'raw'))"
  );

  pgm.addConstraint('gamdl_settings', 'chk_lyrics_format',
    "CHECK (lyrics_format IN ('lrc', 'srt', 'ttml'))"
  );

  // Create default settings for all existing friends
  pgm.sql(`
    INSERT INTO gamdl_settings (friend_id)
    SELECT id FROM friends
    ON CONFLICT (friend_id) DO NOTHING
  `);
}

export function down(pgm) {
  // Drop the table (constraints and indexes will be dropped automatically)
  pgm.dropTable('gamdl_settings');
}
