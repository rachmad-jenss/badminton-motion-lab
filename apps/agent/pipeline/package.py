from __future__ import annotations

import hashlib
import json
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class AnalysisPackageWriter:
    _retention_lock = threading.Lock()

    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _write_json(self, name: str, data: Any) -> dict[str, Any]:
        path = self.root / name
        payload = json.dumps(data, indent=2).encode("utf-8")
        path.write_bytes(payload)
        return {
            "path": name,
            "sha256": hashlib.sha256(payload).hexdigest(),
            "mediaType": "application/json",
            "bytes": len(payload),
        }

    def write(
        self,
        *,
        analysis_run_id: str,
        capture_id: str,
        fingerprint: str,
        meta: dict[str, Any],
        modules: list[str],
        quality: dict[str, Any],
        court: dict[str, Any],
        pose: dict[str, Any],
        racket: dict[str, Any],
        shuttle: dict[str, Any],
        events: dict[str, Any],
        metrics: list[dict[str, Any]],
        findings: list[dict[str, Any]],
        pipeline_version: str,
    ) -> dict[str, Any]:
        created_at = meta.get("createdAt") or datetime.now(timezone.utc).isoformat()
        artifacts = {
            "pose": self._write_json("pose.json", pose),
            "racket": self._write_json("racket.json", racket),
            "shuttle": self._write_json("shuttle.json", shuttle),
            "events": self._write_json("events.json", events),
            "metrics": self._write_json("metrics.json", metrics),
            "findings": self._write_json("findings.json", findings),
        }
        input_hashes = [fingerprint]

        def step(
            step_id: str,
            version: str,
            status: str,
            output_names: list[str] | None = None,
        ) -> dict[str, Any]:
            return {
                "stepId": step_id,
                "version": version,
                "status": status,
                "startedAt": created_at,
                "finishedAt": created_at,
                "inputHashes": input_hashes,
                "outputHashes": [artifacts[name]["sha256"] for name in (output_names or [])],
            }

        manifest = {
            "packageVersion": "1.0.0",
            "pipelineVersion": pipeline_version,
            "analysisRunId": analysis_run_id,
            "captureId": capture_id,
            "createdAt": created_at,
            "sourceMedia": {
                "fingerprint": fingerprint,
                "originalPath": meta.get("path"),
                "durationMs": meta.get("durationMs"),
                "fps": meta.get("fps"),
                "width": meta.get("width"),
                "height": meta.get("height"),
            },
            "modulesRequested": modules,
            "steps": [
                step("quality_gate", "1.0.0", "ok"),
                step("court", "1.0.0", "ok" if court.get("valid") else "skipped"),
                step("pose", "baseline-1.0.0", "ok", ["pose"]),
                step("racket", "baseline-1.0.0", "ok", ["racket"]),
                step("shuttle", "baseline-1.0.0", "ok", ["shuttle"]),
                step("events", "baseline-1.0.0", "ok", ["events"]),
                step("metrics", "1.0.0", "ok", ["metrics", "findings"]),
            ],
            "artifacts": artifacts,
            "qualityGate": quality,
            "court": court,
        }
        validate_analysis_manifest(manifest)
        man_art = self._write_json("manifest.json", manifest)
        marker_tmp = self.root / ".complete.tmp"
        marker = self.root / ".complete"
        marker_tmp.write_text(man_art["sha256"], encoding="utf-8")
        marker_tmp.replace(marker)
        # Package hash over manifest
        return {
            "path": str(self.root),
            "sha256": man_art["sha256"],
            "manifest": manifest,
        }

    @staticmethod
    def prune_siblings(parent: Path, *, keep: int = 100) -> None:
        """Bound generated package storage while preserving the newest runs."""
        if keep < 1:
            raise ValueError("package retention must keep at least one package")
        with AnalysisPackageWriter._retention_lock:
            try:
                packages = sorted(
                    (
                        path
                        for path in parent.iterdir()
                        if path.is_dir() and (path / ".complete").is_file()
                    ),
                    key=lambda path: path.stat().st_mtime,
                    reverse=True,
                )
            except FileNotFoundError:
                return
            for stale in packages[keep:]:
                try:
                    shutil.rmtree(stale)
                except FileNotFoundError:
                    continue


def validate_analysis_manifest(manifest: dict[str, Any]) -> None:
    """Validate package output against the checked-in runtime manifest schema."""
    schema_path = (
        Path(__file__).resolve().parents[3]
        / "packages"
        / "contracts"
        / "src"
        / "schemas"
        / "analysis-manifest.schema.json"
    )
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Analysis manifest schema unavailable: {schema_path}") from exc
    _validate_schema_value(manifest, schema, "manifest")

    required_step_ids = {
        "quality_gate",
        "court",
        "pose",
        "racket",
        "shuttle",
        "events",
        "metrics",
    }
    steps = manifest.get("steps", [])
    step_ids = {step.get("stepId") for step in steps if isinstance(step, dict)}
    if step_ids != required_step_ids:
        raise ValueError(
            "Analysis manifest must contain exactly the required pipeline steps"
        )
    source_media = manifest.get("sourceMedia")
    if not isinstance(source_media, dict) or not source_media.get("fingerprint"):
        raise ValueError("Analysis manifest must include the analyzed media fingerprint")
    if not all(
        isinstance(source_media.get(key), (int, float))
        and source_media.get(key) >= 0
        for key in ("durationMs", "fps", "width", "height")
    ):
        raise ValueError("Analysis manifest sourceMedia metadata is incomplete")


def _validate_schema_value(value: Any, schema: dict[str, Any], path: str) -> None:
    schema_type = schema.get("type")
    valid_types = schema_type if isinstance(schema_type, list) else [schema_type]
    if schema_type and not any(_matches_json_type(value, item) for item in valid_types):
        raise ValueError(f"{path} does not match manifest schema type {schema_type}")
    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                raise ValueError(f"{path}.{key} is required by the manifest schema")
        for key, child_schema in schema.get("properties", {}).items():
            if key in value:
                _validate_schema_value(value[key], child_schema, f"{path}.{key}")
    if isinstance(value, list) and schema.get("items"):
        for index, item in enumerate(value):
            _validate_schema_value(item, schema["items"], f"{path}[{index}]")


def _matches_json_type(value: Any, schema_type: str) -> bool:
    if schema_type == "object":
        return isinstance(value, dict)
    if schema_type == "array":
        return isinstance(value, list)
    if schema_type == "string":
        return isinstance(value, str)
    if schema_type == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if schema_type == "boolean":
        return isinstance(value, bool)
    if schema_type == "null":
        return value is None
    return True
