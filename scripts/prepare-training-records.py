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


def build_record(source_id: str, root: Path, path: Path, row: dict[str, str], row_number: int, seed: int) -> dict:
    match = path.parent.name
    set_name = path.stem
    sample_id = f"{source_id}:{match}:{set_name}:{row.get('rally', '')}:{row.get('ball_round', '')}:{row_number}"
    return {
        "id": sample_id,
        "match": match,
        "set": set_name,
        "rally": row.get("rally", ""),
        "ball_round": row.get("ball_round", ""),
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
        for path in files:
            with path.open("r", encoding="utf-8-sig", newline="") as source_handle:
                for row_number, row in enumerate(csv.DictReader(source_handle), start=2):
                    label = row.get("type", "").strip()
                    if label not in LABEL_MAP:
                        counts["skippedUnsupported"] += 1
                        continue
                    if not row.get("frame_num", "").strip():
                        counts["skippedMissingFrame"] += 1
                        continue
                    handle.write(json.dumps(build_record(source_id, root, path, row, row_number, seed), ensure_ascii=False) + "\n")
                    counts["records"] += 1
                    split_counts[split_for(source_id, path.parent.name, seed)] += 1
                    if max_records is not None and counts["records"] >= max_records:
                        break
            if max_records is not None and counts["records"] >= max_records:
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
