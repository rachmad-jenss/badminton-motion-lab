"""Streaming training/evaluation orchestration for the BML stroke baseline."""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

import numpy as np

from .model import (
    CHECKPOINT_CONTRACT_VERSION,
    DEFAULT_HIDDEN_SIZE,
    FEATURE_SCHEMA_VERSION,
    MODEL_ID,
    REQUIRED_OUTPUTS,
    load_checkpoint,
    predict_checkpoint,
)
from .records import (
    BML_STROKE_LABELS,
    FEATURE_NAMES,
    RecordSource,
    ReaderStats,
    TrainingDataError,
    extract_feature_vector,
    iter_training_records,
)


@dataclass(frozen=True)
class TrainingConfig:
    seed: int = 17
    epochs: int = 5
    batch_size: int = 8
    learning_rate: float = 0.01
    contact_loss_weight: float = 0.25
    max_records: int = 50_000
    max_record_bytes: int = 1 << 20
    max_sequence_items: int = 64
    hidden_size: int = DEFAULT_HIDDEN_SIZE
    shuffle_buffer_size: int = 1024
    min_held_out_accuracy: float = 0.5
    max_held_out_contact_mae: float = 3.0

    def __post_init__(self) -> None:
        if self.epochs < 1:
            raise ValueError("epochs must be positive")
        if not 1 <= self.batch_size <= 8:
            raise ValueError("batch_size must be between 1 and 8")
        if not math.isfinite(self.learning_rate) or self.learning_rate <= 0:
            raise ValueError("learning_rate must be positive")
        if self.hidden_size < 1 or self.hidden_size > 128:
            raise ValueError("hidden_size must be between 1 and 128")
        if self.shuffle_buffer_size < 1 or self.shuffle_buffer_size > 4096:
            raise ValueError("shuffle_buffer_size must be between 1 and 4096")
        if self.contact_loss_weight < 0 or not math.isfinite(self.contact_loss_weight):
            raise ValueError("contact_loss_weight must be non-negative")
        if self.max_records < 1:
            raise ValueError("max_records must be positive")


@dataclass(frozen=True)
class TrainingRunResult:
    output_dir: Path
    checkpoint_path: Path
    manifest_path: Path
    evaluation_path: Path
    checkpoint_sha256: str
    manifest_sha256: str
    evaluation: dict[str, Any]


