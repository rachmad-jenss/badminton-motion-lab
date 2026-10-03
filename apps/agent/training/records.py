"""Streaming, source-aware training record normalization for BML."""

from __future__ import annotations

import csv
import hashlib
import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator, Sequence


TRAINING_RECORD_SCHEMA_VERSION = 1

BML_STROKE_LABELS = (
    "serve",
    "forehand",
    "backhand",
    "smash",
    "clear",
    "drop",
    "drive",
    "net_shot",
    "lift",
    "block",
    "defensive_return",
    "jump_smash",
)

FEATURE_NAMES = (
    "fps",
    "player_x",
    "player_y",
    "opponent_x",
    "opponent_y",
    "landing_x",
    "landing_y",
    "backhand",
    "around_head",
    "pose_count",
    "shuttle_count",
    "racket_count",
    "pose_mean_x",
    "pose_mean_y",
    "shuttle_mean_x",
    "shuttle_mean_y",
    "racket_mean_x",
    "racket_mean_y",
    "sequence_span",
)

_SOURCE_IDS = frozenset({"bfmd", "bst", "shuttleset", "shuttleset22", "racketvision", "own_capture"})
_LABEL_ALIASES = {
    "netshot": "net_shot",
    "net-shot": "net_shot",
    "net shot": "net_shot",
    "defense": "defensive_return",
    "defensive_return": "defensive_return",
    "defensive return": "defensive_return",
    "jump-smash": "jump_smash",
    "jump smash": "jump_smash",
    "around head": "jump_smash",
}
_SPLIT_ALIASES = {
    "val": "validation",
    "valid": "validation",
    "dev": "validation",
    "validation": "validation",
    "train": "train",
    "training": "train",
    "test": "test",
    "heldout": "held_out",
    "held-out": "held_out",
    "held_out": "held_out",
}


class TrainingDataError(RuntimeError):
    """Raised when a source cannot be safely consumed for training."""


class _UnsupportedRecord(TrainingDataError):
    pass


@dataclass(frozen=True)
class RecordSource:
    source_id: str
    path: Path
    allowed_root: Path
    provenance: dict[str, Any]


@dataclass
class ReaderStats:
    records_seen: int = 0
    records_yielded: int = 0
    skipped_missing_label: int = 0
    skipped_missing_contact: int = 0
    skipped_unsupported_label: int = 0
    skipped_malformed: int = 0
    source_counts: dict[str, int] = field(default_factory=dict)


def stable_split(source_id: str, sample_id: str, *, seed: int) -> str:
    digest = hashlib.sha256(f"{seed}:{source_id}:{sample_id}".encode("utf-8")).digest()
    bucket = int.from_bytes(digest[:4], "big") % 100
    if bucket < 80:
        return "train"
    if bucket < 90:
        return "validation"
    return "test"


def iter_training_records(
    sources: Sequence[RecordSource],
    *,
    seed: int,
    max_records: int = 50_000,
    max_record_bytes: int = 1 << 20,
    max_sequence_items: int = 64,
    stats: ReaderStats | None = None,
) -> Iterator[dict[str, Any]]:
    """Yield normalized records while retaining at most one record in memory."""

    if max_records < 1:
        raise ValueError("max_records must be positive")
    if max_record_bytes < 1:
        raise ValueError("max_record_bytes must be positive")
    if max_sequence_items < 1:
        raise ValueError("max_sequence_items must be positive")

    read_stats = stats or ReaderStats()
    yielded = 0
    for source in sources:
        if yielded >= max_records:
            return
        path = _validate_source(source)
        for raw in _iter_raw_records(path, max_record_bytes=max_record_bytes):
            if yielded >= max_records:
                return
            read_stats.records_seen += 1
            try:
                _check_sequence_caps(raw, max_sequence_items=max_sequence_items)
                record = normalize_training_record(
                    source.source_id,
                    raw,
                    seed=seed,
                    provenance=source.provenance,
                )
            except _UnsupportedRecord as exc:
                read_stats.skipped_unsupported_label += 1 if "stroke" in str(exc) else 0
                read_stats.skipped_missing_label += 1 if "stroke label" in str(exc) else 0
                read_stats.skipped_missing_contact += 1 if "contact frame" in str(exc) else 0
                continue
            except TrainingDataError:
                read_stats.skipped_malformed += 1
                raise
            read_stats.records_yielded += 1
            read_stats.source_counts[source.source_id] = read_stats.source_counts.get(source.source_id, 0) + 1
            yielded += 1
            yield record


