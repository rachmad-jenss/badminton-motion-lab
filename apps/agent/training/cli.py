"""Command-line entry points for BML smoke and provisioned training runs."""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Sequence

from .records import RecordSource, TrainingDataError
from .runner import TrainingConfig, TrainingRunResult, run_training


REPO_ROOT = Path(__file__).resolve().parents[3]
DERIVED_ROOT = REPO_ROOT / "validation" / "training-derived"
OWN_CAPTURE_ROOT = REPO_ROOT / "validation" / "domain-media"


def run_smoke(output_dir: Path) -> TrainingRunResult:
    """Run a small synthetic-only train/reload/inference proof."""

    with tempfile.TemporaryDirectory(prefix="bml-training-smoke-") as fixture_dir:
        fixture_path = Path(fixture_dir) / "records.jsonl"
        rows = []
        positions = {"smash": 0.2, "drop": 0.5, "clear": 0.8}
        for split in ("train", "validation", "test"):
            for index, (stroke, x) in enumerate(positions.items()):
                rows.append(
                    {
                        "id": f"{split}-{stroke}-{index}",
                        "split": split,
                        "type": stroke,
                        "frame": 10 + index * 5,
                        "fps": 30,
                        "position": {"x": x, "y": 0.5},
                        "opponent_location_x": 1.0 - x,
                        "opponent_location_y": 0.5,
                    }
                )
        fixture_path.write_text(
            "".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8"
        )
        source = RecordSource(
            source_id="shuttleset22",
            path=fixture_path,
            allowed_root=fixture_path.parent,
            provenance={
                "sourceId": "shuttleset22",
                "codeLicense": "MIT",
                "dataLicense": "synthetic_smoke_only",
                "mediaPolicy": "no_redistribution",
                "publicEvidence": False,
            },
        )
        return run_training(
            [source],
            output_dir=Path(output_dir),
            config=TrainingConfig(seed=17, epochs=4, batch_size=4, learning_rate=0.15),
            evidence_class="synthetic_smoke",
        )


