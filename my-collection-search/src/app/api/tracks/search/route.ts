import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/serverDb";
import {
  trackSearchGetQuerySchema,
  trackSearchGetResponseSchema,
  type TrackSearchMode,
} from "@/api-contract/schemas";
import {
  attributeFilterClauses,
  missingFilterClause,
  parseTrackFilterSpec,
  type TrackAttributeFilters,
} from "@/lib/trackFilterSpec";
import { QueryRateLimitError } from "@/server/services/queryEmbeddingService";
import {
  HYBRID_LEG_SIZE,
  SEMANTIC_MAX_LIMIT,
  fuseHybridResults,
  semanticTrackSearch,
  type TrackRow,
} from "@/server/services/semanticTrackSearchService";
import { trackGenresSelectSql } from "@/server/repositories/trackGenreRepository";

type ParsedFilter = {
  where: string[];
  params: unknown[];
};

export function parseTrackFilter(filter: string | undefined): ParsedFilter {
  const spec = parseTrackFilterSpec(filter);
  const where: string[] = [];
  const params: unknown[] = [];

  if (spec.friendId !== undefined) {
    params.push(spec.friendId);
    where.push(`friend_id = $${params.length}`);
  }
  where.push(...spec.missing.map((name) => missingFilterClause(name)));

  return { where, params };
}

async function searchTracksPg(params: {
  q: string;
  limit: number;
  offset: number;
  where: string[];
  whereParams: unknown[];
}) {
  const startedAt = Date.now();
  const queryText = params.q.trim();
  const sqlParams: unknown[] = [...params.whereParams];
  let queryParamRef: string | null = null;
  if (queryText.length > 0) {
    queryParamRef = `$${sqlParams.length + 1}`;
    sqlParams.push(queryText);
  }

  const limitRef = `$${sqlParams.length + 1}`;
  sqlParams.push(params.limit);

  const offsetRef = `$${sqlParams.length + 1}`;
  sqlParams.push(params.offset);

  const whereClauses = [...params.where, "deleted_at IS NULL"];

  if (queryText.length > 0 && queryParamRef) {
    whereClauses.push(
      `(
        to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(artist, '') || ' ' || coalesce(album, '')) @@ plainto_tsquery('simple', ${queryParamRef})
        OR similarity(coalesce(title, ''), ${queryParamRef}) > 0.15
        OR similarity(coalesce(artist, ''), ${queryParamRef}) > 0.15
        OR similarity(coalesce(album, ''), ${queryParamRef}) > 0.15
      )`
    );
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const rankSql =
    queryParamRef
      ? `(
        ts_rank(
          to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(artist, '') || ' ' || coalesce(album, '')),
          plainto_tsquery('simple', ${queryParamRef})
        ) * 2.0
        + GREATEST(
          similarity(coalesce(title, ''), ${queryParamRef}),
          similarity(coalesce(artist, ''), ${queryParamRef}),
          similarity(coalesce(album, ''), ${queryParamRef})
        )
      )`
      : null;
  const orderBySql = rankSql ? `${rankSql} DESC, t.id DESC` : "t.id DESC";

  const { rows } = await dbQuery(
    `
    SELECT t.*
      , EXISTS (
        SELECT 1
        FROM track_embeddings te
        WHERE te.track_id = t.track_id
          AND te.friend_id = t.friend_id
          AND te.embedding_type = 'audio_vibe'
          AND te.embedding IS NOT NULL
      ) AS "hasVectors"
      , ${trackGenresSelectSql("t")}
    FROM tracks t
    ${whereSql}
    ORDER BY ${orderBySql}
    LIMIT ${limitRef}
    OFFSET ${offsetRef}
    `,
    sqlParams
  );

  const countParams = queryText.length > 0 ? [...params.whereParams, queryText] : [...params.whereParams];
  const countWhereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const { rows: countRows } = await dbQuery<{ total: string }>(
    `
    SELECT COUNT(*)::text AS total
    FROM tracks
    ${countWhereSql}
    `,
    countParams
  );

  return {
    hits: rows,
    estimatedTotalHits: Number(countRows[0]?.total ?? 0),
    offset: params.offset,
    limit: params.limit,
    processingTimeMs: Date.now() - startedAt,
  };
}

type SearchMode = TrackSearchMode;

/** Who a semantic search's rate limit counts against. The API has no auth, so this bounds runaway loops rather than enforcing anything. */
function rateLimitCaller(request: NextRequest, friendId: number | undefined): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  return `friend:${friendId ?? "all"}:ip:${ip}`;
}

/** One line per non-lexical search. Never the query text: only its length. */
function logSearch(fields: Record<string, string | number | boolean | undefined>) {
  console.info(JSON.stringify({ component: "track-search", ...fields }));
}

