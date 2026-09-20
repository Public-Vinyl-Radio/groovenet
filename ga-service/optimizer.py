import json
import math
import random
import re
import time
from collections import defaultdict

import numpy as np


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


def cosine_similarity(a, b):
    norm_a = normalize_embedding(a)
    norm_b = normalize_embedding(b)
    if not norm_a or not norm_b or len(norm_a) != len(norm_b):
        return 0.0
    return sum(x * y for x, y in zip(norm_a, norm_b))


def _clamp(value, low=0.0, high=1.0):
    return max(low, min(high, value))


def score_transition(i, j, embeddings, norms, bpms):
    sim = (
        0.0
        if norms[i] == 0 or norms[j] == 0
        else np.dot(embeddings[i], embeddings[j]) / (norms[i] * norms[j])
    )
    bpm_diff = abs(bpms[i] - bpms[j]) / 10
    return sim - bpm_diff


def score_playlist(order, embeddings, norms, bpms):
    return sum(
        score_transition(order[k], order[k+1], embeddings, norms, bpms)
        for k in range(len(order)-1)
    )


def crossover(p1, p2):
    size = len(p1)
    slice_size = size // 2
    start = random.randint(0, size - slice_size)
    slice_ = p1[start:start + slice_size]
    rest = [x for x in p2 if x not in slice_]
    return slice_ + rest


def mutate(order, rate=0.05):
    if random.random() < rate:
        i, j = random.sample(range(len(order)), 2)
        order[i], order[j] = order[j], order[i]
    return order


