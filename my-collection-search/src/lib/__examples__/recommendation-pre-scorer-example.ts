/**
 * Example usage of RecommendationPreScorer (Phase 2)
 *
 * Demonstrates how to apply constraints and bonuses to candidates
 * from Phase 1.
 */

import { retrieveCandidates } from "../recommendation-candidate-retriever";
import { applyConstraintsAndBonuses, SeedTrack } from "../recommendation-pre-scorer";

/**
 * Example 1: Basic usage with blend mode
 */
async function basicExample() {
  console.log("=".repeat(60));
  console.log("Example 1: Basic PreScoring (Blend Mode)");
  console.log("=".repeat(60));

  const seedTrackId = "your-track-id"; // Replace with actual track ID
  const seedFriendId = 1;

  // Phase 1: Retrieve candidates
  const candidates = await retrieveCandidates(seedTrackId, seedFriendId, {
    limitIdentity: 100,
    limitAudio: 100,
  });

  console.log(`\n📊 Phase 1 Results:`);
  console.log(`  Retrieved ${candidates.stats.unionCount} candidates`);

  // Build seed track from first candidate's metadata (in real usage, fetch from DB)
  const seed: SeedTrack = {
    bpm: 128,
    key: "C Major",
    eraBucket: "1990s",
    genres: [
      { id: "house-genre-id", parentId: "electronic-genre-id" },
      { id: "techno-genre-id", parentId: "electronic-genre-id" },
    ],
    energy: 0.7,
    danceability: 0.8,
  };

  // Phase 2: Apply constraints and bonuses
  const scored = applyConstraintsAndBonuses(seed, candidates.candidates, "blend");

  console.log(`\n📊 Phase 2 Results:`);
  console.log(`  Scored ${scored.length} candidates (blend mode)`);
  console.log(`  Rejected ${candidates.stats.unionCount - scored.length} candidates`);

  // Show top 5 with bonuses
  console.log("\n🎵 Top 5 with Bonuses:");
  scored.slice(0, 5).forEach(c => {
    console.log(`\n  ${c.metadata.title} - ${c.metadata.artist}`);
    console.log(`    BPM: ${c.metadata.bpm}, Key: ${c.metadata.key}`);
    console.log(`    Bonuses:`);
    console.log(`      BPM: +${c.bonuses.bpmBonus.toFixed(3)}`);
    console.log(`      Key: +${c.bonuses.keyBonus.toFixed(3)}`);
    console.log(`      Tag: +${c.bonuses.tagBonus.toFixed(3)}`);
    console.log(`      Era: +${c.bonuses.eraBonus.toFixed(3)}`);
    console.log(`    Penalties:`);
    console.log(`      Energy: -${c.penalties.energyPenalty.toFixed(3)}`);
  });
}

/**
 * Example 2: Compare different modes
 */
async function compareModes() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 2: Compare Constraint Modes");
  console.log("=".repeat(60));

  const seedTrackId = "your-track-id"; // Replace with actual track ID
  const seedFriendId = 1;

  // Phase 1: Retrieve candidates
  const candidates = await retrieveCandidates(seedTrackId, seedFriendId);

  const seed: SeedTrack = {
    bpm: 128,
    key: "C Major",
    eraBucket: "1990s",
    genres: [
      { id: "house-genre-id", parentId: "electronic-genre-id" },
      { id: "techno-genre-id", parentId: "electronic-genre-id" },
    ],
    energy: 0.7,
    danceability: 0.8,
  };

  // Apply all three modes
  const blend = applyConstraintsAndBonuses(seed, candidates.candidates, "blend");
  const mixable = applyConstraintsAndBonuses(seed, candidates.candidates, "mixable");
  const strict = applyConstraintsAndBonuses(seed, candidates.candidates, "strict");

  console.log(`\n📊 Mode Comparison:`);
  console.log(`  Blend:   ${blend.length} candidates (most permissive)`);
  console.log(`  Mixable: ${mixable.length} candidates (moderate)`);
  console.log(`  Strict:  ${strict.length} candidates (most restrictive)`);

  const blendOnly = blend.length - mixable.length;
  const mixableOnly = mixable.length - strict.length;

  console.log(`\n  Rejected by mixable (vs blend): ${blendOnly}`);
  console.log(`  Rejected by strict (vs mixable): ${mixableOnly}`);
}

/**
 * Example 3: Sort by total bonus
 */
async function sortByBonusExample() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 3: Sort by Total Bonus");
  console.log("=".repeat(60));

  const seedTrackId = "your-track-id"; // Replace with actual track ID
  const seedFriendId = 1;

  const candidates = await retrieveCandidates(seedTrackId, seedFriendId);

  const seed: SeedTrack = {
    bpm: 128,
    key: "C Major",
    eraBucket: "1990s",
    genres: [
      { id: "house-genre-id", parentId: "electronic-genre-id" },
      { id: "techno-genre-id", parentId: "electronic-genre-id" },
    ],
    energy: 0.7,
    danceability: 0.8,
  };

  const scored = applyConstraintsAndBonuses(seed, candidates.candidates, "mixable");

  // Calculate total bonus (sum of bonuses - penalties)
  const withTotal = scored.map(c => {
    const totalBonus =
      c.bonuses.bpmBonus +
      c.bonuses.keyBonus +
      c.bonuses.tagBonus +
      c.bonuses.eraBonus -
      c.penalties.energyPenalty;

    return { ...c, totalBonus };
  });

  // Sort by total bonus (descending)
  withTotal.sort((a, b) => b.totalBonus - a.totalBonus);

  console.log("\n🎵 Top 10 by Total Bonus:");
  withTotal.slice(0, 10).forEach((c, idx) => {
    console.log(`\n${idx + 1}. ${c.metadata.title} - ${c.metadata.artist}`);
    console.log(`   Total Bonus: +${c.totalBonus.toFixed(3)}`);
    console.log(`   (BPM: ${c.bonuses.bpmBonus.toFixed(3)}, Key: ${c.bonuses.keyBonus.toFixed(3)}, Tag: ${c.bonuses.tagBonus.toFixed(3)}, Era: ${c.bonuses.eraBonus.toFixed(3)})`);
  });
}

