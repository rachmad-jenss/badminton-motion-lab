# Badminton Motion Lab

Local-first **Badminton Motion and Performance Intelligence Platform**.

Web app = control plane. Windows **Local Agent** = execution plane. Original video stays on the user PC and is reviewed via `localhost` streaming.

## Product completeness (grilled)

Public stranger-ready build requires **zero locked modules**:

- Technique Lab: all Master Plan strokes (body + racket + shuttle + own benchmark each)
- Footwork Lab pure + footwork layer on every stroke
- Strict capture quality gate
- Court semi-auto → 4-corner fallback
- Session compare
- Optional BYOK insights (key only on Local Agent)

**Not in this completeness scope:** Match Intelligence, multi-camera/3D, coach workspace.

**Launch OS:** Windows only (macOS later). Marketing must say so.

## Monorepo

```
apps/web          Next.js control plane UI
apps/agent        Python Local Agent (FastAPI)
packages/contracts  Shared ontology, metrics, readiness, schemas
supabase/         Control-plane SQL + RLS
validation/       Fixtures, benchmark configs, reports
infra/windows     Agent install helpers
docs/             PRD/architecture PDFs + ADRs
```

## Quick start

### 1. Contracts + web

```bash
npm install
npm run contracts:build
npm run dev:web
```

Open http://localhost:3001

## Local Agent (real CV pipeline)

Requires **FFmpeg/ffprobe** on PATH and MediaPipe pose model at
`apps/agent/models/pose_landmarker_full.task` (auto-downloadable from Google MediaPipe models).

```powershell
cd apps/agent
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

Pipeline (no synthetic defaults):
1. ffprobe media metadata + SHA-256 fingerprint
2. Frame sampling for brightness/structure quality checks
3. MediaPipe Pose Landmarker on decoded frames
4. Racket tip from real wrist/elbow landmarks
5. Shuttle candidates via OpenCV motion blobs
6. Court auto lines (OpenCV Hough) or manual 4 corners
7. Event proposals + deterministic metrics + optional BYOK insight

Web UI: **http://localhost:3001** (pinned; port 3000 may be another app)

### 3. Unlock modules via fixture benchmarks

```bash
npm run benchmark:fixtures
npm run readiness:check
```

This writes `validation/reports/*.json` and updates `apps/web/src/lib/readiness.seed.json` so the UI can show all modules `on` when gates pass.

### 4. Supabase (optional for cloud summaries)

Apply `supabase/migrations/20260723100000_control_plane.sql` to your project. Copy `.env.example` → `.env.local`.

Dense pose/racket/shuttle time series never go into Postgres.

## Principles

- Evidence before advice
- Measurement before judgment
- No fabricated metrics in LLM output
- Module parity gate before `locked → on`

## License

Private / hobby research project unless otherwise stated.
