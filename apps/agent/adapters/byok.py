"""BYOK store — API key encrypted at rest on Local Agent only."""

from __future__ import annotations

import base64
import ctypes
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


def _dpapi_protect(payload: bytes) -> bytes:
    if os.name != "nt":
        raise RuntimeError("Windows DPAPI is unavailable on this platform")

    class Blob(ctypes.Structure):
        _fields_ = [("cbData", ctypes.c_uint32), ("pbData", ctypes.POINTER(ctypes.c_ubyte))]

    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    source = (ctypes.c_ubyte * len(payload)).from_buffer_copy(payload)
    blob_in = Blob(len(payload), source)
    blob_out = Blob()
    if not crypt32.CryptProtectData(ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out)):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(blob_out.pbData, blob_out.cbData)
    finally:
        kernel32.LocalFree(blob_out.pbData)


def _dpapi_unprotect(payload: bytes) -> bytes:
    if os.name != "nt":
        raise RuntimeError("Windows DPAPI is unavailable on this platform")

    class Blob(ctypes.Structure):
        _fields_ = [("cbData", ctypes.c_uint32), ("pbData", ctypes.POINTER(ctypes.c_ubyte))]

    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    source = (ctypes.c_ubyte * len(payload)).from_buffer_copy(payload)
    blob_in = Blob(len(payload), source)
    blob_out = Blob()
    if not crypt32.CryptUnprotectData(ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out)):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(blob_out.pbData, blob_out.cbData)
    finally:
        kernel32.LocalFree(blob_out.pbData)


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
        if os.name == "nt":
            self.enc_path.write_bytes(b"BML-DPAPI\x00" + _dpapi_protect(payload))
        else:
            self.enc_path.write_bytes(_fernet_for(self.root).encrypt(payload))
        if self.path.exists():
            self.path.unlink()
        key_path = self.root / ".byok_key"
        if key_path.exists():
            key_path.unlink()

    def clear(self) -> None:
        for p in (self.path, self.enc_path):
            if p.exists():
                p.unlink()
        key_path = self.root / ".byok_key"
        if key_path.exists():
            key_path.unlink()

    def load(self) -> dict[str, str] | None:
        if self.enc_path.exists():
            try:
                raw = self.enc_path.read_bytes()
                if raw.startswith(b"BML-DPAPI\x00"):
                    plain = _dpapi_unprotect(raw[len(b"BML-DPAPI\x00") :])
                else:
                    plain = _fernet_for(self.root).decrypt(raw)
                return json.loads(plain.decode("utf-8"))
            except (InvalidToken, json.JSONDecodeError, OSError, RuntimeError):
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
