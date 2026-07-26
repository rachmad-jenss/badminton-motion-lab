"""Badminton Motion Lab — Local Agent (real FFmpeg + MediaPipe pipeline)."""

from __future__ import annotations

import asyncio
import json
import os
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import aiosqlite
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from adapters.byok import ByokStore, run_insight
from adapters.court import calibrate_court
from adapters.events import propose_events
from adapters.media import MediaError, decode_frames, fingerprint_file, probe_media, sample_frame_stats_from_frames
from adapters.metrics_engine import compute_metrics, findings_from_metrics
from adapters.paths import assert_allowed_media_path
from adapters.pose import body_visibility_ratio, estimate_pose
from adapters.quality import run_quality_gate
from adapters.racket import track_racket
from adapters.shuttle import track_shuttle
from pipeline.package import AnalysisPackageWriter
from storage.auth import hash_secret, new_secret, now_epoch
from storage.db import get_db_path, init_db

HOST = os.getenv("BML_AGENT_HOST", "127.0.0.1")
PORT = int(os.getenv("BML_AGENT_PORT", "8787"))
DATA_DIR = Path(os.getenv("BML_AGENT_DATA_DIR", str(Path(__file__).resolve().parent / "data")))
PIPELINE_VERSION = "0.2.2"
AGENT_VERSION = "0.2.2"
PAIRING_TTL_SECONDS = int(os.getenv("BML_PAIRING_TTL_SECONDS", "300"))
TOKEN_TTL_SECONDS = int(os.getenv("BML_TOKEN_TTL_SECONDS", str(30 * 24 * 60 * 60)))
MEDIA_TICKET_TTL_SECONDS = int(os.getenv("BML_MEDIA_TICKET_TTL_SECONDS", "60"))
PACKAGE_RETENTION = int(os.getenv("BML_PACKAGE_RETENTION", "100"))
MAX_ANALYSIS_FRAMES = int(os.getenv("BML_MAX_ANALYSIS_FRAMES", "600"))
_DEFAULT_MAX_RAW = os.getenv("BML_MAX_FRAMES")
DEFAULT_MAX_FRAMES = int(_DEFAULT_MAX_RAW) if _DEFAULT_MAX_RAW not in (None, "") else 300
DEFAULT_STRIDE = int(os.getenv("BML_FRAME_STRIDE", "1"))
PUBLIC_PATHS = {"/health", "/pair", "/docs", "/openapi.json", "/redoc"}
ANALYSIS_SEMAPHORE = asyncio.Semaphore(1)

app = FastAPI(title="BML Local Agent", version=AGENT_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

byok = ByokStore(DATA_DIR / "secrets")
PAIRING_CODE = ""
PAIRING_EXPIRES_AT = 0


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class PairRequest(BaseModel):
    pairing_code: str
    device_name: str = "Windows Local Agent"


class MediaTicketRequest(BaseModel):
    capture_id: str


class RegisterCaptureRequest(BaseModel):
    path: str
    session_id: str | None = None
    title: str | None = None


class AnalyzeRequest(BaseModel):
    capture_id: str
    modules: list[str] = Field(default_factory=list)
    stroke_hint: str | None = "clear"
    court_corners: list[dict[str, float]] | None = None
    manual_events: list[dict[str, Any]] | None = None
    dominant_hand: str = Field(default="unknown", pattern="^(left|right|unknown)$")
    max_frames: int | None = Field(default=None, ge=1, le=MAX_ANALYSIS_FRAMES)
    frame_stride: int | None = Field(default=None, ge=1, le=30)


class ByokUpsert(BaseModel):
    provider: str
    api_key: str
    model: str = "gpt-4o-mini"


class InsightBody(BaseModel):
    analysis_run_id: str
    locale: str = "en"


async def require_bearer(
    request: Request,
    authorization: str | None = Header(default=None),
) -> str:
    if request.url.path in PUBLIC_PATHS:
        return ""
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(401, "Authorization Bearer token required — pair the browser first")
    token_hash = hash_secret(token)
    now = now_epoch()
    db_path = get_db_path(DATA_DIR)
    async with aiosqlite.connect(db_path) as db:
        cur = await db.execute(
            """SELECT id FROM devices
               WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?""",
            (token_hash, now),
        )
        row = await cur.fetchone()
    if not row:
        raise HTTPException(401, "Invalid or expired agent token")
    return token


@app.on_event("startup")
async def startup() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "captures").mkdir(exist_ok=True)
    (DATA_DIR / "packages").mkdir(exist_ok=True)
    await init_db(get_db_path(DATA_DIR))
    byok.ensure()
    await rotate_pairing_challenge()


