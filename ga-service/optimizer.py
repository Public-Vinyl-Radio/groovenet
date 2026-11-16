import json
import math
import random
import re
import time
from collections import defaultdict

import numpy as np
from keys import _parse_key
from ranking import LEGACY_WEIGHTS, failed_constraints, pool_rank


def _parse_embedding(value):
    if value is None:
        return None
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, (list, tuple)):
        return None
    parsed = []
    for item in value:
        try:
            parsed.append(float(item))
        except (TypeError, ValueError):
            return None
    return parsed


def normalize_embedding(value):
    embedding = _parse_embedding(value)
    if not embedding:
        return None
    norm = math.sqrt(sum(x * x for x in embedding))
    if norm == 0:
        return None
    return [x / norm for x in embedding]


def _clamp(value, low=0.0, high=1.0):
    return max(low, min(high, value))


def score_transition(i, j, embeddings, norms, bpms):
    sim = 0.0 if norms[i] == 0 or norms[j] == 0 else np.dot(embeddings[i], embeddings[j]) / (norms[i] * norms[j])
    bpm_diff = abs(bpms[i] - bpms[j]) / 10
    return sim - bpm_diff


def score_playlist(order, embeddings, norms, bpms):
    return sum(score_transition(order[k], order[k + 1], embeddings, norms, bpms) for k in range(len(order) - 1))


def crossover(p1, p2):
    size = len(p1)
    slice_size = size // 2
    start = random.randint(0, size - slice_size)
    slice_ = p1[start : start + slice_size]
    rest = [x for x in p2 if x not in slice_]
    return slice_ + rest


def mutate(order, rate=0.05):
    if random.random() < rate:
        i, j = random.sample(range(len(order)), 2)
        order[i], order[j] = order[j], order[i]
    return order


def _evolve(n, score, generations, pop_size, seed_idx):
    # Initialize population
    if seed_idx is None:
        population = [random.sample(range(n), n) for _ in range(pop_size)]
    else:
        rest = list(range(n))
        rest.remove(seed_idx)
        population = [[seed_idx] + random.sample(rest, n - 1) for _ in range(pop_size)]
    # Evolve
    for _ in range(generations):
        scored = sorted(population, key=score, reverse=True)
        top = scored[:10]
        new_gen = top[:2]  # elitism
        while len(new_gen) < pop_size:
            p1, p2 = random.sample(top, 2)
            child = mutate(crossover(p1[:], p2[:]))
            new_gen.append(child)
        population = new_gen
    return max(population, key=score)


def run_genetic_algorithm(tracks, generations=20, pop_size=40, seed=None, seed_idx=None, ranking=None):
    """
    Runs a genetic algorithm to order tracks by embedding similarity and BPM continuity.

    Args:
        tracks (list[dict]): Each dict must have keys 'embedding' (JSON string) and optional 'bpm'.
        generations (int): Number of evolution cycles.
        pop_size (int): Population size.
        seed (int, optional): Seed for reproducibility.
        seed_idx (int, optional): Index of track to pin as first in playlist.
        ranking (OrderingRanking, optional): Score transitions with these weights and
            constraints instead of cosine similarity minus |ΔBPM|/10 (#1193).

    Returns:
        list[dict]: Ordered list of track dicts.
    """
    n = len(tracks)
    if n < 2:
        return tracks[:]
    # Seed RNGs
    if seed is not None:
        random.seed(seed)
        np.random.seed(seed)
    if ranking is not None:
        # A profile's transitions are directional (a BPM ratio, an energy
        # rise), so the best order is kept as it is rather than canonicalised.
        _, transition_scores = _build_score_matrices(_prepare_track_features(tracks), ranking)
        best = _evolve(
            n,
            lambda order: sum(transition_scores[order[k]][order[k + 1]] for k in range(n - 1)),
            generations,
            pop_size,
            seed_idx,
        )
        return [tracks[i] for i in best]
    # Prepare arrays
    embeddings = np.array([json.loads(t["embedding"]) for t in tracks], dtype=np.float32)
    norms = np.linalg.norm(embeddings, axis=1)
    bpms = np.array([t.get("bpm", 0) for t in tracks], dtype=np.float32)
    best = _evolve(
        n,
        lambda order: score_playlist(order, embeddings, norms, bpms),
        generations,
        pop_size,
        seed_idx,
    )
    # Tie-break reverse
    rev = list(reversed(best))
    canonical = min(best, rev)
    return [tracks[i] for i in canonical]