def run_genetic_algorithm(tracks, generations=20, pop_size=40, seed=None, seed_idx=None):
    """
    Runs a genetic algorithm to order tracks by embedding similarity and BPM continuity.

    Args:
        tracks (list[dict]): Each dict must have keys 'embedding' (JSON string) and optional 'bpm'.
        generations (int): Number of evolution cycles.
        pop_size (int): Population size.
        seed (int, optional): Seed for reproducibility.
        seed_idx (int, optional): Index of track to pin as first in playlist.

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
    # Prepare arrays
    embeddings = np.array([json.loads(t['embedding'])
                          for t in tracks], dtype=np.float32)
    norms = np.linalg.norm(embeddings, axis=1)
    bpms = np.array([t.get('bpm', 0) for t in tracks], dtype=np.float32)
    # Initialize population
    if seed_idx is None:
        population = [random.sample(range(n), n) for _ in range(pop_size)]
    else:
        rest = list(range(n))
        rest.remove(seed_idx)
        population = [[seed_idx] +
                      random.sample(rest, n-1) for _ in range(pop_size)]
    # Evolve
    for _ in range(generations):
        scored = sorted(
            population,
            key=lambda order: score_playlist(order, embeddings, norms, bpms),
            reverse=True
        )
        top = scored[:10]
        new_gen = top[:2]  # elitism
        while len(new_gen) < pop_size:
            p1, p2 = random.sample(top, 2)
            child = mutate(crossover(p1[:], p2[:]))
            new_gen.append(child)
        population = new_gen
    # Select best and tie-break reverse
    best = max(population, key=lambda o: score_playlist(
        o, embeddings, norms, bpms))
    rev = list(reversed(best))
    canonical = min(best, rev)
    return [tracks[i] for i in canonical]


def run_greedy_algorithm(tracks):
    if len(tracks) < 2:
        return tracks[:]

    remaining = set(range(len(tracks)))
    order = [0]
    remaining.remove(0)

    while remaining:
        current = order[-1]
        next_idx = max(
            remaining,
            key=lambda idx: transition_score(tracks[current], tracks[idx]),
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


def bpm_compatibility(bpm_a, bpm_b):
    a = _as_float(bpm_a)
    b = _as_float(bpm_b)
    if not a or not b or a <= 0 or b <= 0:
        return 0.5

    best_diff = min(abs(a - b * factor) for factor in (0.5, 1.0, 2.0))
    return _clamp(1.0 - (best_diff / 24.0))


_CAMELOT_RE = re.compile(r"^\s*(1[0-2]|[1-9])\s*([AB])\s*$", re.I)
_PITCH_CLASS = {
    "c": 0,
    "b#": 0,
    "c#": 1,
    "db": 1,
    "d": 2,
    "d#": 3,
    "eb": 3,
    "e": 4,
    "fb": 4,
    "e#": 5,
    "f": 5,
    "f#": 6,
    "gb": 6,
    "g": 7,
    "g#": 8,
    "ab": 8,
    "a": 9,
    "a#": 10,
    "bb": 10,
    "b": 11,
    "cb": 11,
}


def _parse_key(value):
    if not value:
        return None
    raw = str(value).strip()
    camelot = _CAMELOT_RE.match(raw)
    if camelot:
        return ("camelot", int(camelot.group(1)), camelot.group(2).upper())

    cleaned = raw.lower().replace(" major", "").replace(" minor", "m")
    cleaned = cleaned.replace("maj", "").replace("min", "m").replace(" ", "")
    mode = "minor" if cleaned.endswith("m") else "major"
    note = cleaned[:-1] if mode == "minor" else cleaned
    if note in _PITCH_CLASS:
        return ("basic", _PITCH_CLASS[note], mode)
    return None


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
    a = _weighted_metadata_tokens(track_a)
    b = _weighted_metadata_tokens(track_b)
    if not a or not b:
        return 0.0

    keys = set(a) | set(b)
    intersection = sum(min(a[key], b[key]) for key in keys)
    union = sum(max(a[key], b[key]) for key in keys)
    return 0.0 if union == 0 else intersection / union


def _energy(track):
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
        rating = _as_float(track.get("star_rating"))
        return _clamp(rating / 5.0) if rating is not None else 0.5
    return _clamp(sum(values) / len(values))


def _same_text(track_a, track_b, field):
    a = str(track_a.get(field) or "").strip().lower()
    b = str(track_b.get(field) or "").strip().lower()
    return bool(a and b and a == b)


def transition_score(track_a, track_b):
    metadata = metadata_similarity(track_a, track_b)
    embedding = cosine_similarity(track_a.get("embedding"), track_b.get("embedding"))
    embedding = (embedding + 1.0) / 2.0 if embedding else 0.0
    energy = 1.0 - abs(_energy(track_a) - _energy(track_b))
    bpm = bpm_compatibility(track_a.get("bpm"), track_b.get("bpm"))
    key = key_compatibility(track_a.get("key"), track_b.get("key"))

    score = (
        metadata * 0.36
        + embedding * 0.24
        + energy * 0.20
        + bpm * 0.08
        + key * 0.05
    )
    if _same_text(track_a, track_b, "artist"):
        score -= 0.20
    if _same_text(track_a, track_b, "album"):
        score -= 0.12
    return score


def position_score(track, index, total):
    if total <= 1:
        return 1.0

    progress = index / (total - 1)
    if progress < 0.25:
        target = 0.35 + progress * 1.2
    elif progress < 0.75:
        target = 0.65 + (progress - 0.25) * 0.4
    else:
        target = 0.85 - (progress - 0.75) * 1.2

    vibe = _energy(track)
    return _clamp(1.0 - abs(vibe - target))


def total_playlist_score(tracks):
    if not tracks:
        return 0.0
    transition_total = sum(
        transition_score(tracks[i], tracks[i + 1])
        for i in range(len(tracks) - 1)
    )
    position_total = sum(
        position_score(track, index, len(tracks)) * 0.18
        for index, track in enumerate(tracks)
    )
    repeat_penalty = 0.0
    for i, track in enumerate(tracks):
        for j in range(i + 1, min(len(tracks), i + 4)):
            distance_factor = (4 - (j - i)) / 3
            if _same_text(track, tracks[j], "artist"):
                repeat_penalty += 0.35 * distance_factor
            if _same_text(track, tracks[j], "album"):
                repeat_penalty += 0.20 * distance_factor
    return transition_total + position_total - repeat_penalty


def _cluster_tracks(tracks):
    clusters = []
    for track in tracks:
        best_idx = None
        best_score = 0.0
        for idx, cluster in enumerate(clusters):
            score = sum(
                metadata_similarity(track, other)
                for other in cluster
            ) / len(cluster)
            if score > best_score:
                best_idx = idx
                best_score = score
        if best_idx is not None and best_score >= 0.22:
            clusters[best_idx].append(track)
        else:
            clusters.append([track])
    return clusters


def _order_by_greedy_transition(tracks):
    if len(tracks) < 2:
        return tracks[:]
    best_order = None
    best_score = None
    for start in range(len(tracks)):
        remaining = set(range(len(tracks)))
        order = [start]
        remaining.remove(start)
        while remaining:
            current = order[-1]
            next_idx = max(
                remaining,
                key=lambda idx: transition_score(tracks[current], tracks[idx]),
            )
            order.append(next_idx)
            remaining.remove(next_idx)
        ordered_tracks = [tracks[i] for i in order]
        score = total_playlist_score(ordered_tracks)
        if best_score is None or score > best_score:
            best_order = ordered_tracks
            best_score = score
    return best_order


def _block_similarity(block_a, block_b):
    pairs = [
        transition_score(track_a, track_b)
        for track_a in block_a
        for track_b in block_b
    ]
    return sum(pairs) / len(pairs) if pairs else 0.0


def _order_blocks(blocks):
    if len(blocks) < 2:
        return blocks[:]
    best_order = None
    best_score = None
    for start in range(len(blocks)):
        remaining = set(range(len(blocks)))
        order = [start]
        remaining.remove(start)
        while remaining:
            current = order[-1]
            next_idx = max(
                remaining,
                key=lambda idx: _block_similarity(blocks[current], blocks[idx]),
            )
            order.append(next_idx)
            remaining.remove(next_idx)
        ordered_blocks = [blocks[i] for i in order]
        flattened = [track for block in ordered_blocks for track in block]
        score = total_playlist_score(flattened)
        if best_score is None or score > best_score:
            best_order = ordered_blocks
            best_score = score
    return best_order


def _local_search(tracks, passes=3, max_distance=3):
    ordered = tracks[:]
    best_score = total_playlist_score(ordered)
    for _ in range(passes):
        improved = False
        for i in range(len(ordered)):
            for j in range(i + 1, min(len(ordered), i + max_distance + 1)):
                candidate = ordered[:]
                candidate[i], candidate[j] = candidate[j], candidate[i]
                score = total_playlist_score(candidate)
                if score > best_score:
                    ordered = candidate
                    best_score = score
                    improved = True
        if not improved:
            break
    return ordered


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
            "bpm": track.get("bpm"),
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


def _build_score_matrices(features):
    n = len(features)
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
            embedding = _dot_similarity(features[i]["embedding"], features[j]["embedding"])
            embedding = (embedding + 1.0) / 2.0 if embedding else 0.0
            energy = 1.0 - abs(features[i]["energy"] - features[j]["energy"])
            bpm = bpm_compatibility(features[i]["bpm"], features[j]["bpm"])
            key = key_compatibility(features[i]["key"], features[j]["key"])

            score = (
                metadata * 0.36
                + embedding * 0.24
                + energy * 0.20
                + bpm * 0.08
                + key * 0.05
            )
            if _same_feature_text(features, i, j, "artist"):
                score -= 0.20
            if _same_feature_text(features, i, j, "album"):
                score -= 0.12

            metadata_scores[i][j] = metadata
            transition_scores[i][j] = score

    return metadata_scores, transition_scores


def _score_index_order(order, features, transition_scores):
    if not order:
        return 0.0

    transition_total = sum(
        transition_scores[order[i]][order[i + 1]]
        for i in range(len(order) - 1)
    )
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
            score = sum(
                metadata_scores[track_idx][other_idx]
                for other_idx in cluster
            ) / len(cluster)
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
    scores = [
        transition_scores[track_a][track_b]
        for track_a in block_a
        for track_b in block_b
    ]
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


def run_cohesive_blocks_optimizer(tracks):
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

    metadata_scores, transition_scores = _build_score_matrices(features)
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

    ordered_clusters = [
        _order_index_block(cluster, features, transition_scores)
        for cluster in clusters
    ]
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


# Example usage:
if __name__ == '__main__':
    # Example track list (replace with real embeddings/BPMs)
    my_tracks = [
        {'embedding': json.dumps([0.1, 0.2, 0.3]), 'bpm': 120},
        {'embedding': json.dumps([0.2, 0.1, 0.4]), 'bpm': 128},
        {'embedding': json.dumps([0.4, 0.3, 0.2]), 'bpm': 115},
        # add more tracks...
    ]
    ordered = run_genetic_algorithm(
        my_tracks,
        generations=30,
        pop_size=60,
        seed=123,
        seed_idx=0
    )
    # Print the ordered BPMs to verify
    for idx, track in enumerate(ordered, 1):
        print(
            f"{idx:2d}: BPM={track.get('bpm')} | Embedding={track['embedding']}")
