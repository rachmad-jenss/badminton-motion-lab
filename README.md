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

## Roadmap

- **Beta v1 (≤ 1 month)**: current verified build, BYOK insights labeled
  experimental, opt-in data contribution (report-only; video never leaves the
  PC), and honest locked badges. Evidence target: 11 priority modules — clear,
  smash, serve, forehand, backhand (technique + footwork layer each) plus
  footwork pure — at 3 clips each.
- **Public-ready v1**: zero locked modules (24/24) at 5+ clips each. No fixed
  date; module order is the 5 priority strokes first, then the remaining 7.
- **Evidence rule (Plan 028)**: a module unlocks only when BOTH kinds pass —
  event/contact evidence from ShuttleSet broadcast clips AND pose-metric
  evidence from own-capture clips recorded with
  `docs/capture-protocols/side-ish-full-body-v1.md`. See
  `validation/DATASET_ATTRIBUTION.md` for dataset attribution and license notes.
  Media stays out of git (`validation/domain-media/`); only manifests, hashes,
  and reports are committed.

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

### Windows beginner path

1. Start the web app with `npm run dev:web` and open http://localhost:3001.
2. In Windows Explorer, double-click `infra/windows/install-agent.cmd`.
3. Keep the Local Agent console open. The script opens `/agent` after the health check;
   pair the browser, then choose a video from this PC.

The launcher installs Python and FFmpeg through `winget` when needed, creates the
Local Agent environment, verifies the pose-model checksum, and keeps the original
video on this PC. It is a development bootstrap, not a signed installer.

### Advanced developer setup

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

### 3. Unlock modules via domain fixture benchmarks (maintainer only)

```bash
npm run test:domain          # real agent + validation/domain-media clips (Plan 028)
npm run readiness:check      # strict public gate: zero locked modules
```

Domain clips and their truth live in `validation/domain-manifest.json` (media stays out of
git under `validation/domain-media/`). `npm run benchmark:fixtures` is a pipeline smoke
check only — since Plan 030 it does not write reports or the readiness seed;
`npm run readiness:integrity` validates report/seed provenance.

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
