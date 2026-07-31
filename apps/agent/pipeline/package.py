from __future__ import annotations

import hashlib
import json
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, SchemaError, ValidationError


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
        step_timings: dict[str, tuple[str, str]] | None = None,
        step_input_artifacts: dict[str, list[str]] | None = None,
    ) -> dict[str, Any]:
        created_at = meta.get("createdAt") or datetime.now(timezone.utc).isoformat()
        artifacts = {
            "quality": self._write_json("quality.json", quality),
            "pose": self._write_json("pose.json", pose),
            "racket": self._write_json("racket.json", racket),
            "shuttle": self._write_json("shuttle.json", shuttle),
            "events": self._write_json("events.json", events),
            "metrics": self._write_json("metrics.json", metrics),
            "findings": self._write_json("findings.json", findings),
            "court": self._write_json("court.json", court),
        }
        step_timings = step_timings or {}
        step_input_artifacts = step_input_artifacts or {}

        def step(
            step_id: str,
            version: str,
            status: str,
            output_names: list[str] | None = None,
        ) -> dict[str, Any]:
            started_at, finished_at = step_timings.get(step_id, (created_at, created_at))
            input_hashes = [
                fingerprint if name == "sourceMedia" else artifacts[name]["sha256"]
                for name in step_input_artifacts.get(step_id, ["sourceMedia"])
            ]
            return {
                "stepId": step_id,
                "version": version,
                "status": status,
                "startedAt": started_at,
                "finishedAt": finished_at,
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
                step("pose", "baseline-1.0.0", "ok", ["pose"]),
                step("quality_gate", "1.0.0", "ok", ["quality"]),
                step("court", "1.0.0", "ok" if court.get("valid") else "skipped", ["court"]),
                step("racket", "baseline-1.0.0", "ok", ["racket"]),
                step("shuttle", "baseline-1.0.0", "ok", ["shuttle"]),
                step("events", "baseline-1.0.0", "ok", ["events"]),
                step("metrics", "1.0.0", "ok", ["metrics", "findings"]),
            ],
            "artifacts": artifacts,
            "qualityGate": quality,
            "court": court,
        }
        try:
            validate_analysis_manifest(manifest)
        except Exception:
            shutil.rmtree(self.root, ignore_errors=True)
            raise
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
    schema_paths = [
        Path(__file__).with_name("analysis-manifest.schema.json"),
        Path(__file__).resolve().parents[3]
        / "packages"
        / "contracts"
        / "src"
        / "schemas"
        / "analysis-manifest.schema.json",
    ]
    schema_path = next((path for path in schema_paths if path.is_file()), None)
    if schema_path is None:
        raise ValueError("Analysis manifest schema unavailable")
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(schema)
        Draft202012Validator(schema).validate(manifest)
    except (OSError, json.JSONDecodeError, SchemaError, ValidationError) as exc:
        raise ValueError(f"Analysis manifest schema validation failed: {exc}") from exc

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
