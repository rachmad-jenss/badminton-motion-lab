"""BYOK store — API key encrypted at rest on Local Agent only."""

from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
from typing import Any

import httpx
from cryptography.fernet import Fernet, InvalidToken


SYSTEM = """You are a badminton motion analyst assistant.
You ONLY explain structured findings and metrics already computed by the deterministic pipeline.
Never invent numeric values that are not present in the input JSON.
Never claim medical diagnosis. Cite finding IDs. fabricatedMetricsAttempted must be false."""


def _fernet_for(root: Path) -> Fernet:
    key_path = root / ".byok_key"
    if key_path.exists():
        raw = key_path.read_bytes().strip()
    else:
        raw = Fernet.generate_key()
        root.mkdir(parents=True, exist_ok=True)
        key_path.write_bytes(raw)
        try:
            os.chmod(key_path, 0o600)
        except OSError:
            pass
    # Accept either raw Fernet key or derive from machine secret bytes
    try:
        return Fernet(raw)
    except (ValueError, TypeError):
        digest = hashlib.sha256(raw).digest()
        return Fernet(base64.urlsafe_b64encode(digest))


class ByokStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.path = root / "byok.json"
        self.enc_path = root / "byok.enc"

    def ensure(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)

    def has_key(self) -> bool:
        return self.enc_path.exists() or self.path.exists()

    def set_key(self, *, provider: str, api_key: str, model: str) -> None:
        self.ensure()
        payload = json.dumps({"provider": provider, "api_key": api_key, "model": model}).encode("utf-8")
        token = _fernet_for(self.root).encrypt(payload)
        self.enc_path.write_bytes(token)
        if self.path.exists():
            self.path.unlink()

    def clear(self) -> None:
        for p in (self.path, self.enc_path):
            if p.exists():
                p.unlink()

    def load(self) -> dict[str, str] | None:
        if self.enc_path.exists():
            try:
                plain = _fernet_for(self.root).decrypt(self.enc_path.read_bytes())
                return json.loads(plain.decode("utf-8"))
            except (InvalidToken, json.JSONDecodeError, OSError):
                return None
        # Migrate legacy plaintext once
        if self.path.exists():
            data = json.loads(self.path.read_text(encoding="utf-8"))
            self.set_key(
                provider=data["provider"],
                api_key=data["api_key"],
                model=data.get("model") or "gpt-4o-mini",
            )
            return self.load()
        return None


def _local_stub(findings: list[dict[str, Any]], metrics: list[dict[str, Any]]) -> dict[str, Any]:
    lines = [
        f"- ({f['id']}, conf={f.get('confidence', 0):.2f}) {f['title']}: {f['observation']}"
        for f in findings
    ]
    return {
        "prose": (
            "No structured findings available to explain."
            if not lines
            else "Based only on computed findings:\n" + "\n".join(lines)
        ),
        "citedFindingIds": [f["id"] for f in findings],
        "provider": "local-stub",
        "model": "deterministic-summary",
        "fabricatedMetricsAttempted": False,
        "byokUsed": False,
    }


async def run_insight(
    *,
    byok: ByokStore,
    findings: list[dict[str, Any]],
    metrics: list[dict[str, Any]],
    locale: str,
) -> dict[str, Any]:
    cfg = byok.load()
    if not cfg:
        return _local_stub(findings, metrics)

    payload = {
        "locale": locale,
        "findings": findings,
        "metrics": [m for m in metrics if not m.get("withheld")],
        "withheldMetricIds": [m["metricId"] for m in metrics if m.get("withheld")],
    }
    provider = cfg["provider"].lower()
    if provider in {"openai", "openrouter"}:
        base = (
            "https://openrouter.ai/api/v1"
            if provider == "openrouter"
            else "https://api.openai.com/v1"
        )
        headers = {"Authorization": f"Bearer {cfg['api_key']}", "Content-Type": "application/json"}
        body = {
            "model": cfg.get("model") or "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": json.dumps(payload)},
            ],
            "temperature": 0.2,
        }
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(f"{base}/chat/completions", headers=headers, json=body)
            r.raise_for_status()
            data = r.json()
        prose = data["choices"][0]["message"]["content"]
        return {
            "prose": prose,
            "citedFindingIds": [f["id"] for f in findings],
            "provider": provider,
            "model": cfg.get("model") or "gpt-4o-mini",
            "fabricatedMetricsAttempted": False,
            "byokUsed": True,
        }

    stub = _local_stub(findings, metrics)
    stub["provider"] = provider
    stub["byokUsed"] = False
    stub["warning"] = "Unsupported BYOK provider; used local stub"
    return stub
