/**
 * Example usage of RecommendationCandidateRetriever
 *
 * This demonstrates how to use the candidate retriever service
 * to fetch recommendations for a seed track.
 */

import { retrieveCandidates, hasEmbeddings } from "../recommendation-candidate-retriever";

/**
 * Example 1: Basic usage
 */
async function basicExample() {
  console.log("=".repeat(60));
  console.log("Example 1: Basic Candidate Retrieval");
  console.log("=".repeat(60));

  const seedTrackId = "your-track-id"; // Replace with actual track ID
  const seedFriendId = 1;

  // Retrieve candidates with default limits
  const result = await retrieveCandidates(seedTrackId, seedFriendId);

  console.log("\n📊 Results:");
  console.log(`  Seed track: ${result.seedTrackId}`);
  console.log(`  Total candidates: ${result.stats.unionCount}`);
  console.log(`  - From identity: ${result.stats.identityCount}`);
  console.log(`  - From audio vibe: ${result.stats.audioCount}`);

  // Show top 5 candidates
  console.log("\n🎵 Top 5 Candidates:");
  const top5 = result.candidates.slice(0, 5);

  for (const candidate of top5) {
    console.log(`\n  ${candidate.metadata.title} - ${candidate.metadata.artist}`);
    console.log(`    Identity similarity: ${candidate.simIdentity?.toFixed(3) ?? "N/A"}`);
    console.log(`    Audio similarity: ${candidate.simAudio?.toFixed(3) ?? "N/A"}`);
    console.log(`    BPM: ${candidate.metadata.bpm ?? "N/A"}`);
    console.log(`    Key: ${candidate.metadata.key ?? "N/A"}`);
    console.log(`    Energy: ${candidate.metadata.energy?.toFixed(2) ?? "N/A"}`);
  }

  console.log("\n⏱️  Timing:");
  console.log(`  Identity query: ${result.stats.timingMs.identityQuery}ms`);
  console.log(`  Audio query: ${result.stats.timingMs.audioQuery}ms`);
  console.log(`  Total: ${result.stats.timingMs.total}ms`);
}

/**
 * Example 2: Custom limits
 */
async function customLimitsExample() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 2: Custom Limits");
  console.log("=".repeat(60));

  const seedTrackId = "your-track-id"; // Replace with actual track ID
  const seedFriendId = 1;

  // Retrieve more identity candidates than audio
  const result = await retrieveCandidates(seedTrackId, seedFriendId, {
    limitIdentity: 300,
    limitAudio: 100,
  });

  console.log("\n📊 Results with custom limits:");
  console.log(`  Total candidates: ${result.stats.unionCount}`);
  console.log(`  Identity results: ${result.stats.identityCount}`);
  console.log(`  Audio results: ${result.stats.audioCount}`);
}

/**
 * Example 3: Check embeddings before retrieval
 */
async function checkEmbeddingsExample() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 3: Check Embeddings First");
  console.log("=".repeat(60));

  const seedTrackId = "your-track-id"; // Replace with actual track ID
  const seedFriendId = 1;

  // Check what embeddings the seed track has
  const embeddings = await hasEmbeddings(seedTrackId, seedFriendId);

  console.log("\n🔍 Checking seed track embeddings:");
  console.log(`  Identity embedding: ${embeddings.identity ? "✅" : "❌"}`);
  console.log(`  Audio vibe embedding: ${embeddings.audio ? "✅" : "❌"}`);

  if (!embeddings.identity && !embeddings.audio) {
    console.log("\n⚠️  Seed track has no embeddings. Run backfill first.");
    return;
  }

  // Retrieve candidates
  const result = await retrieveCandidates(seedTrackId, seedFriendId);

  console.log(`\n✅ Retrieved ${result.stats.unionCount} candidates`);
}

/**
 * Example 4: Filter candidates by metadata
 */