def normalize_training_record(
    source_id: str,
    raw: dict[str, Any],
    *,
    seed: int,
    provenance: dict[str, Any],
) -> dict[str, Any]:
    if source_id not in _SOURCE_IDS:
        raise TrainingDataError(f"unknown training source: {source_id}")
    if not isinstance(raw, dict):
        raise TrainingDataError("training record must be an object")

    sample_id = _sample_id(source_id, raw)
    split = _split_for(source_id, raw.get("split"), sample_id, seed)
    stroke_raw = _first(raw, "strokeId", "stroke_id", "strokeType", "stroke_type", "shotType", "shot_type", "type")
    if stroke_raw in (None, ""):
        raise _UnsupportedRecord("missing stroke label")
    stroke_id = _canonical_label(stroke_raw)
    if stroke_id not in BML_STROKE_LABELS:
        raise _UnsupportedRecord(f"unsupported stroke label: {stroke_raw}")

    contact_raw = _first(
        raw,
        "contactFrame",
        "contact_frame",
        "hitFrame",
        "hit_frame",
        "frameIndex",
        "frame_idx",
        "frame_num",
        "frame",
    )
    contact_frame = _number_or_none(contact_raw)
    if contact_frame is None or contact_frame < 0:
        raise _UnsupportedRecord("missing contact frame")

    features: dict[str, Any] = {}
    player = _first(raw, "position", "playerPosition", "player_position")
    opponent = _first(raw, "opponentPosition", "opponent_position")
    landing = _first(raw, "landing")
    if player is None:
        player = _position(raw.get("player_location_x"), raw.get("player_location_y"))
    if opponent is None:
        opponent = _position(raw.get("opponent_location_x"), raw.get("opponent_location_y"))
    if landing is None:
        landing = _position(raw.get("landing_x"), raw.get("landing_y"))
    features["playerPosition"] = player
    features["opponentPosition"] = opponent
    features["landing"] = landing
    features["backhand"] = _bool_or_none(_first(raw, "backhand"))
    features["aroundHead"] = _bool_or_none(_first(raw, "aroundHead", "aroundhead", "around_head"))
    if isinstance(raw.get("modelFeatures"), list):
        features["modelFeatures"] = raw["modelFeatures"]

    return {
        "schemaVersion": TRAINING_RECORD_SCHEMA_VERSION,
        "sampleId": sample_id,
        "sourceId": source_id,
        "split": split,
        "strokeId": stroke_id,
        "contactFrame": int(contact_frame),
        "fps": _number_or_none(_first(raw, "fps")),
        "pose": _series(_first(raw, "pose", "joints"), "frames"),
        "courtCorners": _first(raw, "courtCorners"),
        "shuttle": _series(_first(raw, "shuttle", "shuttlecock", "ball"), "points"),
        "racket": _series(_first(raw, "racket"), "points"),
        "features": features,
        "confidence": _number_or_none(_first(raw, "confidence")),
        "provenance": {
            **provenance,
            "sourceId": source_id,
            "publicEvidence": False,
        },
    }