def run_provisioned(args: argparse.Namespace) -> TrainingRunResult:
    manifest_path = REPO_ROOT / "validation" / "training-sources.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    entries = {entry["id"]: entry for entry in manifest["sources"]}
    selected = args.source or ["bst", "shuttleset", "shuttleset22"]
    unknown = sorted(set(selected) - set(entries))
    if unknown:
        raise TrainingDataError("unknown registered source(s): " + ", ".join(unknown))

    record_map = _parse_mappings(args.records)
    unknown_records = sorted(set(record_map) - set(selected))
    if unknown_records:
        raise TrainingDataError("records mapping is not selected: " + ", ".join(unknown_records))

    missing_roots = []
    for source_id in selected:
        root = REPO_ROOT / entries[source_id]["localRoot"]
        if not root.is_dir():
            missing_roots.append(f"{source_id}: {root}")
    if missing_roots:
        raise TrainingDataError(
            "missing source roots; provision each checkout under its registry localRoot:\n- "
            + "\n- ".join(missing_roots)
        )

    data_source_ids = {"bfmd", "shuttleset", "shuttleset22", "racketvision"}
    missing_records = [source_id for source_id in selected if source_id in data_source_ids and source_id not in record_map]
    if missing_records:
        raise TrainingDataError(
            "missing explicit --records mapping for data source(s): " + ", ".join(missing_records)
        )

    sources = []
    for source_id, record_path in record_map.items():
        entry = entries[source_id]
        path = _repo_path(record_path)
        sources.append(
            RecordSource(
                source_id=source_id,
                path=path,
                allowed_root=(REPO_ROOT / entry["localRoot"]),
                provenance={key: entry[key] for key in ("codeLicense", "dataLicense", "mediaPolicy", "publicEvidence")},
            )
        )

    held_out_sources = []
    if args.held_out:
        held_out_path = _repo_path(args.held_out)
        held_out_sources.append(
            RecordSource(
                source_id="own_capture",
                path=held_out_path,
                allowed_root=OWN_CAPTURE_ROOT,
                provenance={
                    "codeLicense": "MIT",
                    "dataLicense": "bml_maintainer_owned",
                    "mediaPolicy": "own_capture_only",
                    "publicEvidence": False,
                },
            )
        )

    output_dir = _output_path(args.output_dir) if args.output_dir else DERIVED_ROOT / (
        "run-" + datetime.now().strftime("%Y%m%d-%H%M%S")
    )
    provenance_sources = [
        {
            "sourceId": source_id,
            "codeLicense": entries[source_id]["codeLicense"],
            "dataLicense": entries[source_id]["dataLicense"],
            "mediaPolicy": entries[source_id]["mediaPolicy"],
            "publicEvidence": entries[source_id]["publicEvidence"],
            **(
                {"labelDerivation": "bfmd_caption_keyword_v1"}
                if source_id == "bfmd"
                else {}
            ),
        }
        for source_id in selected
    ]
    return run_training(
        sources,
        output_dir=output_dir,
        config=TrainingConfig(
            seed=args.seed,
            epochs=args.epochs,
            batch_size=args.batch_size,
            learning_rate=args.learning_rate,
            max_records=args.max_records,
            hidden_size=args.hidden_size,
            shuffle_buffer_size=args.shuffle_buffer_size,
        ),
        held_out_sources=held_out_sources,
        evidence_class="own_capture" if held_out_sources else "training_only",
        provenance_sources=provenance_sources,
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "smoke":
            output_dir = _output_path(args.output_dir) if args.output_dir else DERIVED_ROOT / (
                "smoke-" + datetime.now().strftime("%Y%m%d-%H%M%S")
            )
            result = run_smoke(output_dir)
            print("TRAINING_SMOKE PASS")
            print(f"checkpoint={result.checkpoint_path}")
            print(f"evaluation={result.evaluation_path}")
            print(f"trainingUpdates={result.evaluation['trainingUpdates']}")
            print(f"inferenceContractValid={result.evaluation['inferenceContractValid']}")
            print(f"readiness={result.evaluation['readiness']}")
            return 0
        result = run_provisioned(args)
        print("TRAINING_RUN PASS")
        print(f"checkpoint={result.checkpoint_path}")
        print(f"evaluation={result.evaluation_path}")
        print(f"readiness={result.evaluation['readiness']}")
        return 0
    except (TrainingDataError, OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"TRAINING NOT_RUN: {exc}", file=sys.stderr)
        return 2


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Bounded BML stroke model training")
    subparsers = parser.add_subparsers(dest="command", required=True)
    smoke = subparsers.add_parser("smoke", help="train a synthetic fixture and prove reload inference")
    smoke.add_argument("--output-dir")
    run = subparsers.add_parser("run", help="train against explicitly provisioned source records")
    run.add_argument("--source", action="append", help="registered source id; repeatable")
    run.add_argument("--records", action="append", default=[], help="source=records.jsonl or source=records.csv")
    run.add_argument("--held-out", help="own-capture held-out records file")
    run.add_argument("--output-dir")
    run.add_argument("--seed", type=int, default=17)
    run.add_argument("--epochs", type=int, default=5)
    run.add_argument("--batch-size", type=int, default=8)
    run.add_argument("--learning-rate", type=float, default=0.01)
    run.add_argument("--max-records", type=int, default=50_000)
    run.add_argument("--hidden-size", type=int, default=32)
    run.add_argument("--shuffle-buffer-size", type=int, default=1024)
    return parser


def _parse_mappings(values: Sequence[str]) -> dict[str, str]:
    result = {}
    for raw in values:
        source_id, separator, path = raw.partition("=")
        if not separator or not source_id or not path:
            raise TrainingDataError("each --records value must be source=path")
        if source_id in result:
            raise TrainingDataError("duplicate --records mapping for " + source_id)
        result[source_id] = path
    return result


def _repo_path(raw: str) -> Path:
    path = Path(raw).expanduser()
    return path if path.is_absolute() else REPO_ROOT / path


def _output_path(raw: str | None) -> Path:
    path = _repo_path(raw) if raw else DERIVED_ROOT
    resolved = path.resolve()
    try:
        resolved.relative_to(DERIVED_ROOT.resolve())
    except ValueError as exc:
        raise TrainingDataError("output must stay under validation/training-derived") from exc
    return resolved


if __name__ == "__main__":
    raise SystemExit(main())