/**
 * Example 4: Filter by specific bonus thresholds
 */
async function filterByBonusExample() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 4: Filter by Bonus Thresholds");
  console.log("=".repeat(60));

  const seedTrackId = "your-track-id"; // Replace with actual track ID
  const seedFriendId = 1;

  const candidates = await retrieveCandidates(seedTrackId, seedFriendId);

  const seed: SeedTrack = {
    bpm: 128,
    key: "C Major",
    eraBucket: "1990s",
    genres: [
      { id: "house-genre-id", parentId: "electronic-genre-id" },
      { id: "techno-genre-id", parentId: "electronic-genre-id" },
    ],
    energy: 0.7,
    danceability: 0.8,
  };

  const scored = applyConstraintsAndBonuses(seed, candidates.candidates, "blend");

  // Filter: Must have good BPM match (bonus >= 0.02)
  const goodBpm = scored.filter(c => c.bonuses.bpmBonus >= 0.02);

  // Filter: Must have key compatibility (bonus > 0)
  const compatibleKey = scored.filter(c => c.bonuses.keyBonus > 0);

  // Filter: Must have tag overlap (bonus > 0)
  const sharedTags = scored.filter(c => c.bonuses.tagBonus > 0);

  // Filter: Same or adjacent era
  const similarEra = scored.filter(c => c.bonuses.eraBonus > 0);

  console.log(`\n📊 Filtered Results:`);
  console.log(`  Good BPM match (≤4 BPM): ${goodBpm.length}`);
  console.log(`  Compatible key: ${compatibleKey.length}`);
  console.log(`  Shared tags/styles: ${sharedTags.length}`);
  console.log(`  Similar era: ${similarEra.length}`);

  // Combine filters: Good BPM + Compatible key + Shared tags
  const perfectMatches = scored.filter(
    c =>
      c.bonuses.bpmBonus >= 0.02 &&
      c.bonuses.keyBonus > 0 &&
      c.bonuses.tagBonus > 0
  );

  console.log(`  All three criteria: ${perfectMatches.length}`);
}

/**
 * Example 5: Combine Phase 1 similarities with Phase 2 bonuses
 */
async function combineScoresExample() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 5: Combine Similarities + Bonuses");
  console.log("=".repeat(60));

  const seedTrackId = "your-track-id"; // Replace with actual track ID
  const seedFriendId = 1;

  const candidates = await retrieveCandidates(seedTrackId, seedFriendId);

  const seed: SeedTrack = {
    bpm: 128,
    key: "C Major",
    eraBucket: "1990s",
    genres: [
      { id: "house-genre-id", parentId: "electronic-genre-id" },
      { id: "techno-genre-id", parentId: "electronic-genre-id" },
    ],
    energy: 0.7,
    danceability: 0.8,
  };

  const scored = applyConstraintsAndBonuses(seed, candidates.candidates, "mixable");

  // Create combined score (example weighting)
  const withCombinedScore = scored.map(c => {
    // Base similarity (average of identity + audio)
    const similarities = [c.simIdentity, c.simAudio].filter(
      (s): s is number => s !== null
    );
    const avgSimilarity = similarities.reduce((sum, s) => sum + s, 0) / similarities.length;

    // Total bonus
    const totalBonus =
      c.bonuses.bpmBonus +
      c.bonuses.keyBonus +
      c.bonuses.tagBonus +
      c.bonuses.eraBonus -
      c.penalties.energyPenalty;

    // Combined score (similarity + bonuses)
    const combinedScore = avgSimilarity + totalBonus;

    return {
      ...c,
      avgSimilarity,
      totalBonus,
      combinedScore,
    };
  });

  // Sort by combined score
  withCombinedScore.sort((a, b) => b.combinedScore - a.combinedScore);

  console.log("\n🎵 Top 10 by Combined Score:");
  withCombinedScore.slice(0, 10).forEach((c, idx) => {
    console.log(`\n${idx + 1}. ${c.metadata.title} - ${c.metadata.artist}`);
    console.log(`   Combined: ${c.combinedScore.toFixed(3)}`);
    console.log(`   = Similarity: ${c.avgSimilarity.toFixed(3)} + Bonus: ${c.totalBonus.toFixed(3)}`);
  });
}

/**
 * Run all examples
 */
async function runExamples() {
  try {
    await basicExample();
    await compareModes();
    await sortByBonusExample();
    await filterByBonusExample();
    await combineScoresExample();

    console.log("\n" + "=".repeat(60));
    console.log("✅ All examples completed");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("❌ Example failed:", error);
    process.exit(1);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runExamples();
}
