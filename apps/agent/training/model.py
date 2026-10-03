"""Small NumPy checkpoint model and contract-validated inference."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any, Sequence

import numpy as np

from .records import BML_STROKE_LABELS, FEATURE_NAMES, extract_feature_vector


CHECKPOINT_CONTRACT_VERSION = 1
MODEL_ID = "bml-technique-stroke-v1"
FEATURE_SCHEMA_VERSION = 1
REQUIRED_OUTPUTS = ("strokeId", "contactFrame", "confidence", "provenance")


class CheckpointError(ValueError):
    """Raised when a checkpoint cannot be trusted for inference."""


def load_checkpoint(path: Path, *, expected_sha256: str | None = None) -> dict[str, Any]:
    checkpoint_path = Path(path).expanduser().resolve()
    if not checkpoint_path.is_file():
        raise CheckpointError(f"checkpoint missing: {checkpoint_path}")
    actual_sha256 = _sha256_file(checkpoint_path)
    if expected_sha256 and actual_sha256.upper() != expected_sha256.upper():
        raise CheckpointError(
            f"checkpoint checksum mismatch: expected {expected_sha256.upper()}, got {actual_sha256.upper()}"
        )
    try:
        payload = json.loads(checkpoint_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CheckpointError(f"checkpoint is not valid JSON: {checkpoint_path}") from exc
    if not isinstance(payload, dict):
        raise CheckpointError("checkpoint root must be an object")
    _validate_checkpoint(payload)
    payload = dict(payload)
    payload["_checkpointSha256"] = actual_sha256.upper()
    return payload


def predict_checkpoint(checkpoint: dict[str, Any], features: Sequence[float]) -> dict[str, Any]:
    _validate_checkpoint(checkpoint)
    if len(features) != len(FEATURE_NAMES):
        raise CheckpointError(
            f"feature vector length mismatch: expected {len(FEATURE_NAMES)}, got {len(features)}"
        )
    values = np.asarray(features, dtype=np.float64)
    if not np.all(np.isfinite(values)):
        raise CheckpointError("feature vector contains non-finite values")

    normalization = checkpoint["normalization"]
    mean = np.asarray(normalization["mean"], dtype=np.float64)
    std = np.asarray(normalization["std"], dtype=np.float64)
    normalized = (values - mean) / std

    classifier = checkpoint["classifier"]
    weights = np.asarray(classifier["weights"], dtype=np.float64)
    bias = np.asarray(classifier["bias"], dtype=np.float64)
    logits = weights @ normalized + bias
    logits = logits - np.max(logits)
    probabilities = np.exp(logits)
    probabilities = probabilities / np.sum(probabilities)
    class_index = int(np.argmax(probabilities))

    contact = checkpoint["contactRegressor"]
    contact_weights = np.asarray(contact["weights"], dtype=np.float64)
    contact_normalized = float(contact_weights @ normalized + float(contact["bias"]))
    target_norm = checkpoint["targetNormalization"]
    contact_frame = int(max(0, round(contact_normalized * target_norm["std"] + target_norm["mean"])))

    checkpoint_sha256 = checkpoint.get("_checkpointSha256")
    if not checkpoint_sha256:
        raise CheckpointError("loaded checkpoint is missing runtime checksum")
    prediction = {
        "strokeId": checkpoint["classes"][class_index],
        "contactFrame": contact_frame,
        "confidence": float(np.max(probabilities)),
        "provenance": {
            **checkpoint["provenance"],
            "checkpointSha256": checkpoint_sha256,
            "modelId": checkpoint["modelId"],
        },
    }
    validate_prediction(prediction)
    return prediction


def extract_pipeline_features(
    *,
    fps: float,
    pose: dict[str, Any],
    shuttle: dict[str, Any],
    racket: dict[str, Any],
    width: float = 1.0,
    height: float = 1.0,
) -> list[float]:
    """Map bounded local-agent tracks into the training feature schema."""

    if not math.isfinite(float(fps)) or fps < 0:
        raise CheckpointError("pipeline fps must be finite and non-negative")
    if not math.isfinite(float(width)) or width <= 0 or not math.isfinite(float(height)) or height <= 0:
        raise CheckpointError("pipeline dimensions must be finite and positive")

    pose_points = [
        landmark
        for frame in (pose.get("frames") or [])[:64]
        for landmark in (frame.get("landmarks") or [])[:64]
        if isinstance(landmark, dict)
    ]
    player_position = _mean_position(pose_points, width=width, height=height)
    shuttle_points = [
        point for point in (shuttle.get("points") or [])[:64] if isinstance(point, dict)
    ]
    racket_points = [
        point for point in (racket.get("points") or [])[:64] if isinstance(point, dict)
    ]
    landing = _mean_position(shuttle_points, width=width, height=height)
    record = {
        "fps": fps,
        "pose": {"frames": pose.get("frames") or []},
        "shuttle": {"points": shuttle_points},
        "racket": {"points": racket_points},
        "features": {
            "playerPosition": player_position,
            "opponentPosition": None,
            "landing": landing,
            "backhand": False,
            "aroundHead": False,
        },
    }
    return extract_feature_vector(record)


def _mean_position(points: Sequence[dict[str, Any]], *, width: float, height: float) -> dict[str, float] | None:
    coordinates = []
    for point in points:
        try:
            x = float(point["x"])
            y = float(point["y"])
        except (KeyError, TypeError, ValueError):
            continue
        if math.isfinite(x) and math.isfinite(y):
            coordinates.append((x / width, y / height))
    if not coordinates:
        return None
    return {
        "x": sum(x for x, _ in coordinates) / len(coordinates),
        "y": sum(y for _, y in coordinates) / len(coordinates),
    }


def validate_prediction(prediction: dict[str, Any]) -> dict[str, Any]:
    missing = [name for name in REQUIRED_OUTPUTS if name not in prediction]
    if missing:
        raise CheckpointError("prediction missing required outputs: " + ", ".join(missing))
    if prediction["strokeId"] not in BML_STROKE_LABELS:
        raise CheckpointError("prediction strokeId is outside the BML taxonomy")
    if isinstance(prediction["contactFrame"], bool) or not isinstance(prediction["contactFrame"], int):
        raise CheckpointError("prediction contactFrame must be an integer")
    confidence = float(prediction["confidence"])
    if not math.isfinite(confidence) or not 0.0 <= confidence <= 1.0:
        raise CheckpointError("prediction confidence must be between 0 and 1")
    provenance = prediction["provenance"]
    if not isinstance(provenance, dict) or not provenance.get("checkpointSha256"):
        raise CheckpointError("prediction provenance must include checkpointSha256")
    if provenance.get("publicEvidence") is not False:
        raise CheckpointError("trained checkpoint predictions cannot be public evidence by default")
    return prediction


def _validate_checkpoint(payload: dict[str, Any]) -> None:
    if payload.get("checkpointVersion") != CHECKPOINT_CONTRACT_VERSION:
        raise CheckpointError("unsupported checkpoint contract version")
    if payload.get("modelId") != MODEL_ID:
        raise CheckpointError("checkpoint modelId does not match BML stroke model")
    if payload.get("featureSchemaVersion") != FEATURE_SCHEMA_VERSION:
        raise CheckpointError("unsupported feature schema version")
    if payload.get("featureNames") != list(FEATURE_NAMES):
        raise CheckpointError("checkpoint feature schema does not match BML")
    if payload.get("classes") != list(BML_STROKE_LABELS):
        raise CheckpointError("checkpoint class taxonomy does not match BML")
    normalization = payload.get("normalization")
    target_norm = payload.get("targetNormalization")
    if not _finite_vector(normalization, "mean", len(FEATURE_NAMES)) or not _positive_vector(
        normalization, "std", len(FEATURE_NAMES)
    ):
        raise CheckpointError("checkpoint feature normalization is invalid")
    if not _finite_scalar(target_norm, "mean") or not _positive_scalar(target_norm, "std"):
        raise CheckpointError("checkpoint contact normalization is invalid")
    classifier = payload.get("classifier")
    if not isinstance(classifier, dict):
        raise CheckpointError("checkpoint classifier is missing")
    try:
        weights = np.asarray(classifier.get("weights"), dtype=np.float64)
        bias = np.asarray(classifier.get("bias"), dtype=np.float64)
    except (TypeError, ValueError):
        raise CheckpointError("checkpoint classifier parameters are invalid")
    if weights.shape != (len(BML_STROKE_LABELS), len(FEATURE_NAMES)) or bias.shape != (len(BML_STROKE_LABELS),):
        raise CheckpointError("checkpoint classifier shape is invalid")
    contact = payload.get("contactRegressor")
    if not isinstance(contact, dict):
        raise CheckpointError("checkpoint contact regressor is missing")
    try:
        contact_weights = np.asarray(contact.get("weights"), dtype=np.float64)
    except (TypeError, ValueError):
        raise CheckpointError("checkpoint contact regressor parameters are invalid")
    if contact_weights.shape != (len(FEATURE_NAMES),) or not _finite_scalar(contact, "bias"):
        raise CheckpointError("checkpoint contact regressor shape is invalid")
    if not np.all(np.isfinite(weights)) or not np.all(np.isfinite(bias)) or not np.all(np.isfinite(contact_weights)):
        raise CheckpointError("checkpoint parameters contain non-finite values")
    provenance = payload.get("provenance")
    if not isinstance(provenance, dict) or provenance.get("publicEvidence") is not False:
        raise CheckpointError("checkpoint provenance must be non-public")
    if not provenance.get("trainingManifestSha256"):
        raise CheckpointError("checkpoint provenance is missing trainingManifestSha256")


def _finite_vector(container: Any, key: str, length: int) -> bool:
    if not isinstance(container, dict):
        return False
    try:
        values = np.asarray(container.get(key), dtype=np.float64)
    except (TypeError, ValueError):
        return False
    return values.shape == (length,) and bool(np.all(np.isfinite(values)))


def _positive_vector(container: Any, key: str, length: int) -> bool:
    if not _finite_vector(container, key, length):
        return False
    return bool(np.all(np.asarray(container[key], dtype=np.float64) > 0))


def _finite_scalar(container: Any, key: str) -> bool:
    if not isinstance(container, dict):
        return False
    try:
        return math.isfinite(float(container[key]))
    except (KeyError, TypeError, ValueError):
        return False


def _positive_scalar(container: Any, key: str) -> bool:
    return _finite_scalar(container, key) and float(container[key]) > 0


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()
