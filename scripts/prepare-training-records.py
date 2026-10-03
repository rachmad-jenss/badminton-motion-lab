"""Create bounded, deterministic BML records from ShuttleSet CSV annotations."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
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


def prepare(source_id: str, root: Path, output: Path, seed: int, max_records: int | None) -> dict[str, int | str]:
    root = root.expanduser().resolve()
    output = output.expanduser().resolve()
    if not root.is_dir():
        raise SystemExit(f"source root missing: {root}")
    try:
        output.relative_to(root)
    except ValueError as exc:
        raise SystemExit("output must stay inside the source root") from exc

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
    parser.add_argument("--source-id", required=True, choices=("shuttleset", "shuttleset22"))
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--max-records", type=int)
    args = parser.parse_args()
    if args.max_records is not None and args.max_records < 1:
        parser.error("--max-records must be positive")
    print(json.dumps(prepare(args.source_id, args.root, args.output, args.seed, args.max_records), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