async def rotate_pairing_challenge() -> None:
    global PAIRING_CODE, PAIRING_EXPIRES_AT
    PAIRING_CODE = new_secret()[:10]
    PAIRING_EXPIRES_AT = now_epoch() + PAIRING_TTL_SECONDS
    db_path = get_db_path(DATA_DIR)
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT INTO pairing_challenges (id, code_hash, expires_at) VALUES (?, ?, ?)",
            (str(uuid.uuid4()), hash_secret(PAIRING_CODE), PAIRING_EXPIRES_AT),
        )
        await db.commit()


@app.get("/health")
async def health() -> dict[str, Any]:
    model = Path(__file__).resolve().parent / "models" / "pose_landmarker_full.task"
    return {
        "ok": True,
        "agentVersion": AGENT_VERSION,
        "pipelineVersion": PIPELINE_VERSION,
        "host": HOST,
        "port": PORT,
        "byokConfigured": byok.has_key(),
        "pairingCode": PAIRING_CODE if now_epoch() < PAIRING_EXPIRES_AT else None,
        "pairingExpiresAt": PAIRING_EXPIRES_AT,
        "poseModelPresent": model.exists(),
        "time": utc_now(),
    }


@app.post("/pair")
async def pair(body: PairRequest) -> dict[str, Any]:
    now = now_epoch()
    if not PAIRING_CODE or now >= PAIRING_EXPIRES_AT or body.pairing_code.strip() == "":
        raise HTTPException(401, "Pairing code is missing or expired — refresh agent health")
    if not secrets.compare_digest(hash_secret(body.pairing_code.strip()), hash_secret(PAIRING_CODE)):
        raise HTTPException(401, "Invalid pairing code")
    device_id = str(uuid.uuid4())
    token = new_secret()
    token_expires_at = now + TOKEN_TTL_SECONDS
    db_path = get_db_path(DATA_DIR)
    async with aiosqlite.connect(db_path) as db:
        cur = await db.execute(
            """UPDATE pairing_challenges SET used_at = ?
               WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?""",
            (now, hash_secret(PAIRING_CODE), now),
        )
        if cur.rowcount != 1:
            raise HTTPException(401, "Pairing code is already used or expired")
        await db.execute(
            """INSERT INTO devices
               (id, name, pairing_code, token, created_at, token_hash, expires_at)
               VALUES (?, ?, NULL, '', ?, ?, ?)""",
            (device_id, body.device_name, utc_now(), hash_secret(token), token_expires_at),
        )
        await db.commit()
    await rotate_pairing_challenge()
    return {
        "deviceId": device_id,
        "token": token,
        "expiresAt": token_expires_at,
        "agentUrl": f"http://{HOST}:{PORT}",
    }


@app.post("/captures/register")
async def register_capture(
    body: RegisterCaptureRequest,
    _token: str = Depends(require_bearer),
) -> dict[str, Any]:
    try:
        path = assert_allowed_media_path(Path(body.path), data_dir=DATA_DIR)
        meta = probe_media(path)
        fp = fingerprint_file(path)
    except MediaError as e:
        raise HTTPException(400, str(e)) from e
    meta["fingerprint"] = fp
    meta["sessionId"] = body.session_id
    meta["title"] = body.title or path.stem
    capture_id = str(uuid.uuid4())
    db_path = get_db_path(DATA_DIR)
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT INTO captures (id, path, fingerprint, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)",
            (capture_id, str(path), fp, json.dumps(meta), utc_now()),
        )
        await db.commit()
    return {"captureId": capture_id, "fingerprint": fp, "metadata": meta}