def run_greedy_algorithm(tracks, ranking=None):
    if len(tracks) < 2:
        return tracks[:]

    _, transition_scores = _build_score_matrices(_prepare_track_features(tracks), ranking)
    remaining = set(range(len(tracks)))
    order = [0]
    remaining.remove(0)

    while remaining:
        current = order[-1]
        next_idx = max(
            remaining,
            key=lambda idx: transition_scores[current][idx],
        )
        order.append(next_idx)
        remaining.remove(next_idx)

    return [tracks[i] for i in order]


def _as_float(value, default=None):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _positive_float(value):
    number = _as_float(value)
    return number if number is not None and math.isfinite(number) and number > 0 else None


def bpm_compatibility(bpm_a, bpm_b):
    a = _as_float(bpm_a)
    b = _as_float(bpm_b)
    if not a or not b or a <= 0 or b <= 0:
        return 0.5

    best_diff = min(abs(a - b * factor) for factor in (0.5, 1.0, 2.0))
    return _clamp(1.0 - (best_diff / 24.0))


def key_compatibility(key_a, key_b):
    a = _parse_key(key_a)
    b = _parse_key(key_b)
    if not a or not b:
        return 0.5

    if a[0] == "camelot" and b[0] == "camelot":
        _, num_a, letter_a = a
        _, num_b, letter_b = b
        if num_a == num_b and letter_a == letter_b:
            return 1.0
        if num_a == num_b and letter_a != letter_b:
            return 0.9
        if letter_a == letter_b and abs(num_a - num_b) in (1, 11):
            return 0.8
        return 0.25

    if a[0] == "basic" and b[0] == "basic":
        _, pc_a, mode_a = a
        _, pc_b, mode_b = b
        diff = min((pc_a - pc_b) % 12, (pc_b - pc_a) % 12)
        if pc_a == pc_b and mode_a == mode_b:
            return 1.0
        if mode_a != mode_b and diff in (0, 3):
            return 0.85
        if diff in (5, 7):
            return 0.7
        return 0.25

    return 0.5


def _tokens_from_value(value):
    if value is None:
        return set()
    if isinstance(value, (list, tuple, set)):
        values = value
    else:
        values = re.split(r"[,;/|#\n]+", str(value))

    tokens = set()
    for item in values:
        for token in re.split(r"\s+", str(item).strip().lower()):
            normalized = re.sub(r"[^a-z0-9+&-]", "", token)
            if normalized:
                tokens.add(normalized)
    return tokens


def _weighted_metadata_tokens(track):
    weighted = defaultdict(float)
    for field, weight in (
        ("genres", 1.4),
        ("styles", 1.2),
        ("local_tags", 1.0),
        ("notes", 0.4),
    ):
        for token in _tokens_from_value(track.get(field)):
            weighted[token] += weight
    return weighted


def metadata_similarity(track_a, track_b):
    return _metadata_similarity_from_weights(
        _weighted_metadata_tokens(track_a),
        _weighted_metadata_tokens(track_b),
    )


def _energy_raw(track):
    """Energy from danceability and mood, or None when the track has none of them."""
    values = [
        _as_float(track.get("danceability")),
        _as_float(track.get("mood_happy")),
        _as_float(track.get("mood_aggressive")),
    ]
    relaxed = _as_float(track.get("mood_relaxed"))
    if relaxed is not None:
        values.append(1.0 - relaxed)
    values = [value for value in values if value is not None]
    if not values:
        return None
    return _clamp(sum(values) / len(values))


def _energy(track):
    energy = _energy_raw(track)
    if energy is None:
        rating = _as_float(track.get("star_rating"))
        return _clamp(rating / 5.0) if rating is not None else 0.5
    return energy


def weighted_transition_score(metadata, embedding, energy, bpm, key, same_artist, same_album, weights):
    """
    The one transition scorer every mode uses (#1193): each term is in [0, 1],
    higher mixing better, and a shared artist or album is subtracted. With
    `LEGACY_WEIGHTS` this is the score the optimiser has always used.
    """
    score = (
        metadata * weights.metadata
        + embedding * weights.embedding
        + energy * weights.energy
        + bpm * weights.bpm
        + key * weights.key
    )
    if same_artist:
        score -= weights.same_artist
    if same_album:
        score -= weights.same_album
    return score


def transition_score(track_a, track_b, ranking=None):
    _, transition_scores = _build_score_matrices(_prepare_track_features([track_a, track_b]), ranking)
    return transition_scores[0][1]


def _metadata_similarity_from_weights(a, b):
    if not a or not b:
        return 0.0
    keys = set(a) | set(b)
    intersection = sum(min(a[key], b[key]) for key in keys)
    union = sum(max(a[key], b[key]) for key in keys)
    return 0.0 if union == 0 else intersection / union