async function filterCandidatesExample() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 4: Filter Candidates by Metadata");
  console.log("=".repeat(60));

  const seedTrackId = "your-track-id"; // Replace with actual track ID
  const seedFriendId = 1;

  const result = await retrieveCandidates(seedTrackId, seedFriendId, {
    limitIdentity: 200,
    limitAudio: 200,
  });

  // Post-filter: BPM range (±5 BPM from seed)
  const seedBpm = 128; // Replace with actual seed BPM
  const bpmFiltered = result.candidates.filter((c) => {
    if (!c.metadata.bpm) return false;
    const diff = Math.abs(c.metadata.bpm - seedBpm);
    return diff <= 5;
  });

  console.log("\n📊 BPM Filtering:");
  console.log(`  Total candidates: ${result.stats.unionCount}`);
  console.log(`  Within ±5 BPM of ${seedBpm}: ${bpmFiltered.length}`);

  // Post-filter: Same era
  const seedEra = "1990s";
  const eraFiltered = result.candidates.filter((c) => c.metadata.eraBucket === seedEra);

  console.log(`  Same era (${seedEra}): ${eraFiltered.length}`);

  // Post-filter: High energy tracks
  const energyFiltered = result.candidates.filter((c) => {
    return c.metadata.energy !== null && c.metadata.energy > 0.7;
  });

  console.log(`  High energy (>0.7): ${energyFiltered.length}`);
}

/**
 * Example 5: Sort candidates by combined similarity
 */
async function sortByCombinedSimilarityExample() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 5: Sort by Combined Similarity");
  console.log("=".repeat(60));

  const seedTrackId = "your-track-id"; // Replace with actual track ID
  const seedFriendId = 1;

  const result = await retrieveCandidates(seedTrackId, seedFriendId);

  // Calculate combined similarity (simple average)
  const candidatesWithScore = result.candidates.map((c) => {
    const scores = [c.simIdentity, c.simAudio].filter((s): s is number => s !== null);
    const avgScore = scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 0;

    return {
      ...c,
      combinedScore: avgScore,
    };
  });

  // Sort by combined score (descending)
  candidatesWithScore.sort((a, b) => b.combinedScore - a.combinedScore);

  console.log("\n🎵 Top 10 by Combined Similarity:");
  const top10 = candidatesWithScore.slice(0, 10);

  for (const candidate of top10) {
    console.log(`\n  ${candidate.metadata.title} - ${candidate.metadata.artist}`);
    console.log(`    Combined score: ${candidate.combinedScore.toFixed(3)}`);
    console.log(
      `    Identity: ${candidate.simIdentity?.toFixed(3) ?? "N/A"}, Audio: ${candidate.simAudio?.toFixed(3) ?? "N/A"}`,
    );
  }
}

/**
 * Example 6: Integration with existing similar tracks API
 */
async function apiIntegrationExample() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 6: API Integration Pattern");
  console.log("=".repeat(60));

  console.log(`
This is how you'd use the retriever in a Next.js API route:

// src/app/api/recommendations/candidates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { retrieveCandidates } from "@/lib/recommendation-candidate-retriever";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const track_id = searchParams.get("track_id");
  const friend_id = searchParams.get("friend_id");

  if (!track_id || !friend_id) {
    return NextResponse.json(
      { error: "Missing track_id or friend_id" },
      { status: 400 }
    );
  }

  const friendIdNum = parseInt(friend_id, 10);
  const limitIdentity = parseInt(searchParams.get("limit_identity") || "200", 10);
  const limitAudio = parseInt(searchParams.get("limit_audio") || "200", 10);

  try {
    const result = await retrieveCandidates(track_id, friendIdNum, {
      limitIdentity,
      limitAudio,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Recommendations] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to retrieve candidates",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// Usage:
// GET /api/recommendations/candidates?track_id=123&friend_id=1&limit_identity=300&limit_audio=150
  `);
}

/**
 * Run all examples
 */
async function runExamples() {
  try {
    await basicExample();
    await customLimitsExample();
    await checkEmbeddingsExample();
    await filterCandidatesExample();
    await sortByCombinedSimilarityExample();
    await apiIntegrationExample();

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
