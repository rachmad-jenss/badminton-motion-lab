from __future__ import annotations

from typing import Any

from adapters.frame_index import get_frame, index_frames_by_frame_index

MIN_PROPOSAL_CONFIDENCE = 0.55


def propose_events(
    *,
    pose_frames: list[dict[str, Any]],
    racket_track: list[dict[str, Any]],
    shuttle_track: list[dict[str, Any]],
    fps: float,
    stroke_hint: str,
    manual_events: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Auto-propose rep bounds + contact; fall back to manual when confidence low."""
    by_idx = index_frames_by_frame_index(pose_frames)
    if not by_idx:
        return {"mode": "manual_required", "events": [], "reps": [], "reason": "empty pose"}

    best_i = 0
    best_speed = -1.0
    for i in range(1, len(racket_track)):
        a, b = racket_track[i - 1], racket_track[i]
        speed = ((b["x"] - a["x"]) ** 2 + (b["y"] - a["y"]) ** 2) ** 0.5
        if speed > best_speed:
            best_speed = speed
            best_i = int(b["frameIndex"])

    contact_conf = 0.82 if best_speed > 0 else 0.4
    if shuttle_track and racket_track:
        contact_conf = min(0.95, contact_conf + 0.05)

    max_fi = max(by_idx.keys())
    split_frame = max(0, best_i - int(fps * 0.45))
    rep_start = max(0, best_i - int(fps * 0.9))
    rep_end = min(max_fi, best_i + int(fps * 0.6))
    base_return = min(max_fi, best_i + int(fps * 0.9))

    def _tm(fi: int) -> float:
        fr = get_frame(by_idx, fi)
        return float(fr["timeMs"]) if fr else float(fi) / fps * 1000.0

    proposed = [
        {
            "type": "rep_start",
            "frameIndex": rep_start,
            "timeMs": _tm(rep_start),
            "confidence": contact_conf,
            "source": "model",
            "repIndex": 0,
        },
        {
            "type": "split_step",
            "frameIndex": split_frame,
            "timeMs": _tm(split_frame),
            "confidence": max(0.5, contact_conf - 0.1),
            "source": "model",
            "repIndex": 0,
        },
        {
            "type": "contact",
            "frameIndex": best_i,
            "timeMs": _tm(best_i),
            "confidence": contact_conf,
            "source": "model",
            "repIndex": 0,
        },
        {
            "type": "rep_end",
            "frameIndex": rep_end,
            "timeMs": _tm(rep_end),
            "confidence": contact_conf,
            "source": "model",
            "repIndex": 0,
        },
        {
            "type": "base_return",
            "frameIndex": base_return,
            "timeMs": _tm(base_return),
            "confidence": max(0.5, contact_conf - 0.15),
            "source": "model",
            "repIndex": 0,
        },
    ]

    mode = "auto"
    if contact_conf < MIN_PROPOSAL_CONFIDENCE:
        mode = "manual_required"
        if manual_events:
            for ev in manual_events:
                proposed.append({**ev, "source": "manual"})
            mode = "manual"
        else:
            return {
                "mode": mode,
                "strokeHint": stroke_hint,
                "minConfidence": MIN_PROPOSAL_CONFIDENCE,
                "events": [],
                "reps": [],
                "reason": "Proposal confidence below gate — manual marking required",
            }

    if manual_events:
        for ev in manual_events:
            proposed.append({**ev, "source": "corrected"})

    reps = [{"repIndex": 0, "startFrame": rep_start, "contactFrame": best_i, "endFrame": rep_end}]
    return {
        "mode": mode,
        "strokeHint": stroke_hint,
        "minConfidence": MIN_PROPOSAL_CONFIDENCE,
        "events": proposed,
        "reps": reps,
    }