def _dot_similarity(a, b):
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b))


def _prepare_track_features(tracks):
    return [
        {
            "metadata": _weighted_metadata_tokens(track),
            "embedding": normalize_embedding(track.get("embedding")),
            "energy": _energy(track),
            "energy_raw": _energy_raw(track),
            "bpm": track.get("bpm"),
            "bpm_value": _positive_float(track.get("bpm")),
            "key": track.get("key"),
            "artist": str(track.get("artist") or "").strip().lower(),
            "album": str(track.get("album") or "").strip().lower(),
        }
        for track in tracks
    ]


def _same_feature_text(features, i, j, field):
    return bool(features[i][field] and features[i][field] == features[j][field])


def _position_score_from_energy(energy, index, total):
    if total <= 1:
        return 1.0

    progress = index / (total - 1)
    if progress < 0.25:
        target = 0.35 + progress * 1.2
    elif progress < 0.75:
        target = 0.65 + (progress - 0.25) * 0.4
    else:
        target = 0.85 - (progress - 0.75) * 1.2

    return _clamp(1.0 - abs(energy - target))


def _embedding_scores(features, pooled):
    """
    The embedding term of every pair, (cos + 1) / 2, and 0 where either
    track has no embedding. `pooled` (ranking version 2, #1218) replaces
    each known pair's value with its rank among the request's pairs
    (`pool_rank`), so the term spans [0, 1] like the others.
    """
    n = len(features)
    scores = [[0.0] * n for _ in range(n)]
    pairs = []
    raw = []
    for i in range(n):
        for j in range(i + 1, n):
            embedding = _dot_similarity(features[i]["embedding"], features[j]["embedding"])
            if embedding:
                pairs.append((i, j))
                raw.append((embedding + 1.0) / 2.0)
    values = pool_rank(raw) if pooled else raw
    for (i, j), value in zip(pairs, values):
        scores[i][j] = scores[j][i] = value
    return scores


def _build_score_matrices(features, ranking=None):
    """
    Pairwise metadata similarity and transition scores. Without `ranking`,
    `LEGACY_WEIGHTS` and no constraints: today's scores, to the bit. With it,
    the profile's weights (and from version 2 the pool-ranked embedding
    term), and each failed constraint costs `ranking.constraint_penalty`.
    """
    n = len(features)
    weights = LEGACY_WEIGHTS if ranking is None else ranking.weights
    embeddings = _embedding_scores(features, ranking is not None and ranking.version >= 2)
    metadata_scores = [[0.0] * n for _ in range(n)]
    transition_scores = [[0.0] * n for _ in range(n)]

    for i in range(n):
        for j in range(n):
            if i == j:
                continue

            metadata = _metadata_similarity_from_weights(
                features[i]["metadata"],
                features[j]["metadata"],
            )
            embedding = embeddings[i][j]
            energy = 1.0 - abs(features[i]["energy"] - features[j]["energy"])
            bpm = bpm_compatibility(features[i]["bpm"], features[j]["bpm"])
            key = key_compatibility(features[i]["key"], features[j]["key"])

            score = weighted_transition_score(
                metadata,
                embedding,
                energy,
                bpm,
                key,
                _same_feature_text(features, i, j, "artist"),
                _same_feature_text(features, i, j, "album"),
                weights,
            )
            if ranking is not None:
                failures = failed_constraints(ranking.constraints, features[i], features[j])
                score -= ranking.constraint_penalty * len(failures)

            metadata_scores[i][j] = metadata
            transition_scores[i][j] = score

    return metadata_scores, transition_scores


def _score_index_order(order, features, transition_scores):
    if not order:
        return 0.0

    transition_total = sum(transition_scores[order[i]][order[i + 1]] for i in range(len(order) - 1))
    position_total = sum(
        _position_score_from_energy(features[track_idx]["energy"], index, len(order)) * 0.18
        for index, track_idx in enumerate(order)
    )
    repeat_penalty = 0.0
    for i, track_idx in enumerate(order):
        for j in range(i + 1, min(len(order), i + 4)):
            other_idx = order[j]
            distance_factor = (4 - (j - i)) / 3
            if _same_feature_text(features, track_idx, other_idx, "artist"):
                repeat_penalty += 0.35 * distance_factor
            if _same_feature_text(features, track_idx, other_idx, "album"):
                repeat_penalty += 0.20 * distance_factor
    return transition_total + position_total - repeat_penalty


