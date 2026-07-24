from __future__ import annotations

import hashlib
import json
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
        artifacts = {
            "pose": self._write_json("pose.json", pose),
            "racket": self._write_json("racket.json", racket),
            "shuttle": self._write_json("shuttle.json", shuttle),
            "events": self._write_json("events.json", events),
            "metrics": self._write_json("metrics.json", metrics),
            "findings": self._write_json("findings.json", findings),
        }
        manifest = {
            "packageVersion": "1.0.0",
            "pipelineVersion": pipeline_version,
            "analysisRunId": analysis_run_id,
            "captureId": capture_id,
            "createdAt": meta.get("createdAt"),
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
                {"stepId": "quality_gate", "version": "1.0.0", "status": "ok"},
                {"stepId": "court", "version": "1.0.0", "status": "ok" if court.get("valid") else "skipped"},
                {"stepId": "pose", "version": "baseline-1.0.0", "status": "ok"},
                {"stepId": "racket", "version": "baseline-1.0.0", "status": "ok"},
                {"stepId": "shuttle", "version": "baseline-1.0.0", "status": "ok"},
                {"stepId": "events", "version": "baseline-1.0.0", "status": "ok"},
                {"stepId": "metrics", "version": "1.0.0", "status": "ok"},
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