@app.get("/media/{capture_id}")
async def media_stream(
    capture_id: str,
    ticket: str = Query(default=""),
) -> FileResponse:
    now = now_epoch()
    db_path = get_db_path(DATA_DIR)
    async with aiosqlite.connect(db_path) as db:
        cur = await db.execute(
            """UPDATE media_tickets SET used_at = ?
               WHERE token_hash = ? AND capture_id = ? AND used_at IS NULL AND expires_at > ?""",
            (now, hash_secret(ticket), capture_id, now),
        )
        if cur.rowcount != 1:
            raise HTTPException(401, "Invalid or expired media ticket")
        cur = await db.execute("SELECT path FROM captures WHERE id = ?", (capture_id,))
        row = await cur.fetchone()
        await db.commit()
    if not row:
        raise HTTPException(404, "Capture not found")
    path = Path(row[0])
    try:
        assert_allowed_media_path(path, data_dir=DATA_DIR)
    except MediaError as e:
        raise HTTPException(403, str(e)) from e
    if not path.exists():
        raise HTTPException(410, "Local media missing — Start Agent / re-link file")
    return FileResponse(path)


async def create_media_ticket(capture_id: str) -> str:
    ticket = new_secret()
    now = now_epoch()
    db_path = get_db_path(DATA_DIR)
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT INTO media_tickets (token_hash, capture_id, expires_at) VALUES (?, ?, ?)",
            (hash_secret(ticket), capture_id, now + MEDIA_TICKET_TTL_SECONDS),
        )
        await db.commit()
    return ticket


@app.post("/media-tickets")
async def issue_media_ticket(
    body: MediaTicketRequest,
    _token: str = Depends(require_bearer),
) -> dict[str, Any]:
    ticket = await create_media_ticket(body.capture_id)
    return {
        "captureId": body.capture_id,
        "expiresAt": now_epoch() + MEDIA_TICKET_TTL_SECONDS,
        "url": f"http://{HOST}:{PORT}/media/{body.capture_id}?{urlencode({'ticket': ticket})}",
    }


@app.post("/auth/revoke")
async def revoke_current_token(token: str = Depends(require_bearer)) -> dict[str, Any]:
    db_path = get_db_path(DATA_DIR)
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "UPDATE devices SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
            (now_epoch(), hash_secret(token)),
        )
        await db.commit()
    return {"ok": True, "revoked": True}