def run_training(
    sources: Sequence[RecordSource],
    *,
    output_dir: Path,
    config: TrainingConfig,
    held_out_sources: Sequence[RecordSource] = (),
    evidence_class: str = "training_only",
    provenance_sources: Sequence[dict[str, Any]] = (),
) -> TrainingRunResult:
    """Train and evaluate without retaining the complete dataset."""

    if not sources:
        raise TrainingDataError("at least one training record source is required")
    if any(source.source_id != "own_capture" for source in held_out_sources) and held_out_sources:
        raise TrainingDataError("held-out evaluation sources must use own_capture")

    feature_count = len(FEATURE_NAMES)
    class_index = {label: index for index, label in enumerate(BML_STROKE_LABELS)}
    feature_sum = np.zeros(feature_count, dtype=np.float64)
    feature_square_sum = np.zeros(feature_count, dtype=np.float64)
    target_sum = 0.0
    target_square_sum = 0.0
    train_records = 0
    class_counts = {label: 0 for label in BML_STROKE_LABELS}
    split_counts = {"train": 0, "validation": 0, "test": 0}
    first_pass_stats = ReaderStats()

    for record in _iter_sources(sources, config, stats=first_pass_stats):
        split = record["split"]
        if split not in split_counts:
            continue
        split_counts[split] += 1
        if split != "train":
            continue
        class_counts[record["strokeId"]] += 1
        vector = np.asarray(extract_feature_vector(record), dtype=np.float64)
        feature_sum += vector
        feature_square_sum += vector * vector
        target = float(record["contactFrameRelative"])
        target_sum += target
        target_square_sum += target * target
        train_records += 1

    if train_records == 0:
        raise TrainingDataError("no train records with supported stroke/contact labels")
    missing_splits = [name for name, count in split_counts.items() if count == 0]
    if missing_splits:
        raise TrainingDataError("missing required split records: " + ", ".join(missing_splits))

    feature_mean = feature_sum / train_records
    feature_variance = np.maximum(feature_square_sum / train_records - feature_mean * feature_mean, 0.0)
    feature_std = np.sqrt(feature_variance)
    feature_std[feature_std < 1e-6] = 1.0
    target_mean = target_sum / train_records
    target_variance = max(target_square_sum / train_records - target_mean * target_mean, 0.0)
    target_std = max(math.sqrt(target_variance), 1e-3)
    class_weights = _inverse_frequency_class_weights(class_counts)

    rng = np.random.default_rng(config.seed)
    input_weights = rng.normal(0.0, 0.05, (feature_count, config.hidden_size))
    input_bias = np.zeros(config.hidden_size, dtype=np.float64)
    output_weights = rng.normal(0.0, 0.05, (config.hidden_size, len(BML_STROKE_LABELS)))
    output_bias = np.zeros(len(BML_STROKE_LABELS), dtype=np.float64)
    contact_weights = np.zeros(feature_count, dtype=np.float64)
    contact_bias = 0.0
    history: list[dict[str, Any]] = []
    training_updates = 0

    for epoch in range(1, config.epochs + 1):
        batch_features: list[np.ndarray] = []
        batch_classes: list[int] = []
        batch_targets: list[float] = []
        epoch_loss = 0.0
        epoch_records = 0
        for record in _iter_shuffled_records(sources, config, rng):
            if record["split"] != "train":
                continue
            batch_features.append(np.asarray(extract_feature_vector(record), dtype=np.float64))
            batch_classes.append(class_index[record["strokeId"]])
            batch_targets.append((float(record["contactFrameRelative"]) - target_mean) / target_std)
            if len(batch_features) >= config.batch_size:
                loss, contact_bias = _update_batch(
                    batch_features,
                    batch_classes,
                    batch_targets,
                    input_weights,
                    input_bias,
                    output_weights,
                    output_bias,
                    contact_weights,
                    contact_bias,
                    feature_mean,
                    feature_std,
                    class_weights,
                    config,
                )
                epoch_loss += loss * len(batch_features)
                epoch_records += len(batch_features)
                training_updates += 1
                batch_features, batch_classes, batch_targets = [], [], []
        if batch_features:
            loss, contact_bias = _update_batch(
                batch_features,
                batch_classes,
                batch_targets,
                input_weights,
                input_bias,
                output_weights,
                output_bias,
                contact_weights,
                contact_bias,
                feature_mean,
                feature_std,
                class_weights,
                config,
            )
            epoch_loss += loss * len(batch_features)
            epoch_records += len(batch_features)
            training_updates += 1

        history.append(
            {
                "epoch": epoch,
                "loss": float(epoch_loss / max(epoch_records, 1)),
                "metrics": {
                    split: _evaluate_split(
                        sources,
                        split=split,
                        config=config,
                        input_weights=input_weights,
                        input_bias=input_bias,
                        output_weights=output_weights,
                        output_bias=output_bias,
                        contact_weights=contact_weights,
                        contact_bias=contact_bias,
                        feature_mean=feature_mean,
                        feature_std=feature_std,
                        contact_mean=target_mean,
                        contact_std=target_std,
                    )
                    for split in ("train", "validation", "test")
                },
            }
        )

    held_out_count = 0
    if held_out_sources:
        for _ in _iter_sources(held_out_sources, config):
            held_out_count += 1
        if held_out_count == 0:
            raise TrainingDataError("own_capture held-out source has no supported records")

    output_dir = Path(output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / "training-manifest.json"
    checkpoint_path = output_dir / "checkpoint.json"
    evaluation_path = output_dir / "evaluation.json"

    source_provenance = _merge_provenance(sources, provenance_sources)
    source_files = [_source_file_manifest(source, "training") for source in sources]
    source_files.extend(_source_file_manifest(source, "held_out") for source in held_out_sources)
    manifest = {
        "manifestVersion": 1,
        "createdAt": datetime_now(),
        "modelId": MODEL_ID,
        "checkpointContractVersion": CHECKPOINT_CONTRACT_VERSION,
        "featureSchemaVersion": FEATURE_SCHEMA_VERSION,
        "config": asdict(config),
        "sourceIds": sorted({item["sourceId"] for item in source_provenance}),
        "sourceFiles": source_files,
        "splitCounts": split_counts,
        "classCounts": class_counts,
        "heldOutRecords": held_out_count,
        "reader": asdict(first_pass_stats),
        "provenance": source_provenance,
    }
    manifest_path.write_text(_json_bytes(manifest), encoding="utf-8")
    manifest_sha256 = _sha256_file(manifest_path)

    checkpoint = {
        "checkpointVersion": CHECKPOINT_CONTRACT_VERSION,
        "modelId": MODEL_ID,
        "featureSchemaVersion": FEATURE_SCHEMA_VERSION,
        "featureNames": list(FEATURE_NAMES),
        "classes": list(BML_STROKE_LABELS),
        "normalization": {"mean": feature_mean.tolist(), "std": feature_std.tolist()},
        "targetNormalization": {
            "mean": target_mean,
            "std": target_std,
            "representation": "relative_window",
        },
        "classifier": {
            "architecture": "mlp_relu",
            "hiddenSize": config.hidden_size,
            "inputWeights": input_weights.tolist(),
            "inputBias": input_bias.tolist(),
            "outputWeights": output_weights.tolist(),
            "outputBias": output_bias.tolist(),
        },
        "contactRegressor": {"weights": contact_weights.tolist(), "bias": contact_bias},
        "training": {
            "seed": config.seed,
            "epochs": config.epochs,
            "batchSize": config.batch_size,
            "learningRate": config.learning_rate,
            "optimizer": "sgd_bounded_shuffle",
            "loss": "softmax_cross_entropy_plus_contact_mse",
            "contactLossWeight": config.contact_loss_weight,
            "hiddenSize": config.hidden_size,
            "shuffleBufferSize": config.shuffle_buffer_size,
            "trainingUpdates": training_updates,
            "classBalance": "inverse_frequency",
            "classCounts": class_counts,
            "classWeights": {
                label: float(class_weights[index])
                for index, label in enumerate(BML_STROKE_LABELS)
            },
        },
        "provenance": {
            "sourceIds": sorted({item["sourceId"] for item in source_provenance}),
            "sources": source_provenance,
            "trainingManifestSha256": manifest_sha256,
            "heldOutSource": "own_capture_only",
            "publicEvidence": False,
            "evidenceClass": evidence_class,
        },
    }
    checkpoint_path.write_text(_json_bytes(checkpoint), encoding="utf-8")
    checkpoint_sha256 = _sha256_file(checkpoint_path)
    (output_dir / "checkpoint.sha256").write_text(checkpoint_sha256 + "\n", encoding="utf-8")

    loaded = load_checkpoint(checkpoint_path, expected_sha256=checkpoint_sha256)
    sample_prediction = predict_checkpoint(
        loaded,
        [0.0] * feature_count,
        window_start_frame=0.0,
        window_end_frame=1.0,
    )
    metrics = {
        split: _evaluate_split(
            sources,
            split=split,
            config=config,
            input_weights=input_weights,
            input_bias=input_bias,
            output_weights=output_weights,
            output_bias=output_bias,
            contact_weights=contact_weights,
            contact_bias=contact_bias,
            feature_mean=feature_mean,
            feature_std=feature_std,
            contact_mean=target_mean,
            contact_std=target_std,
        )
        for split in ("train", "validation", "test")
    }
    if held_out_sources:
        metrics["held_out"] = _evaluate_split(
            held_out_sources,
            split="held_out",
            config=config,
            input_weights=input_weights,
            input_bias=input_bias,
            output_weights=output_weights,
            output_bias=output_bias,
            contact_weights=contact_weights,
            contact_bias=contact_bias,
            feature_mean=feature_mean,
            feature_std=feature_std,
            contact_mean=target_mean,
            contact_std=target_std,
        )
    held_out_metrics = metrics.get("held_out")
    class_coverage = {
        split: _class_coverage(metric)
        for split, metric in metrics.items()
    }
    metric_gate_passed = bool(
        held_out_metrics
        and held_out_metrics["records"] > 0
        and (held_out_metrics["accuracy"] or 0.0) >= config.min_held_out_accuracy
        and (held_out_metrics["contactMaeFrames"] is not None)
        and held_out_metrics["contactMaeFrames"] <= config.max_held_out_contact_mae
    )
    readiness = (
        "ready"
        if evidence_class == "own_capture" and held_out_sources and metric_gate_passed
        else "locked"
    )
    evaluation = {
        "reportVersion": 1,
        "generatedAt": datetime_now(),
        "modelId": MODEL_ID,
        "checkpointPath": checkpoint_path.name,
        "trainingManifestPath": manifest_path.name,
        "checkpointSha256": checkpoint_sha256,
        "trainingManifestSha256": manifest_sha256,
        "sourceIds": sorted({item["sourceId"] for item in source_provenance}),
        "evidenceClass": evidence_class,
        "heldOutSource": "own_capture" if held_out_sources else None,
        "heldOutRecords": held_out_count,
        "trainingUpdates": training_updates,
        "inferenceContractValid": True,
        "requiredOutputs": list(REQUIRED_OUTPUTS),
        "metrics": metrics,
        "classCoverage": class_coverage,
        "history": history,
        "metricGate": {
            "minHeldOutAccuracy": config.min_held_out_accuracy,
            "maxHeldOutContactMae": config.max_held_out_contact_mae,
            "passed": metric_gate_passed,
        },
        "samplePrediction": sample_prediction,
        "readiness": readiness,
        "provenance": source_provenance,
    }
    evaluation_path.write_text(_json_bytes(evaluation), encoding="utf-8")
    return TrainingRunResult(
        output_dir=output_dir,
        checkpoint_path=checkpoint_path,
        manifest_path=manifest_path,
        evaluation_path=evaluation_path,
        checkpoint_sha256=checkpoint_sha256,
        manifest_sha256=manifest_sha256,
        evaluation=evaluation,
    )


def _iter_sources(
    sources: Sequence[RecordSource],
    config: TrainingConfig,
    *,
    stats: ReaderStats | None = None,
):
    return iter_training_records(
        sources,
        seed=config.seed,
        max_records=config.max_records,
        max_record_bytes=config.max_record_bytes,
        max_sequence_items=config.max_sequence_items,
        stats=stats,
    )


def _iter_shuffled_records(
    sources: Sequence[RecordSource], config: TrainingConfig, rng: np.random.Generator
):
    """Shuffle a bounded record buffer without retaining a full source."""

    buffer: list[dict[str, Any]] = []
    for record in _iter_sources(sources, config):
        buffer.append(record)
        if len(buffer) >= config.shuffle_buffer_size:
            index = int(rng.integers(0, len(buffer)))
            yield buffer.pop(index)
    while buffer:
        index = int(rng.integers(0, len(buffer)))
        yield buffer.pop(index)


def _update_batch(
    batch_features: list[np.ndarray],
    batch_classes: list[int],
    batch_contacts: list[float],
    input_weights: np.ndarray,
    input_bias: np.ndarray,
    output_weights: np.ndarray,
    output_bias: np.ndarray,
    contact_weights: np.ndarray,
    contact_bias: float,
    feature_mean: np.ndarray,
    feature_std: np.ndarray,
    class_weights: np.ndarray,
    config: TrainingConfig,
) -> tuple[float, float]:
    features = (np.asarray(batch_features, dtype=np.float64) - feature_mean) / feature_std
    labels = np.asarray(batch_classes, dtype=np.int64)
    contacts = np.asarray(batch_contacts, dtype=np.float64)
    hidden_pre_activation = features @ input_weights + input_bias
    hidden = np.maximum(hidden_pre_activation, 0.0)
    logits = hidden @ output_weights + output_bias
    probabilities = _softmax(logits)
    sample_weights = class_weights[labels]
    weight_sum = float(np.sum(sample_weights))
    if weight_sum <= 0.0:
        raise TrainingDataError("training batch has no positive class weight")
    cross_entropy = -float(
        np.sum(sample_weights * np.log(np.maximum(probabilities[np.arange(len(labels)), labels], 1e-12)))
        / weight_sum
    )
    grad_logits = probabilities.copy()
    grad_logits[np.arange(len(labels)), labels] -= 1.0
    grad_logits *= (sample_weights / weight_sum)[:, None]
    grad_output_weights = hidden.T @ grad_logits
    grad_output_bias = np.sum(grad_logits, axis=0)
    grad_hidden = (grad_logits @ output_weights.T) * (hidden_pre_activation > 0.0)
    grad_input_weights = features.T @ grad_hidden
    grad_input_bias = np.sum(grad_hidden, axis=0)
    output_weights -= config.learning_rate * grad_output_weights
    output_bias -= config.learning_rate * grad_output_bias
    input_weights -= config.learning_rate * grad_input_weights
    input_bias -= config.learning_rate * grad_input_bias

    contact_prediction = features @ contact_weights + contact_bias
    contact_error = contact_prediction - contacts
    contact_loss = 0.5 * float(np.mean(contact_error * contact_error))
    contact_weights -= config.learning_rate * config.contact_loss_weight * np.mean(
        contact_error[:, None] * features, axis=0
    )
    contact_bias -= config.learning_rate * config.contact_loss_weight * float(np.mean(contact_error))
    return cross_entropy + config.contact_loss_weight * contact_loss, contact_bias


def _evaluate_split(
    sources: Sequence[RecordSource],
    *,
    split: str,
    config: TrainingConfig,
    input_weights: np.ndarray,
    input_bias: np.ndarray,
    output_weights: np.ndarray,
    output_bias: np.ndarray,
    contact_weights: np.ndarray,
    contact_bias: float,
    feature_mean: np.ndarray,
    feature_std: np.ndarray,
    contact_mean: float,
    contact_std: float,
) -> dict[str, Any]:
    records = 0
    correct = 0
    contact_errors: list[float] = []
    contact_relative_errors: list[float] = []
    confidences: list[float] = []
    losses: list[float] = []
    class_index = {label: index for index, label in enumerate(BML_STROKE_LABELS)}
    confusion = np.zeros((len(BML_STROKE_LABELS), len(BML_STROKE_LABELS)), dtype=np.int64)
    for record in _iter_sources(sources, config):
        if record["split"] != split:
            continue
        vector = (np.asarray(extract_feature_vector(record), dtype=np.float64) - feature_mean) / feature_std
        hidden = np.maximum(vector @ input_weights + input_bias, 0.0)
        logits = hidden @ output_weights + output_bias
        probabilities = _softmax(logits.reshape(1, -1))[0]
        predicted_index = int(np.argmax(probabilities))
        target_index = class_index[record["strokeId"]]
        correct += int(predicted_index == target_index)
        confusion[target_index, predicted_index] += 1
        confidences.append(float(np.max(probabilities)))
        contact_prediction_relative = float(
            np.clip(float(vector @ contact_weights + contact_bias) * contact_std + contact_mean, 0.0, 1.0)
        )
        window_start = float(record.get("windowStartFrame", 0.0))
        window_end = float(record.get("windowEndFrame", window_start + 1.0))
        window_span = max(window_end - window_start, 1.0)
        contact_prediction = window_start + contact_prediction_relative * window_span
        contact_relative_errors.append(
            abs(contact_prediction_relative - float(record["contactFrameRelative"]))
        )
        contact_errors.append(abs(contact_prediction - float(record["contactFrame"])))
        losses.append(-math.log(max(float(probabilities[target_index]), 1e-12)))
        records += 1

    class_metrics: dict[str, dict[str, float | int]] = {}
    f1_scores: list[float] = []
    supported_f1_scores: list[float] = []
    unsupported_classes: list[str] = []
    for index, label in enumerate(BML_STROKE_LABELS):
        true_positive = int(confusion[index, index])
        support = int(np.sum(confusion[index, :]))
        predicted = int(np.sum(confusion[:, index]))
        precision = true_positive / predicted if predicted else 0.0
        recall = true_positive / support if support else 0.0
        f1 = 2.0 * precision * recall / (precision + recall) if precision + recall else 0.0
        f1_scores.append(f1)
        if support > 0:
            supported_f1_scores.append(f1)
        else:
            unsupported_classes.append(label)
        class_metrics[label] = {
            "support": support,
            "precision": float(precision),
            "recall": float(recall),
            "f1": float(f1),
        }
    return {
        "records": records,
        "accuracy": float(correct / records) if records else None,
        "contactMaeFrames": float(sum(contact_errors) / len(contact_errors)) if contact_errors else None,
        "contactMaeRelative": (
            float(sum(contact_relative_errors) / len(contact_relative_errors))
            if contact_relative_errors
            else None
        ),
        "confidenceMean": float(sum(confidences) / len(confidences)) if confidences else None,
        "loss": float(sum(losses) / len(losses)) if losses else None,
        "macroF1": float(sum(supported_f1_scores) / len(supported_f1_scores)) if supported_f1_scores else 0.0,
        "macroF1AllClasses": float(sum(f1_scores) / len(f1_scores)),
        "unsupportedClasses": unsupported_classes,
        "classMetrics": class_metrics,
        "confusionMatrix": {
            "labels": list(BML_STROKE_LABELS),
            "matrix": confusion.tolist(),
        },
    }


def _inverse_frequency_class_weights(class_counts: dict[str, int]) -> np.ndarray:
    counts = np.asarray([class_counts[label] for label in BML_STROKE_LABELS], dtype=np.float64)
    supported = counts > 0
    total = float(np.sum(counts))
    supported_count = int(np.sum(supported))
    weights = np.zeros(len(BML_STROKE_LABELS), dtype=np.float64)
    if total <= 0.0 or supported_count == 0:
        raise TrainingDataError("no supported training classes")
    weights[supported] = total / (supported_count * counts[supported])
    return weights


def _class_coverage(metric: dict[str, Any]) -> dict[str, Any]:
    class_metrics = metric.get("classMetrics", {})
    counts = {
        label: int(values.get("support", 0))
        for label, values in class_metrics.items()
    }
    supported = [label for label, count in counts.items() if count > 0]
    unsupported = [label for label, count in counts.items() if count == 0]
    return {
        "counts": counts,
        "supportedClasses": supported,
        "unsupportedClasses": unsupported,
    }


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - np.max(logits, axis=-1, keepdims=True)
    exponent = np.exp(shifted)
    return exponent / np.sum(exponent, axis=-1, keepdims=True)


def _source_file_manifest(source: RecordSource, role: str) -> dict[str, Any]:
    path = source.path.expanduser().resolve()
    return {
        "sourceId": source.source_id,
        "role": role,
        "path": str(path),
        "sha256": _sha256_file(path),
        "provenance": dict(source.provenance),
    }


def _merge_provenance(
    sources: Sequence[RecordSource], additional: Sequence[dict[str, Any]],
) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for source in sources:
        merged[source.source_id] = {**source.provenance, "sourceId": source.source_id}
    for item in additional:
        source_id = str(item.get("sourceId", ""))
        if source_id:
            merged[source_id] = dict(item)
    return [merged[key] for key in sorted(merged)]


def _json_bytes(value: Any) -> str:
    return json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n"


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def datetime_now() -> str:
    return datetime.now(timezone.utc).isoformat()
