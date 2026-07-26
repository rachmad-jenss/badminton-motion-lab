from __future__ import annotations

import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class AnalysisPackageWriter:
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
        man_art = self._write_json("manifest.json", manifest)
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
        packages = sorted(
            (path for path in parent.iterdir() if path.is_dir()),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        for stale in packages[keep:]:
            shutil.rmtree(stale)