def _run_analyze_sync(body: AnalyzeRequest, path_str: str, fingerprint: str, metadata_json: str) -> dict[str, Any]:
    video_path = Path(path_str)
    meta = json.loads(metadata_json)
    width, height, fps = int(meta["width"]), int(meta["height"]), float(meta["fps"])
    frame_count = int(meta.get("frameCount") or max(1, int(meta["durationMs"] / 1000 * fps)))
    requested_max_frames = body.max_frames if body.max_frames is not None else DEFAULT_MAX_FRAMES
    max_frames = min(requested_max_frames, MAX_ANALYSIS_FRAMES)
    stride = body.frame_stride or DEFAULT_STRIDE

    frames = decode_frames(video_path, max_frames=max_frames, stride=stride)
    if not frames:
        raise MediaError("No frames decoded from video")
    truncated = bool(max_frames is not None and len(frames) >= max_frames)

    stats = sample_frame_stats_from_frames(frames)
    pose = estimate_pose(
        frames=frames,
        fps=fps,
        width=width,
        height=height,
    )
    visibility = body_visibility_ratio(pose)
    quality = run_quality_gate(
        width=width,
        height=height,
        fps=fps,
        frame_count=frame_count,
        mean_brightness=stats["meanBrightness"],
        body_visibility_ratio=visibility,
        mean_edge_ratio=stats["meanEdgeRatio"],
    )
    if not quality["passed"]:
        raise ValueError(json.dumps({"message": "Quality gate rejected capture", "quality": quality}))

    mid = frames[len(frames) // 2][2]
    court = calibrate_court(
        video_path=None,
        width=width,
        height=height,
        manual_corners=body.court_corners,
        sample_frame_bgr=mid,
    )
    racket = track_racket(
        pose_frames=pose["frames"], fps=fps, dominant_hand=body.dominant_hand
    )
    try:
        shuttle = track_shuttle(
            frames=frames,
            fps=fps,
            width=width,
            height=height,
            pose_frames=pose["frames"],
        )
    except MediaError as shuttle_err:
        shuttle = {
            "adapter": "opencv-motion-blob-shuttle",
            "version": "1.0.0",
            "points": [],
            "coverage": 0.0,
            "error": str(shuttle_err),
        }

    events = propose_events(
        pose_frames=pose["frames"],
        racket_track=racket["points"],
        shuttle_track=shuttle["points"],
        fps=fps,
        stroke_hint=body.stroke_hint or "clear",
        manual_events=body.manual_events,
    )

    modules = body.modules or [
        f"technique:{body.stroke_hint or 'clear'}",
        f"footwork:layer:{body.stroke_hint or 'clear'}",
    ]

    metrics = compute_metrics(
        modules=modules,
        pose=pose,
        racket=racket,
        shuttle=shuttle,
        events=events,
        court=court,
        fps=fps,
    )
    findings = findings_from_metrics(metrics=metrics, events=events, modules=modules)

    run_id = str(uuid.uuid4())
    writer = AnalysisPackageWriter(DATA_DIR / "packages" / run_id)
    package = writer.write(
        analysis_run_id=run_id,
        capture_id=body.capture_id,
        fingerprint=fingerprint,
        meta=meta,
        modules=modules,
        quality=quality,
        court=court,
        pose=pose,
        racket=racket,
        shuttle=shuttle,
        events=events,
        metrics=metrics,
        findings=findings,
        pipeline_version=PIPELINE_VERSION,
    )
    writer.prune_siblings(DATA_DIR / "packages", keep=PACKAGE_RETENTION)

    summary = {
        "title": meta.get("title") or video_path.stem,
        "metrics": metrics,
        "findings": findings,
        "events": events,
        "quality": quality,
        "court": {"valid": court["valid"], "method": court["method"], "confidence": court["confidence"]},
        "modules": modules,
        "pose": {
            "adapter": pose["adapter"],
            "detectionCoverage": pose.get("detectionCoverage"),
            "detectedFrames": pose.get("detectedFrames"),
            "totalFrames": pose.get("totalFrames"),
        },
        "racketCoverage": racket.get("coverage"),
        "shuttleCoverage": shuttle.get("coverage"),
        "strokeHint": body.stroke_hint or "clear",
        "frameWindow": {
            "decodedFrames": len(frames),
            "maxFramesCap": max_frames,
            "stride": stride,
            "truncated": truncated,
        },
    }
    return {
        "run_id": run_id,
        "package": package,
        "summary": summary,
        "capture_id": body.capture_id,
    }


@app.post("/analyze")
async def analyze(
    body: AnalyzeRequest,
    _token: str = Depends(require_bearer),
) -> dict[str, Any]:
    db_path = get_db_path(DATA_DIR)
    async with aiosqlite.connect(db_path) as db:
        cur = await db.execute(
            "SELECT path, fingerprint, metadata_json FROM captures WHERE id = ?",
            (body.capture_id,),
        )
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Capture not found")
    path_str, fingerprint, metadata_json = row
    video_path = Path(path_str)
    if not video_path.exists():
        raise HTTPException(410, "Local media missing")

    try:
        async with ANALYSIS_SEMAPHORE:
            result = await asyncio.to_thread(
                _run_analyze_sync, body, path_str, fingerprint, metadata_json
            )
    except MediaError as e:
        raise HTTPException(400, str(e)) from e
    except ValueError as e:
        try:
            detail = json.loads(str(e))
        except json.JSONDecodeError:
            detail = str(e)
        raise HTTPException(422, detail) from e

    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            """INSERT INTO analysis_runs
               (id, capture_id, package_path, package_sha256, summary_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                result["run_id"],
                body.capture_id,
                result["package"]["path"],
                result["package"]["sha256"],
                json.dumps(result["summary"]),
                utc_now(),
            ),
        )
        await db.commit()

    media_ticket = await create_media_ticket(body.capture_id)

    return {
        "analysisRunId": result["run_id"],
        "package": {"path": result["package"]["path"], "sha256": result["package"]["sha256"]},
        "summary": result["summary"],
        "agentMediaUrl": f"http://{HOST}:{PORT}/media/{body.capture_id}?{urlencode({'ticket': media_ticket})}",
    }


@app.get("/runs")
async def list_runs(limit: int = 50, _token: str = Depends(require_bearer)) -> dict[str, Any]:
    limit = max(1, min(limit, 200))
    db_path = get_db_path(DATA_DIR)
    async with aiosqlite.connect(db_path) as db:
        cur = await db.execute(
            """SELECT id, capture_id, summary_json, created_at
               FROM analysis_runs ORDER BY created_at DESC LIMIT ?""",
            (limit,),
        )
        rows = await cur.fetchall()
    runs = []
    for run_id, capture_id, summary_json, created_at in rows:
        summary = json.loads(summary_json)
        runs.append(
            {
                "analysisRunId": run_id,
                "captureId": capture_id,
                "createdAt": created_at,
                "title": summary.get("title"),
                "strokeHint": summary.get("strokeHint"),
                "modules": summary.get("modules"),
                "metrics": summary.get("metrics", []),
            }
        )
    return {"runs": runs}


@app.get("/metrics/series")
async def metrics_series(
    metric_id: str,
    limit: int = 200,
    _token: str = Depends(require_bearer),
) -> dict[str, Any]:
    limit = max(1, min(limit, 500))
    db_path = get_db_path(DATA_DIR)
    async with aiosqlite.connect(db_path) as db:
        cur = await db.execute(
            """SELECT id, summary_json, created_at FROM analysis_runs
               ORDER BY created_at DESC LIMIT ?""",
            (limit,),
        )
        rows = await cur.fetchall()
    rows.reverse()
    points = []
    for run_id, summary_json, created_at in rows:
        summary = json.loads(summary_json)
        for m in summary.get("metrics", []):
            if m.get("metricId") != metric_id or m.get("withheld"):
                continue
            if m.get("value") is None:
                continue
            points.append(
                {
                    "sessionId": run_id,
                    "sessionTitle": summary.get("title") or run_id[:8],
                    "createdAt": created_at,
                    "metricId": metric_id,
                    "value": m["value"],
                    "unit": m.get("unit"),
                }
            )
    return {"metricId": metric_id, "points": points}


@app.get("/runs/{run_id}")
async def get_run(run_id: str, _token: str = Depends(require_bearer)) -> dict[str, Any]:
    db_path = get_db_path(DATA_DIR)
    async with aiosqlite.connect(db_path) as db:
        cur = await db.execute(
            "SELECT summary_json, package_path, package_sha256, capture_id, created_at FROM analysis_runs WHERE id = ?",
            (run_id,),
        )
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Run not found")
    summary, package_path, sha, capture_id, created_at = row
    return {
        "analysisRunId": run_id,
        "captureId": capture_id,
        "createdAt": created_at,
        "packagePath": package_path,
        "packageSha256": sha,
        "summary": json.loads(summary),
        "agentOnline": True,
    }


@app.put("/byok")
async def upsert_byok(body: ByokUpsert, _token: str = Depends(require_bearer)) -> dict[str, Any]:
    byok.set_key(provider=body.provider, api_key=body.api_key, model=body.model)
    return {"ok": True, "provider": body.provider, "model": body.model, "stored": "local-agent-encrypted"}


@app.delete("/byok")
async def clear_byok(_token: str = Depends(require_bearer)) -> dict[str, Any]:
    byok.clear()
    return {"ok": True}


@app.post("/insight")
async def insight(body: InsightBody, _token: str = Depends(require_bearer)) -> dict[str, Any]:
    db_path = get_db_path(DATA_DIR)
    async with aiosqlite.connect(db_path) as db:
        cur = await db.execute("SELECT summary_json FROM analysis_runs WHERE id = ?", (body.analysis_run_id,))
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Run not found")
    summary = json.loads(row[0])
    return await run_insight(
        byok=byok,
        findings=summary.get("findings", []),
        metrics=summary.get("metrics", []),
        locale=body.locale,
    )


@app.get("/readiness/local")
async def local_readiness(_token: str = Depends(require_bearer)) -> dict[str, Any]:
    reports_dir = Path(__file__).resolve().parents[2] / "validation" / "reports"
    records = []
    if reports_dir.exists():
        for p in sorted(reports_dir.glob("*.json")):
            data = json.loads(p.read_text(encoding="utf-8"))
            records.append(
                {
                    "moduleId": data["moduleId"],
                    "status": "on" if data.get("passed") else "locked",
                    "passed": data.get("passed", False),
                    "reportPath": str(p),
                }
            )
    locked = [r["moduleId"] for r in records if r["status"] == "locked"]
    return {"records": records, "complete": len(records) > 0 and len(locked) == 0, "locked": locked}


def main() -> None:
    import uvicorn

    uvicorn.run("main:app", host=HOST, port=PORT, reload=False)


if __name__ == "__main__":
    main()
