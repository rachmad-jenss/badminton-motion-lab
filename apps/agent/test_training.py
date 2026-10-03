"""Unit tests for the bounded training reader and checkpoint path."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from training.records import (
    FEATURE_NAMES,
    RecordSource,
    ReaderStats,
    TrainingDataError,
    extract_feature_vector,
    iter_training_records,
    stable_split,
)


def _source(path: Path, source_id: str = "shuttleset22") -> RecordSource:
    return RecordSource(
        source_id=source_id,
        path=path,
        allowed_root=path.parent,
        provenance={
            "sourceId": source_id,
            "codeLicense": "MIT",
            "dataLicense": "MIT_annotations_broadcast_media_restricted",
            "mediaPolicy": "no_redistribution",
            "publicEvidence": False,
        },
    )


def _write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")


def test_stable_split_is_reproducible_and_bounded() -> None:
    first = stable_split("shuttleset22", "match-1-rally-2", seed=17)
    second = stable_split("shuttleset22", "match-1-rally-2", seed=17)

    assert first == second
    assert first in {"train", "validation", "test"}


def test_iter_training_records_normalizes_jsonl_and_preserves_source_provenance(
    tmp_path: Path,
) -> None:
    records_path = tmp_path / "records.jsonl"
    _write_jsonl(
        records_path,
        [
            {
                "match": "match-1",
                "set": 1,
                "rally": 2,
                "ball_round": 3,
                "split": "validation",
                "frame_num": 42,
                "type": "smash",
                "player_location_x": 0.4,
                "player_location_y": 0.8,
                "opponent_location_x": 0.6,
                "opponent_location_y": 0.2,
                "landing_x": 0.3,
                "landing_y": 0.1,
                "backhand": False,
                "aroundhead": True,
            }
        ],
    )

    result = list(iter_training_records([_source(records_path)], seed=17))

    assert len(result) == 1
    assert result[0]["schemaVersion"] == 1
    assert result[0]["sampleId"] == "match-1-1-2-3"
    assert result[0]["split"] == "validation"
    assert result[0]["strokeId"] == "smash"
    assert result[0]["contactFrame"] == 42
    assert result[0]["provenance"]["publicEvidence"] is False


def test_reader_rejects_a_source_file_outside_allowed_root(tmp_path: Path) -> None:
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    outside = tmp_path / "outside.jsonl"
    _write_jsonl(outside, [{"id": "outside", "stroke_type": "smash", "frame": 1}])

    source = RecordSource(
        source_id="bst",
        path=outside,
        allowed_root=allowed,
        provenance={"sourceId": "bst", "publicEvidence": False},
    )

    with pytest.raises(TrainingDataError, match="outside allowed source root"):
        list(iter_training_records([source], seed=17))


def test_reader_rejects_an_overlong_jsonl_record(tmp_path: Path) -> None:
    records_path = tmp_path / "records.jsonl"
    _write_jsonl(records_path, [{"id": "large", "stroke_type": "smash", "frame": 1, "padding": "x" * 200}])

    with pytest.raises(TrainingDataError, match="record exceeds"):
        list(iter_training_records([_source(records_path)], seed=17, max_record_bytes=80))


def test_reader_rejects_an_overlong_sequence(tmp_path: Path) -> None:
    records_path = tmp_path / "records.jsonl"
    _write_jsonl(
        records_path,
        [
            {
                "id": "sequence-1",
                "stroke_type": "smash",
                "frame": 4,
                "joints": [{"x": 0.1, "y": 0.2}] * 3,
            }
        ],
    )

    with pytest.raises(TrainingDataError, match="sequence exceeds"):
        list(iter_training_records([_source(records_path, "bst")], seed=17, max_sequence_items=2))


def test_unsupported_labels_are_skipped_and_counted(tmp_path: Path) -> None:
    records_path = tmp_path / "records.jsonl"
    _write_jsonl(
        records_path,
        [
            {"id": "supported", "stroke_type": "smash", "frame": 4},
            {"id": "unsupported", "stroke_type": "push", "frame": 5},
        ],
    )
    stats = ReaderStats()

    result = list(iter_training_records([_source(records_path, "bst")], seed=17, stats=stats))

    assert [row["sampleId"] for row in result] == ["supported"]
    assert stats.records_seen == 2
    assert stats.records_yielded == 1
    assert stats.skipped_unsupported_label == 1


def test_feature_vector_does_not_use_labels() -> None:
    record = {
        "fps": 30,
        "strokeId": "smash",
        "contactFrame": 12,
        "pose": None,
        "shuttle": {"points": [{"x": 0.2, "y": 0.3}]},
        "racket": None,
        "features": {
            "playerPosition": {"x": 0.4, "y": 0.5},
            "opponentPosition": {"x": 0.6, "y": 0.5},
            "landing": {"x": 0.3, "y": 0.2},
            "backhand": False,
            "aroundHead": True,
        },
    }

    vector = extract_feature_vector(record)
    changed_label_vector = extract_feature_vector({**record, "strokeId": "drop", "contactFrame": 99})

    assert len(vector) == len(FEATURE_NAMES)
    assert vector == changed_label_vector
