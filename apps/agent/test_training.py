"""Unit tests for the bounded training reader and checkpoint path."""

from __future__ import annotations

import json
import runpy
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
from training.runner import TrainingConfig, _inverse_frequency_class_weights, run_training
from main import _optional_stroke_prediction, _stroke_prediction_for_analysis
from adapters.media import MediaError


_PREPARE_RECORDS = runpy.run_path(
    str(Path(__file__).resolve().parents[2] / "scripts" / "prepare-training-records.py")
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
                "window_start_frame": 22,
                "window_end_frame": 62,
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
    assert result[0]["contactFrameRelative"] == pytest.approx(0.5)
    assert result[0]["windowStartFrame"] == 22
    assert result[0]["windowEndFrame"] == 62
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


def test_temporal_features_use_inference_tracks_without_contact_label() -> None:
    record = {
        "fps": 30,
        "strokeId": "smash",
        "contactFrame": 12,
        "contactFrameRelative": 0.5,
        "windowStartFrame": 0,
        "windowEndFrame": 30,
        "pose": {
            "frames": [
                {"frameIndex": 0, "landmarks": [{"x": 0.1, "y": 0.2}]},
                {"frameIndex": 15, "landmarks": [{"x": 0.4, "y": 0.2}]},
                {"frameIndex": 30, "landmarks": [{"x": 0.9, "y": 0.2}]},
            ]
        },
        "shuttle": {"points": [{"frameIndex": 0, "x": 0.2, "y": 0.3}, {"frameIndex": 30, "x": 0.8, "y": 0.4}]},
        "racket": {"points": [{"frameIndex": 0, "x": 0.2, "y": 0.3}, {"frameIndex": 30, "x": 0.9, "y": 0.4}]},
        "features": {
            "playerPosition": {"x": 0.4, "y": 0.5},
            "opponentPosition": {"x": 0.6, "y": 0.5},
            "landing": {"x": 0.3, "y": 0.2},
            "backhand": False,
            "aroundHead": True,
        },
    }

    vector = extract_feature_vector(record)
    changed_target_vector = extract_feature_vector({**record, "contactFrame": 99, "contactFrameRelative": 0.9})

    assert vector == changed_target_vector
    assert vector[FEATURE_NAMES.index("window_span_seconds")] == pytest.approx(1.0)
    assert vector[FEATURE_NAMES.index("pose_speed_peak")] > 0
    assert vector[FEATURE_NAMES.index("racket_acceleration_peak")] >= 0


def test_bfmd_caption_labels_map_to_explicit_missing_taxonomy_classes() -> None:
    label_for_shot = _PREPARE_RECORDS["_bfmd_label_for_shot"]

    assert label_for_shot({"shot_type": "smash", "captions": {"refined": "jump smash"}}) == "jump_smash"
    assert label_for_shot({"shot_type": "clear", "captions": {"refined": "forehand clear"}}) == "forehand"
    assert label_for_shot({"shot_type": "serve", "captions": {"refined": "backhand serve"}}) == "backhand"
    assert label_for_shot({"shot_type": "block", "captions": {"refined": "blocks to the net"}}) == "block"
    assert label_for_shot({"shot_type": "smash", "captions": {"refined": "overhead shot"}}) == "smash"


def test_bfmd_track_features_are_bounded_to_inference_window() -> None:
    bounded_track_points = _PREPARE_RECORDS["_bounded_track_points"]
    points = [(float(frame), frame / 100.0, frame / 200.0) for frame in range(100)]

    bounded = bounded_track_points(points, 20.0, 80.0)

    assert len(bounded) <= 64
    assert bounded[0][0] >= 20
    assert bounded[-1][0] <= 80


def test_bfmd_caption_preparer_emits_bounded_canonical_records(tmp_path: Path) -> None:
    root = tmp_path / "bfmd"
    caption_dir = root / "data" / "BFMD_data" / "annotations" / "caption"
    caption_dir.mkdir(parents=True)
    caption_path = caption_dir / "match-1.json"
    caption_path.write_text(
        json.dumps(
            {
                "match_name": "match-1",
                "shots": [
                    {"frame": 100, "game": 1, "rally": 1, "shot_type": "smash", "captions": {"refined": "jump smash"}},
                    {"frame": 110, "game": 1, "rally": 1, "shot_type": "clear", "captions": {"refined": "forehand clear"}},
                    {"frame": 120, "game": 1, "rally": 1, "shot_type": "serve", "captions": {"refined": "backhand serve"}},
                    {"frame": 130, "game": 1, "rally": 1, "shot_type": "block", "captions": {"refined": "blocks to the net"}},
                ],
            }
        ),
        encoding="utf-8",
    )
    output = root / "records.normalized.jsonl"

    summary = _PREPARE_RECORDS["prepare"]("bfmd", root, output, seed=17, max_records=None)
    records = [json.loads(line) for line in output.read_text(encoding="utf-8").splitlines()]

    assert summary["records"] == 4
    assert {record["type"] for record in records} == {"forehand", "backhand", "block", "jump_smash"}
    assert all(record["window_start_frame"] == 100 for record in records)
    assert all(record["window_end_frame"] == 130 for record in records)

    filtered_output = root / "records.forehand.jsonl"
    filtered_summary = _PREPARE_RECORDS["prepare"](
        "bfmd",
        root,
        filtered_output,
        seed=17,
        max_records=None,
        include_labels={"forehand"},
    )
    filtered_records = [
        json.loads(line) for line in filtered_output.read_text(encoding="utf-8").splitlines()
    ]
    assert filtered_summary["records"] == 1
    assert {record["type"] for record in filtered_records} == {"forehand"}


def test_record_normalization_preserves_label_derivation_provenance() -> None:
    from training.records import normalize_training_record

    record = normalize_training_record(
        "bfmd",
        {"id": "bfmd-1", "strokeId": "forehand", "frame": 12, "label_source": "bfmd_caption_keyword"},
        seed=17,
        provenance={"sourceId": "bfmd", "publicEvidence": False},
    )

    assert record["provenance"]["labelSource"] == "bfmd_caption_keyword"


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


def _nonlinear_training_rows() -> list[dict]:
    corners = (
        (0.1, 0.1, "smash"),
        (0.1, 0.9, "drop"),
        (0.9, 0.1, "drop"),
        (0.9, 0.9, "smash"),
    )
    rows = []
    for split in ("train", "validation", "test"):
        for repeat in range(8):
            for index, (x, y, stroke) in enumerate(corners):
                rows.append(
                    {
                        "id": f"{split}-xor-{repeat}-{index}",
                        "split": split,
                        "type": stroke,
                        "frame": 10 + index,
                        "position": {"x": x, "y": y},
                        "opponent_location_x": 0.5,
                        "opponent_location_y": 0.5,
                        "landing_x": x,
                        "landing_y": y,
                    }
                )
    return rows


def _imbalanced_training_rows() -> list[dict]:
    rows = []
    train_strokes = ("smash",) * 8 + ("drop",) * 2 + ("clear",)
    for index, stroke in enumerate(train_strokes):
        rows.append(
            {
                "id": f"train-imbalanced-{index}",
                "split": "train",
                "type": stroke,
                "frame": 10 + index,
                "position": {"x": 0.2 + (index % 3) * 0.3, "y": 0.5},
                "opponent_location_x": 0.5,
                "opponent_location_y": 0.5,
            }
        )
    for split in ("validation", "test"):
        for index, stroke in enumerate(("smash", "drop", "clear")):
            rows.append(
                {
                    "id": f"{split}-imbalanced-{index}",
                    "split": split,
                    "type": stroke,
                    "frame": 20 + index,
                    "position": {"x": 0.2 + index * 0.3, "y": 0.5},
                    "opponent_location_x": 0.5,
                    "opponent_location_y": 0.5,
                }
            )
    return rows


def test_small_nonlinear_classifier_learns_interaction_without_loading_dataset(
    tmp_path: Path,
) -> None:
    records_path = tmp_path / "records.jsonl"
    _write_jsonl(records_path, _nonlinear_training_rows())

    result = run_training(
        [_source(records_path)],
        output_dir=tmp_path / "run",
        config=TrainingConfig(
            seed=17,
            epochs=50,
            batch_size=8,
            learning_rate=0.05,
            hidden_size=8,
        ),
    )

    checkpoint = json.loads(result.checkpoint_path.read_text(encoding="utf-8"))
    assert checkpoint["classifier"]["architecture"] == "mlp_relu"
    assert result.evaluation["metrics"]["test"]["accuracy"] >= 0.9
    assert 0.0 <= result.evaluation["metrics"]["test"]["macroF1"] <= 1.0
    assert 0.0 <= result.evaluation["metrics"]["test"]["macroF1AllClasses"] <= 1.0
    assert len(result.evaluation["metrics"]["test"]["confusionMatrix"]["labels"]) == 12
    assert len(result.evaluation["metrics"]["test"]["confusionMatrix"]["matrix"]) == 12


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
    assert "macroF1" in result.evaluation["metrics"]["test"]
    assert "classMetrics" in result.evaluation["metrics"]["test"]
    assert result.evaluation["readiness"] == "locked"


def test_training_records_class_coverage_and_inverse_frequency_weights(tmp_path: Path) -> None:
    records_path = tmp_path / "records.jsonl"
    _write_jsonl(records_path, _imbalanced_training_rows())

    result = run_training(
        [_source(records_path)],
        output_dir=tmp_path / "run",
        config=TrainingConfig(seed=17, epochs=2, batch_size=4, learning_rate=0.1),
    )

    checkpoint = json.loads(result.checkpoint_path.read_text(encoding="utf-8"))
    training = checkpoint["training"]
    assert training["classBalance"] == "inverse_frequency"
    assert training["classCounts"]["smash"] == 8
    assert training["classCounts"]["drop"] == 2
    assert training["classCounts"]["clear"] == 1
    assert training["classCounts"]["serve"] == 0
    assert training["classWeights"]["clear"] > training["classWeights"]["drop"] > training["classWeights"]["smash"]
    assert result.evaluation["classCoverage"]["train"]["unsupportedClasses"]
    assert "serve" in result.evaluation["classCoverage"]["train"]["unsupportedClasses"]


def test_inverse_frequency_weights_are_bounded_for_rare_classes() -> None:
    weights = _inverse_frequency_class_weights(
        {
            "serve": 1,
            "forehand": 1,
            "backhand": 1,
            "smash": 1000,
            "clear": 1,
            "drop": 1,
            "drive": 1,
            "net_shot": 1,
            "lift": 1,
            "block": 1,
            "defensive_return": 1,
            "jump_smash": 1,
        }
    )

    assert max(weights) <= 5.0
    assert weights[2] > weights[3]


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
    assert 0.0 <= prediction["contactFrameRelative"] <= 1.0
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
        window_start_frame=100,
        window_end_frame=140,
    )

    assert set(REQUIRED_OUTPUTS).issubset(prediction)
    assert prediction["provenance"]["checkpointSha256"] == result.checkpoint_sha256
    assert 100 <= prediction["contactFrame"] <= 140


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