async function searchByMeaning(
  request: NextRequest,
  params: {
    q: string;
    mode: Exclude<SearchMode, "lexical">;
    limit: number;
    filter: string | undefined;
    friendId: number | undefined;
    attributes: TrackAttributeFilters;
    where: string[];
    whereParams: unknown[];
  }
): Promise<{ hits: TrackRow[]; mode: SearchMode; startedAt: number; degraded?: boolean }> {
  const startedAt = Date.now();
  const spec = parseTrackFilterSpec(params.filter);
  // Lexical ANDs both; two different friends can only match nothing.
  if (
    spec.friendId !== undefined &&
    params.friendId !== undefined &&
    spec.friendId !== params.friendId
  ) {
    return { hits: [], mode: params.mode, startedAt };
  }
  const friendId = params.friendId ?? spec.friendId;
  const semanticParams = {
    q: params.q,
    limit: params.mode === "semantic" ? params.limit : HYBRID_LEG_SIZE,
    friendId,
    missing: spec.missing,
    attributes: params.attributes,
    caller: rateLimitCaller(request, friendId),
  };

  if (params.mode === "semantic") {
    const result = await semanticTrackSearch(semanticParams);
    logSearch({
      mode: "semantic",
      query_length: params.q.length,
      cache_hit: result.cacheHit,
      embed_ms: result.embedMs,
      vector_ms: result.vectorMs,
      results: result.hits.length,
      total_ms: Date.now() - startedAt,
    });
    return { hits: result.hits, mode: params.mode, startedAt };
  }

  const [lexical, semantic] = await Promise.all([
    searchTracksPg({
      q: params.q,
      limit: HYBRID_LEG_SIZE,
      offset: 0,
      where: params.where,
      whereParams: params.whereParams,
    }),
    semanticTrackSearch(semanticParams).catch((error: unknown) => error as Error),
  ]);
  const degraded = semantic instanceof Error;
  if (degraded) {
    console.warn("[search] hybrid fell back to lexical:", semantic.message);
  }
  const hits = fuseHybridResults({
    q: params.q,
    lexical: lexical.hits as TrackRow[],
    semantic: degraded ? [] : semantic.hits,
    limit: params.limit,
  });
  logSearch({
    mode: "hybrid",
    query_length: params.q.length,
    degraded,
    cache_hit: degraded ? undefined : semantic.cacheHit,
    embed_ms: degraded ? undefined : semantic.embedMs,
    vector_ms: degraded ? undefined : semantic.vectorMs,
    lexical_results: lexical.hits.length,
    semantic_results: degraded ? 0 : semantic.hits.length,
    results: hits.length,
    total_ms: Date.now() - startedAt,
  });
  return { hits, mode: params.mode, startedAt, ...(degraded ? { degraded } : {}) };
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = trackSearchGetQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries())
    );
    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: parsedQuery.error.flatten(),
        },
        { status: 400 }
      );
    }
    const { q, limit, offset, filter, friend_id, mode, bpm_min, bpm_max, key, star_rating } =
      parsedQuery.data;
    if (bpm_min !== undefined && bpm_max !== undefined && bpm_min > bpm_max) {
      return NextResponse.json({ error: "bpm_min must not exceed bpm_max" }, { status: 400 });
    }
    const attributes: TrackAttributeFilters = {
      bpmMin: bpm_min,
      bpmMax: bpm_max,
      key,
      minStarRating: star_rating,
    };
    if (mode !== "lexical" && (offset > 0 || limit > SEMANTIC_MAX_LIMIT)) {
      return NextResponse.json(
        {
          error: `mode=${mode} returns a single page: offset must be 0 and limit at most ${SEMANTIC_MAX_LIMIT}`,
        },
        { status: 400 }
      );
    }
    const parsedFilter = parseTrackFilter(filter);
    if (friend_id !== undefined) {
      parsedFilter.params.push(friend_id);
      parsedFilter.where.push(`friend_id = $${parsedFilter.params.length}`);
    }
    parsedFilter.where.push(
      ...attributeFilterClauses(attributes, (value) => {
        parsedFilter.params.push(value);
        return `$${parsedFilter.params.length}`;
      })
    );

    // Without words there is no meaning to search; every mode lists the same way.
    if (mode !== "lexical" && q.trim().length > 0) {
      const result = await searchByMeaning(request, {
        q: q.trim(),
        mode,
        limit,
        filter,
        friendId: friend_id,
        attributes,
        where: parsedFilter.where,
        whereParams: parsedFilter.params,
      });
      const validated = trackSearchGetResponseSchema.parse({
        hits: result.hits,
        // One page: the total is what came back, so clients don't ask for more.
        estimatedTotalHits: result.hits.length,
        offset: 0,
        limit,
        processingTimeMs: Date.now() - result.startedAt,
        mode: result.mode,
        ...(result.degraded ? { degraded: true } : {}),
      });
      return NextResponse.json(validated);
    }

    const response = await searchTracksPg({
      q,
      limit,
      offset,
      where: parsedFilter.where,
      whereParams: parsedFilter.params,
    });
    const validated = trackSearchGetResponseSchema.parse(
      mode === "lexical" ? response : { ...response, mode: "lexical" }
    );
    return NextResponse.json(validated);
  } catch (error: any) {
    if (error instanceof QueryRateLimitError) {
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } }
      );
    }
    console.error("Search error:", error);
    return NextResponse.json(
      { error: error.message || "Search failed" },
      { status: 500 }
    );
  }
}
