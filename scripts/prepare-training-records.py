"""Create bounded, deterministic BML records from local source annotations."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from bisect import bisect_left, bisect_right
from pathlib import Path


LABEL_MAP = {
    "發短球": "serve",
    "發長球": "serve",
    "short service": "serve",
    "long service": "serve",
    "長球": "clear",
    "挑球": "lift",
    "殺球": "smash",
    "點扣": "smash",
    "切球": "drop",
    "過度切球": "drop",
    "放小球": "net_shot",
    "勾球": "net_shot",
    "推球": "drive",
    "撲球": "drive",
    "平球": "drive",
    "小平球": "drive",
    "後場抽平球": "drive",
    "擋小球": "defensive_return",
    "防守回挑": "defensive_return",
    "防守回抽": "defensive_return",
    "defensive shot": "defensive_return",
    "lob": "lift",
    "push/rush": "drive",
}

BFMD_LABELS = {
    "serve": "serve",
    "flick_serve": "serve",
    "smash": "smash",
    "clear": "clear",
    "drop": "drop",
    "drive": "drive",
    "lift": "lift",
    "block": "block",
    "net_shot": "net_shot",
    "net shot": "net_shot",
    "net_kill": "net_shot",
    "net kill": "net_shot",
}
BFMD_ORIENTATION_LABELS = {"forehand", "backhand", "jump_smash"}
BFMD_CANONICAL_LABELS = set(BFMD_LABELS.values()) | BFMD_ORIENTATION_LABELS
BFMD_WINDOW_CONTEXT_FRAMES = 48

def split_for(source_id: str, match: str, seed: int) -> str:
    digest = hashlib.sha256(f"{seed}:{source_id}:{match}".encode("utf-8")).digest()
    bucket = int.from_bytes(digest[:4], "big") % 100
    if bucket < 80:
        return "train"
    if bucket < 90:
        return "validation"
    return "test"


def _number(value: str | float | int | None) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _point(row: dict[str, str], x_key: str, y_key: str, frame: float) -> dict | None:
    x = _number(row.get(x_key))
    y = _number(row.get(y_key))
    if x is None or y is None:
        return None
    return {"frameIndex": int(frame) if frame.is_integer() else frame, "x": x, "y": y}


def _temporal_context(rows: list[tuple[int, dict[str, str]]]) -> dict[str, list[dict]]:
    context = {"player": [], "opponent": [], "shuttle": []}
    for _, row in rows:
        frame = _number(row.get("frame_num"))
        if frame is None:
            continue
        for key, x_key, y_key in (
            ("player", "player_location_x", "player_location_y"),
            ("opponent", "opponent_location_x", "opponent_location_y"),
            ("shuttle", "landing_x", "landing_y"),
        ):
            point = _point(row, x_key, y_key, frame)
            if point is not None and len(context[key]) < 64:
                context[key].append(point)
    return context


def _motion_summary(points: list[dict], fps: float = 30.0) -> tuple[float, float, float]:
    by_frame: dict[float, list[tuple[float, float]]] = {}
    for point in points[:64]:
        frame = _number(point.get("frameIndex"))
        x = _number(point.get("x"))
        y = _number(point.get("y"))
        if frame is None or x is None or y is None:
            continue
        by_frame.setdefault(frame, []).append((x, y))
    ordered = sorted(
        (frame, sum(x for x, _ in values) / len(values), sum(y for _, y in values) / len(values))
        for frame, values in by_frame.items()
    )
    if len(ordered) < 2:
        return 0.0, 0.0, 0.0
    speeds: list[float] = []
    intervals: list[float] = []
    for previous, current in zip(ordered, ordered[1:]):
        dt_seconds = max(current[0] - previous[0], 1.0) / max(fps, 1.0)
        speeds.append(((current[1] - previous[1]) ** 2 + (current[2] - previous[2]) ** 2) ** 0.5 / dt_seconds)
        intervals.append(dt_seconds)
    accelerations = [
        abs(speeds[index] - speeds[index - 1]) / max(intervals[index], 1e-6)
        for index in range(1, len(speeds))
    ]
    return (
        sum(speeds) / len(speeds),
        max(speeds),
        max(accelerations) if accelerations else 0.0,
    )


def _temporal_features(
    context: dict[str, list[dict]], window_start_frame: float, window_end_frame: float
) -> dict[str, float]:
    features = {"window_span_seconds": max(window_end_frame - window_start_frame, 1.0) / 30.0}
    for prefix, key in (("pose", "player"), ("shuttle", "shuttle"), ("racket", "racket")):
        mean, peak, acceleration = _motion_summary(context.get(key, []))
        features[prefix + "_speed_mean"] = mean
        features[prefix + "_speed_peak"] = peak
        features[prefix + "_acceleration_peak"] = acceleration
    return features


def _bfmd_label_for_shot(shot: dict) -> str | None:
    captions = shot.get("captions") if isinstance(shot.get("captions"), dict) else {}
    caption_text = " ".join(
        str(captions.get(key, "")) for key in ("refined", "clean", "auto")
    ).casefold()
    if "jump smash" in caption_text or "jump-smash" in caption_text:
        return "jump_smash"
    if "backhand" in caption_text:
        return "backhand"
    if "forehand" in caption_text:
        return "forehand"
    shot_type = str(shot.get("shot_type", "")).strip().casefold().replace("-", "_")
    return BFMD_LABELS.get(shot_type)


def _bfmd_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict) or not isinstance(value.get("shots"), list):
        raise ValueError(f"BFMD caption file has no shots list: {path}")
    return value


def _bounded_track_points(
    points: list[tuple[float, float, float]], window_start: float, window_end: float
) -> list[tuple[float, float, float]]:
    if not points:
        return []
    frames = [point[0] for point in points]
    start = bisect_left(frames, window_start)
    end = bisect_right(frames, window_end)
    selected = points[start:end]
    if len(selected) <= 64:
        return selected
    indices = [round(index * (len(selected) - 1) / 63) for index in range(64)]
    return [selected[index] for index in indices]


def _bfmd_track_points(path: Path, *, bounding_boxes: bool) -> list[tuple[float, float, float]]:
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    points: list[tuple[float, float, float]] = []
    for section_name in ("annotations", "predictions"):
        for annotation in data.get(section_name, []):
            for result in annotation.get("result", []):
                value = result.get("value", {})
                sequence = value.get("sequence") if isinstance(value, dict) else None
                if not isinstance(sequence, list):
                    continue
                for item in sequence:
                    if not isinstance(item, dict):
                        continue
                    frame = _number(item.get("frame"))
                    x = _number(item.get("x"))
                    y = _number(item.get("y"))
                    width = _number(item.get("width")) or 0.0
                    height = _number(item.get("height")) or 0.0
                    if frame is None or x is None or y is None:
                        continue
                    if bounding_boxes:
                        x += width / 2.0
                        y += height / 2.0
                    points.append((frame, x / 100.0, y / 100.0))
    return sorted(points, key=lambda point: point[0])


def _bfmd_labels(path: Path) -> set[str]:
    try:
        data = _bfmd_json(path)
    except (OSError, ValueError, json.JSONDecodeError):
        return set()
    return {
        label
        for shot in data["shots"]
        if isinstance(shot, dict)
        for label in [_bfmd_label_for_shot(shot)]
        if label in BFMD_LABELS.values() or label in BFMD_ORIENTATION_LABELS
    }


def _bfmd_file_splits(
    files: list[Path], labels_by_file: dict[Path, set[str]], seed: int
) -> dict[Path, str]:
    """Assign whole matches to deterministic splits and protect rare labels."""

    assignments: dict[Path, str] = {}
    remaining = list(files)
    rare_labels = set(BFMD_ORIENTATION_LABELS) | {"block"}
    for split in ("test", "validation"):
        if not remaining:
            break
        candidates = sorted(
            remaining,
            key=lambda path: (-len(labels_by_file.get(path, set()) & rare_labels), str(path)),
        )
        selected = candidates[0]
        assignments[selected] = split
        remaining.remove(selected)
    for path in remaining:
        assignments[path] = split_for("bfmd", path.stem, seed)
    return assignments


def _bfmd_window(frames: list[float], frame: float) -> tuple[float, float]:
    if not frames:
        return frame, frame + 1.0
    start = max(min(frames), frame - BFMD_WINDOW_CONTEXT_FRAMES)
    end = min(max(frames), frame + BFMD_WINDOW_CONTEXT_FRAMES)
    if end <= start:
        end = max(start + 1.0, frame)
    return start, end


def _bfmd_record(
    root: Path,
    path: Path,
    shot: dict,
    row_number: int,
    label: str,
    split: str,
    window_start: float,
    window_end: float,
    pose_points: list[tuple[float, float, float]],
    shuttle_points: list[tuple[float, float, float]],
) -> dict:
    frame = _number(shot.get("frame"))
    game = shot.get("game", "")
    rally = shot.get("rally", "")
    return {
        "id": f"bfmd:{path.stem}:{game}:{rally}:{frame}:{row_number}",
        "match": path.stem,
        "game": game,
        "rally": rally,
        "shot_type": shot.get("shot_type", ""),
        "strokeId": label,
        "type": label,
        "frame": frame,
        "fps": 30,
        "window_start_frame": int(window_start) if window_start.is_integer() else window_start,
        "window_end_frame": int(window_end) if window_end.is_integer() else window_end,
        "pose": {
            "frames": [
                {
                    "frameIndex": frame,
                    "landmarks": [{"x": x, "y": y}],
                }
                for frame, x, y in pose_points
            ]
        }
        if pose_points
        else None,
        "shuttle": {
            "points": [
                {"frameIndex": frame, "x": x, "y": y}
                for frame, x, y in shuttle_points
            ]
        }
        if shuttle_points
        else None,
        "split": split,
        "label_source": "bfmd_caption_keyword"
        if label in BFMD_ORIENTATION_LABELS
        else "bfmd_shot_type",
        "source_file": str(path.relative_to(root)).replace("\\", "/"),
    }


def _prepare_bfmd(
    root: Path,
    output: Path,
    seed: int,
    max_records: int | None,
    include_labels: set[str] | None = None,
) -> dict[str, int | str]:
    caption_root = root / "data" / "BFMD_data" / "annotations" / "caption"
    files = sorted(path for path in caption_root.glob("*.json") if path.is_file())
    labels_by_file = {path: _bfmd_labels(path) for path in files}
    file_splits = _bfmd_file_splits(files, labels_by_file, seed)
    counts = {
        "files": len(files),
        "records": 0,
        "skippedUnsupported": 0,
        "skippedMissingFrame": 0,
        "skippedFiltered": 0,
    }
    split_counts = {"train": 0, "validation": 0, "test": 0}
    with output.open("w", encoding="utf-8", newline="") as handle:
        for path in files:
            try:
                shots = _bfmd_json(path)["shots"]
            except (OSError, ValueError, json.JSONDecodeError):
                counts["skippedUnsupported"] += 1
                continue
            player_points = _bfmd_track_points(
                root / "data" / "BFMD_data" / "annotations" / "player_bbox" / path.name,
                bounding_boxes=True,
            )
            shuttle_points = _bfmd_track_points(
                root / "data" / "BFMD_data" / "annotations" / "shuttle" / path.name,
                bounding_boxes=False,
            )
            rally_frames: dict[tuple[str, str], list[float]] = {}
            for shot in shots:
                if not isinstance(shot, dict):
                    continue
                frame = _number(shot.get("frame"))
                if frame is not None:
                    key = (str(shot.get("game", "")), str(shot.get("rally", "")))
                    rally_frames.setdefault(key, []).append(frame)
            for row_number, shot in enumerate(shots, start=1):
                if not isinstance(shot, dict):
                    counts["skippedUnsupported"] += 1
                    continue
                label = _bfmd_label_for_shot(shot)
                frame = _number(shot.get("frame"))
                if label is None or label not in BFMD_CANONICAL_LABELS:
                    counts["skippedUnsupported"] += 1
                    continue
                if include_labels is not None and label not in include_labels:
                    counts["skippedFiltered"] += 1
                    continue
                if frame is None or frame < 0:
                    counts["skippedMissingFrame"] += 1
                    continue
                key = (str(shot.get("game", "")), str(shot.get("rally", "")))
                frames = rally_frames.get(key, [frame])
                window_start, window_end = _bfmd_window(frames, frame)
                record = _bfmd_record(
                    root,
                    path,
                    shot,
                    row_number,
                    label,
                    file_splits[path],
                    window_start,
                    window_end,
                    _bounded_track_points(player_points, window_start, window_end),
                    _bounded_track_points(shuttle_points, window_start, window_end),
                )
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")
                counts["records"] += 1
                split_counts[file_splits[path]] += 1
                if max_records is not None and counts["records"] >= max_records:
                    return {**counts, **{f"split_{key}": value for key, value in split_counts.items()}, "output": str(output)}
    return {**counts, **{f"split_{key}": value for key, value in split_counts.items()}, "output": str(output)}


def build_record(
    source_id: str,
    root: Path,
    path: Path,
    row: dict[str, str],
    row_number: int,
    seed: int,
    window_start_frame: float,
    window_end_frame: float,
    temporal_features: dict[str, float],
) -> dict:
    match = path.parent.name
    set_name = path.stem
    sample_id = f"{source_id}:{match}:{set_name}:{row.get('rally', '')}:{row.get('ball_round', '')}:{row_number}"
    return {
        "id": sample_id,
        "match": match,
        "set": set_name,
        "rally": row.get("rally", ""),
        "ball_round": row.get("ball_round", ""),
        "window_start_frame": int(window_start_frame) if window_start_frame.is_integer() else window_start_frame,
        "window_end_frame": int(window_end_frame) if window_end_frame.is_integer() else window_end_frame,
        "temporalFeatures": temporal_features,
        "type": LABEL_MAP[row.get("type", "").strip()],
        "frame_num": row.get("frame_num", ""),
        "player_location_x": row.get("player_location_x", ""),
        "player_location_y": row.get("player_location_y", ""),
        "opponent_location_x": row.get("opponent_location_x", ""),
        "opponent_location_y": row.get("opponent_location_y", ""),
        "landing_x": row.get("landing_x", ""),
        "landing_y": row.get("landing_y", ""),
        "backhand": row.get("backhand", ""),
        "aroundhead": row.get("aroundhead", ""),
        "split": split_for(source_id, match, seed),
        "source_file": str(path.relative_to(root)).replace("\\", "/"),
    }


def prepare(
    source_id: str,
    root: Path,
    output: Path,
    seed: int,
    max_records: int | None,
    include_labels: set[str] | None = None,
) -> dict[str, int | str]:
    root = root.expanduser().resolve()
    output = output.expanduser().resolve()
    if not root.is_dir():
        raise SystemExit(f"source root missing: {root}")
    try:
        output.relative_to(root)
    except ValueError as exc:
        raise SystemExit("output must stay inside the source root") from exc

    if source_id == "bfmd":
        output.parent.mkdir(parents=True, exist_ok=True)
        return _prepare_bfmd(root, output, seed, max_records, include_labels)
    if include_labels is not None:
        raise SystemExit("--include-label is only supported with --source-id bfmd")

    files = sorted(
        path
        for path in (root / "set").rglob("set*.csv")
        if path.is_file() and path.stem[3:].isdigit()
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    counts = {"files": len(files), "records": 0, "skippedUnsupported": 0, "skippedMissingFrame": 0}
    split_counts = {"train": 0, "validation": 0, "test": 0}
    with output.open("w", encoding="utf-8", newline="\n") as handle:
        stop = False
        for path in files:
            rows_by_rally: dict[str, list[tuple[int, dict[str, str]]]] = {}
            with path.open("r", encoding="utf-8-sig", newline="") as source_handle:
                for row_number, row in enumerate(csv.DictReader(source_handle), start=2):
                    label = row.get("type", "").strip()
                    if label not in LABEL_MAP:
                        counts["skippedUnsupported"] += 1
                        continue
                    if not row.get("frame_num", "").strip():
                        counts["skippedMissingFrame"] += 1
                        continue
                    rally = row.get("rally", "")
                    rows_by_rally.setdefault(rally, []).append((row_number, row))
            for rally_rows in rows_by_rally.values():
                frame_values = [_number(row.get("frame_num")) for _, row in rally_rows]
                frames = [frame for frame in frame_values if frame is not None]
                if not frames:
                    continue
                temporal = _temporal_context(rally_rows)
                temporal_features = _temporal_features(temporal, min(frames), max(frames))
                for row_number, row in rally_rows:
                    handle.write(
                        json.dumps(
                            build_record(
                                source_id,
                                root,
                                path,
                                row,
                                row_number,
                                seed,
                                min(frames),
                                max(frames),
                                temporal_features,
                            ),
                            ensure_ascii=False,
                        )
                        + "\n"
                    )
                    counts["records"] += 1
                    split_counts[split_for(source_id, path.parent.name, seed)] += 1
                    if max_records is not None and counts["records"] >= max_records:
                        stop = True
                        break
                if stop:
                    break
            if stop:
                break
    return {**counts, **{f"split_{key}": value for key, value in split_counts.items()}, "output": str(output)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-id", required=True, choices=("bfmd", "shuttleset", "shuttleset22"))
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--max-records", type=int)
    parser.add_argument("--include-label", action="append", choices=sorted(BFMD_CANONICAL_LABELS))
    args = parser.parse_args()
    if args.max_records is not None and args.max_records < 1:
        parser.error("--max-records must be positive")
    print(
        json.dumps(
            prepare(
                args.source_id,
                args.root,
                args.output,
                args.seed,
                args.max_records,
                set(args.include_label) if args.include_label else None,
            ),
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