def extract_feature_vector(record: dict[str, Any]) -> list[float]:
    """Return fixed features independent of stroke/contact labels."""

    features = record.get("features") or {}
    player = _xy(features.get("playerPosition"))
    opponent = _xy(features.get("opponentPosition"))
    landing = _xy(features.get("landing"))
    pose = _summarize_series(record.get("pose"), "frames")
    shuttle = _summarize_series(record.get("shuttle"), "points")
    racket = _summarize_series(record.get("racket"), "points")
    fps = _number_or_none(record.get("fps")) or 0.0
    return [
        _finite_or_zero(fps / 60.0),
        _finite_or_zero(player[0]),
        _finite_or_zero(player[1]),
        _finite_or_zero(opponent[0]),
        _finite_or_zero(opponent[1]),
        _finite_or_zero(landing[0]),
        _finite_or_zero(landing[1]),
        1.0 if features.get("backhand") is True else 0.0,
        1.0 if features.get("aroundHead") is True else 0.0,
        pose[0] / 64.0,
        shuttle[0] / 64.0,
        racket[0] / 64.0,
        _finite_or_zero(pose[1]),
        _finite_or_zero(pose[2]),
        _finite_or_zero(shuttle[1]),
        _finite_or_zero(shuttle[2]),
        _finite_or_zero(racket[1]),
        _finite_or_zero(racket[2]),
        _finite_or_zero(max(pose[3], shuttle[3], racket[3])),
    ]


def _validate_source(source: RecordSource) -> Path:
    if source.source_id not in _SOURCE_IDS:
        raise TrainingDataError(f"unknown training source: {source.source_id}")
    allowed_root = source.allowed_root.expanduser().resolve()
    path = source.path.expanduser().resolve()
    if not allowed_root.exists():
        raise TrainingDataError(f"source root missing: {allowed_root}")
    try:
        path.relative_to(allowed_root)
    except ValueError as exc:
        raise TrainingDataError(f"source file outside allowed source root: {path}") from exc
    if not path.is_file():
        raise TrainingDataError(f"source records file missing: {path}")
    if path.suffix.lower() not in {".jsonl", ".ndjson", ".csv"}:
        raise TrainingDataError("source records file must be .jsonl, .ndjson, or .csv")
    return path


def _iter_raw_records(path: Path, *, max_record_bytes: int) -> Iterator[dict[str, Any]]:
    if path.suffix.lower() == ".csv":
        previous_limit = csv.field_size_limit()
        csv.field_size_limit(max_record_bytes)
        try:
            with path.open("r", encoding="utf-8-sig", newline="") as handle:
                for row in csv.DictReader(handle):
                    yield {key: _coerce_text(value) for key, value in row.items()}
        except csv.Error as exc:
            raise TrainingDataError(f"CSV record exceeds {max_record_bytes} bytes: {path}") from exc
        finally:
            csv.field_size_limit(previous_limit)
        return

    with path.open("r", encoding="utf-8") as handle:
        while True:
            line = handle.readline(max_record_bytes + 2)
            if not line:
                return
            if len(line.encode("utf-8")) > max_record_bytes:
                _drain_line(handle)
                raise TrainingDataError(f"record exceeds {max_record_bytes} bytes: {path}")
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as exc:
                raise TrainingDataError(f"invalid JSONL record in {path}: {exc.msg}") from exc
            if not isinstance(value, dict):
                raise TrainingDataError(f"JSONL record must be an object: {path}")
            yield value


def _drain_line(handle: Any) -> None:
    while True:
        chunk = handle.readline(4096)
        if not chunk or chunk.endswith("\n"):
            return


def _check_sequence_caps(value: Any, *, max_sequence_items: int, path: str = "record") -> None:
    if isinstance(value, list):
        if len(value) > max_sequence_items:
            raise TrainingDataError(f"sequence exceeds {max_sequence_items} items at {path}")
        for index, item in enumerate(value):
            _check_sequence_caps(item, max_sequence_items=max_sequence_items, path=f"{path}[{index}]")
    elif isinstance(value, dict):
        for key, item in value.items():
            _check_sequence_caps(item, max_sequence_items=max_sequence_items, path=f"{path}.{key}")


def _sample_id(source_id: str, raw: dict[str, Any]) -> str:
    requested = _first(raw, "sampleId", "sample_id", "id")
    if requested not in (None, ""):
        return str(requested)
    if source_id in {"bfmd", "racketvision"}:
        values = [_first(raw, "matchId", "match"), _first(raw, "rallyId", "rally")]
    elif source_id in {"shuttleset", "shuttleset22"}:
        values = [raw.get("match"), raw.get("set"), raw.get("rally"), raw.get("ball_round")]
    else:
        values = [_first(raw, "match", "matchId"), _first(raw, "rally", "rallyId")]
    joined = "-".join(str(value) for value in values if value not in (None, ""))
    return joined or f"{source_id}-record"