def _cluster_track_indices(track_indices, metadata_scores):
    clusters = []
    for track_idx in track_indices:
        best_cluster_idx = None
        best_score = 0.0
        for cluster_idx, cluster in enumerate(clusters):
            score = sum(metadata_scores[track_idx][other_idx] for other_idx in cluster) / len(cluster)
            if score > best_score:
                best_cluster_idx = cluster_idx
                best_score = score
        if best_cluster_idx is not None and best_score >= 0.22:
            clusters[best_cluster_idx].append(track_idx)
        else:
            clusters.append([track_idx])
    return clusters


def _order_index_block(track_indices, features, transition_scores):
    if len(track_indices) < 2:
        return track_indices[:]

    best_order = None
    best_score = None
    for start_idx in track_indices:
        remaining = set(track_indices)
        order = [start_idx]
        remaining.remove(start_idx)
        while remaining:
            current = order[-1]
            next_idx = max(
                remaining,
                key=lambda candidate: transition_scores[current][candidate],
            )
            order.append(next_idx)
            remaining.remove(next_idx)

        score = _score_index_order(order, features, transition_scores)
        if best_score is None or score > best_score:
            best_order = order
            best_score = score
    return best_order


def _index_block_similarity(block_a, block_b, transition_scores):
    scores = [transition_scores[track_a][track_b] for track_a in block_a for track_b in block_b]
    return sum(scores) / len(scores) if scores else 0.0


def _order_index_blocks(blocks, features, transition_scores):
    if len(blocks) < 2:
        return blocks[:]

    best_order = None
    best_score = None
    for start_idx in range(len(blocks)):
        remaining = set(range(len(blocks)))
        order = [start_idx]
        remaining.remove(start_idx)
        while remaining:
            current = order[-1]
            next_idx = max(
                remaining,
                key=lambda candidate: _index_block_similarity(
                    blocks[current],
                    blocks[candidate],
                    transition_scores,
                ),
            )
            order.append(next_idx)
            remaining.remove(next_idx)

        ordered_blocks = [blocks[i] for i in order]
        flattened = [track_idx for block in ordered_blocks for track_idx in block]
        score = _score_index_order(flattened, features, transition_scores)
        if best_score is None or score > best_score:
            best_order = ordered_blocks
            best_score = score
    return best_order


def _local_search_indices(order, features, transition_scores, passes=3, max_distance=3):
    best_order = order[:]
    best_score = _score_index_order(best_order, features, transition_scores)
    for _ in range(passes):
        improved = False
        for i in range(len(best_order)):
            for j in range(i + 1, min(len(best_order), i + max_distance + 1)):
                candidate = best_order[:]
                candidate[i], candidate[j] = candidate[j], candidate[i]
                score = _score_index_order(candidate, features, transition_scores)
                if score > best_score:
                    best_order = candidate
                    best_score = score
                    improved = True
        if not improved:
            break
    return best_order


def run_cohesive_blocks_optimizer(tracks, ranking=None):
    if len(tracks) < 2:
        return tracks[:]

    started_at = time.perf_counter()
    print(
        f"[cohesive_blocks] start tracks={len(tracks)}",
        flush=True,
    )

    features = _prepare_track_features(tracks)
    embedding_count = sum(1 for feature in features if feature["embedding"])
    print(
        f"[cohesive_blocks] prepared features embeddings={embedding_count}/{len(tracks)} "
        f"elapsed={time.perf_counter() - started_at:.3f}s",
        flush=True,
    )

    metadata_scores, transition_scores = _build_score_matrices(features, ranking)
    print(
        f"[cohesive_blocks] built score matrices elapsed={time.perf_counter() - started_at:.3f}s",
        flush=True,
    )

    clusters = _cluster_track_indices(list(range(len(tracks))), metadata_scores)
    print(
        f"[cohesive_blocks] clustered blocks={len(clusters)} "
        f"sizes={[len(cluster) for cluster in clusters]} "
        f"elapsed={time.perf_counter() - started_at:.3f}s",
        flush=True,
    )

    ordered_clusters = [_order_index_block(cluster, features, transition_scores) for cluster in clusters]
    ordered_blocks = _order_index_blocks(ordered_clusters, features, transition_scores)
    ordered = [track_idx for block in ordered_blocks for track_idx in block]
    print(
        f"[cohesive_blocks] ordered blocks elapsed={time.perf_counter() - started_at:.3f}s",
        flush=True,
    )

    searched = _local_search_indices(ordered, features, transition_scores)
    print(
        f"[cohesive_blocks] complete elapsed={time.perf_counter() - started_at:.3f}s",
        flush=True,
    )
    return [tracks[i] for i in searched]
