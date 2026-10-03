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
from training.model import FEATURE_SCHEMA_VERSION, REQUIRED_OUTPUTS, load_checkpoint, predict_checkpoint
from training.cli import run_smoke
from training.runner import TrainingConfig, run_training
from main import _optional_stroke_prediction, _stroke_prediction_for_analysis
from adapters.media import MediaError


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


def test_iter_training_records_normalizes_shuttleset_labels(tmp_path: Path) -> None:
    records_path = tmp_path / "shuttleset.csv"
    records_path.write_text(
        "type,frame_num,player_location_x,player_location_y,opponent_location_x,opponent_location_y\n"
        "發短球,10,0.2,0.3,0.8,0.7\n"
        "點扣,20,0.3,0.4,0.7,0.6\n"
        "放小球,30,0.4,0.5,0.6,0.5\n",
        encoding="utf-8",
    )

    records = list(iter_training_records([_source(records_path, "shuttleset")], seed=17))

    assert [record["strokeId"] for record in records] == ["serve", "smash", "net_shot"]


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


def _training_rows() -> list[dict]:
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
    return rows


def test_training_updates_parameters_and_evaluates_all_source_splits(tmp_path: Path) -> None:
    records_path = tmp_path / "records.jsonl"
    _write_jsonl(records_path, _training_rows())
    result = run_training(
        [_source(records_path)],
        output_dir=tmp_path / "run",
        config=TrainingConfig(seed=17, epochs=3, batch_size=3, learning_rate=0.2),
    )

    assert result.checkpoint_path.is_file()
    assert result.manifest_path.is_file()
    assert result.evaluation_path.is_file()
    assert len(result.checkpoint_sha256) == 64
    assert result.evaluation["trainingUpdates"] > 0
    assert result.evaluation["inferenceContractValid"] is True
    assert result.evaluation["metrics"]["train"]["records"] == 3
    assert result.evaluation["metrics"]["validation"]["records"] == 3
    assert result.evaluation["metrics"]["test"]["records"] == 3
    assert result.evaluation["readiness"] == "locked"


def test_checkpoint_reload_produces_required_contract_prediction(tmp_path: Path) -> None:
    records_path = tmp_path / "records.jsonl"
    _write_jsonl(records_path, _training_rows())
    result = run_training(
        [_source(records_path)],
        output_dir=tmp_path / "run",
        config=TrainingConfig(seed=17, epochs=2, batch_size=3, learning_rate=0.2),
    )

    checkpoint = load_checkpoint(result.checkpoint_path, expected_sha256=result.checkpoint_sha256)
    prediction = predict_checkpoint(checkpoint, [0.0] * len(FEATURE_NAMES))

    assert set(REQUIRED_OUTPUTS).issubset(prediction)
    assert prediction["strokeId"] in {"serve", "forehand", "backhand", "smash", "clear", "drop", "drive", "net_shot", "lift", "block", "defensive_return", "jump_smash"}
    assert isinstance(prediction["contactFrame"], int)
    assert 0.0 <= prediction["confidence"] <= 1.0
    assert prediction["provenance"]["checkpointSha256"] == result.checkpoint_sha256
    assert checkpoint["featureSchemaVersion"] == FEATURE_SCHEMA_VERSION


def test_missing_source_fails_before_checkpoint_creation(tmp_path: Path) -> None:
    missing_root = tmp_path / "missing-source"
    source = RecordSource(
        source_id="shuttleset22",
        path=missing_root / "records.jsonl",
        allowed_root=missing_root,
        provenance={"sourceId": "shuttleset22", "publicEvidence": False},
    )
    output_dir = tmp_path / "run"

    with pytest.raises(TrainingDataError, match="source root missing"):
        run_training(
            [source],
            output_dir=output_dir,
            config=TrainingConfig(seed=17, epochs=1, batch_size=2, learning_rate=0.1),
        )

    assert not output_dir.exists()


def test_smoke_runner_proves_training_reload_and_stays_locked(tmp_path: Path) -> None:
    result = run_smoke(tmp_path / "smoke")

    assert result.evaluation["trainingUpdates"] > 0
    assert result.evaluation["inferenceContractValid"] is True
    assert result.evaluation["evidenceClass"] == "synthetic_smoke"
    assert result.evaluation["readiness"] == "locked"


def test_local_agent_feature_adapter_consumes_checkpoint_contract(tmp_path: Path) -> None:
    records_path = tmp_path / "records.jsonl"
    _write_jsonl(records_path, _training_rows())
    result = run_training(
        [_source(records_path)],
        output_dir=tmp_path / "run",
        config=TrainingConfig(seed=17, epochs=2, batch_size=3, learning_rate=0.2),
    )

    prediction = _stroke_prediction_for_analysis(
        result.checkpoint_path,
        fps=30,
        pose={"frames": [{"frameIndex": 1, "landmarks": [{"x": 0.4, "y": 0.5}]}]},
        shuttle={"points": [{"frameIndex": 1, "x": 0.3, "y": 0.4}]},
        racket={"points": [{"frameIndex": 1, "x": 0.5, "y": 0.6}]},
    )

    assert set(REQUIRED_OUTPUTS).issubset(prediction)
    assert prediction["provenance"]["checkpointSha256"] == result.checkpoint_sha256


def test_unset_stroke_checkpoint_is_explicitly_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BML_STROKE_CHECKPOINT", raising=False)

    result = _optional_stroke_prediction(
        fps=30,
        pose={"frames": []},
        shuttle={"points": []},
        racket={"points": []},
        width=1280,
        height=720,
    )

    assert result == {
        "enabled": False,
        "reason": "BML_STROKE_CHECKPOINT is not configured",
    }


def test_invalid_stroke_checkpoint_fails_closed(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    checkpoint_path = tmp_path / "invalid-checkpoint.json"
    checkpoint_path.write_text("{}", encoding="utf-8")
    monkeypatch.setenv("BML_STROKE_CHECKPOINT", str(checkpoint_path))

    with pytest.raises(MediaError, match="Configured stroke checkpoint is invalid"):
        _optional_stroke_prediction(
            fps=30,
            pose={"frames": []},
            shuttle={"points": []},
            racket={"points": []},
            width=1280,
            height=720,
        )


def test_malformed_checkpoint_parameters_fail_closed(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    records_path = tmp_path / "records.jsonl"
    _write_jsonl(records_path, _training_rows())
    result = run_training(
        [_source(records_path)],
        output_dir=tmp_path / "run",
        config=TrainingConfig(seed=17, epochs=1, batch_size=3, learning_rate=0.2),
    )
    payload = json.loads(result.checkpoint_path.read_text(encoding="utf-8"))
    payload["normalization"]["mean"] = None
    malformed = tmp_path / "malformed-checkpoint.json"
    malformed.write_text(json.dumps(payload), encoding="utf-8")
    monkeypatch.setenv("BML_STROKE_CHECKPOINT", str(malformed))

    with pytest.raises(MediaError, match="Configured stroke checkpoint is invalid"):
        _optional_stroke_prediction(
            fps=30,
            pose={"frames": []},
            shuttle={"points": []},
            racket={"points": []},
            width=1280,
            height=720,
        )