def _split_for(source_id: str, raw_split: Any, sample_id: str, seed: int) -> str:
    if source_id == "own_capture":
        if raw_split not in (None, "", "held_out", "heldout", "held-out"):
            raise TrainingDataError("own_capture records must use held_out split")
        return "held_out"
    if raw_split in (None, ""):
        return stable_split(source_id, sample_id, seed=seed)
    normalized = _SPLIT_ALIASES.get(str(raw_split).strip().lower())
    if normalized is None:
        raise TrainingDataError(f"unsupported training split: {raw_split}")
    if normalized == "held_out":
        raise TrainingDataError("held-out split is reserved for own_capture")
    return normalized


def _canonical_label(value: Any) -> str:
    normalized = str(value).strip().lower().replace("_", "_")
    normalized = _LABEL_ALIASES.get(normalized, normalized.replace(" ", "_"))
    return normalized.replace("-", "_")


def _series(value: Any, key: str) -> Any:
    if value is None:
        return None
    if isinstance(value, list):
        return {key: value}
    if isinstance(value, dict):
        if key in value:
            return value
        if key == "points" and "keypoints" in value:
            return {"points": value["keypoints"]}
        return value
    return None


def _summarize_series(value: Any, key: str) -> tuple[float, float, float, float]:
    points: list[tuple[float, float, float | None]] = []

    def visit(node: Any, frame: float | None = None) -> None:
        if isinstance(node, dict):
            local_frame = _number_or_none(_first(node, "frameIndex", "frame_index", "frame", "frame_num"))
            local_frame = frame if local_frame is None else local_frame
            x = _number_or_none(node.get("x"))
            y = _number_or_none(node.get("y"))
            if x is not None and y is not None:
                points.append((x, y, local_frame))
            for child_key, child in node.items():
                if child_key not in {"x", "y", "confidence", "visibility", "frameIndex", "frame_index", "frame", "frame_num"}:
                    visit(child, local_frame)
        elif isinstance(node, list):
            for child in node[:64]:
                visit(child, frame)

    visit(value.get(key) if isinstance(value, dict) and key in value else value)
    if not points:
        return 0.0, 0.0, 0.0, 0.0
    mean_x = sum(point[0] for point in points) / len(points)
    mean_y = sum(point[1] for point in points) / len(points)
    frames = [point[2] for point in points if point[2] is not None]
    span = max(frames) - min(frames) if frames else 0.0
    return float(len(points)), mean_x, mean_y, span


def _xy(value: Any) -> tuple[float, float]:
    if not isinstance(value, dict):
        return 0.0, 0.0
    return _finite_or_zero(_number_or_none(value.get("x"))), _finite_or_zero(_number_or_none(value.get("y")))


def _position(x: Any, y: Any) -> dict[str, float] | None:
    px = _number_or_none(x)
    py = _number_or_none(y)
    if px is None or py is None:
        return None
    return {"x": px, "y": py}


def _first(raw: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in raw and raw[key] not in (None, ""):
            return raw[key]
    return None


def _number_or_none(value: Any) -> float | None:
    if value in (None, "") or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _finite_or_zero(value: float | None) -> float:
    return float(value) if value is not None and math.isfinite(value) else 0.0


def _bool_or_none(value: Any) -> bool | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return value
    if str(value).strip().lower() in {"true", "1", "yes"}:
        return True
    if str(value).strip().lower() in {"false", "0", "no"}:
        return False
    return None


def _coerce_text(value: Any) -> Any:
    if value in (None, ""):
        return None
    text = str(value).strip()
    lowered = text.lower()
    if lowered in {"true", "false"}:
        return lowered == "true"
    try:
        number = float(text)
        return int(number) if number.is_integer() else number
    except ValueError:
        return text
