from __future__ import annotations

import math
from typing import Any

from adapters.frame_index import get_frame, index_frames_by_frame_index

MIN_PROPOSAL_CONFIDENCE = 0.55
MANUAL_EVENT_TYPES = frozenset(
    {"rep_start", "split_step", "contact", "rep_end", "base_return", "first_step"}
)


def propose_events(
    *,
    pose_frames: list[dict[str, Any]],
    racket_track: list[dict[str, Any]],
    shuttle_track: list[dict[str, Any]],
    fps: float,
    stroke_hint: str,
    manual_events: list[dict[str, Any]] | None = None,
    source_frame_count: int | None = None,
    source_duration_ms: float | None = None,
    pure_footwork: bool = False,
) -> dict[str, Any]:
    """Auto-propose rep bounds + contact; fall back to manual when confidence low."""
    by_idx = index_frames_by_frame_index(pose_frames)
    if not by_idx:
        return {"mode": "manual_required", "events": [], "reps": [], "reason": "empty pose"}
    if manual_events:
        last_time_ms = (
            float(source_duration_ms)
            if source_duration_ms is not None
            else max(float(frame.get("timeMs", 0.0)) for frame in pose_frames)
        )
        validate_manual_events(
            manual_events,
            frame_count=source_frame_count or max(by_idx) + 1,
            duration_ms=last_time_ms,
        )

    if pure_footwork and not racket_track:
        return _propose_pure_footwork_events(
            by_idx=by_idx,
            fps=fps,
            stroke_hint=stroke_hint,
            manual_events=manual_events,
        )

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
        proposed = _merge_manual_events(proposed, manual_events)

    contact = next((event for event in reversed(proposed) if event["type"] == "contact"), None)
    contact_frame = int(contact["frameIndex"]) if contact else best_i
    start_frame = _event_frame(proposed, "rep_start", rep_start)
    end_frame = _event_frame(proposed, "rep_end", rep_end)
    reps = [{"repIndex": 0, "startFrame": start_frame, "contactFrame": contact_frame, "endFrame": end_frame}]
    return {
        "mode": mode,
        "strokeHint": stroke_hint,
        "minConfidence": MIN_PROPOSAL_CONFIDENCE,
        "events": proposed,
        "reps": reps,
    }


def _propose_pure_footwork_events(
    *,
    by_idx: dict[int, dict[str, Any]],
    fps: float,
    stroke_hint: str,
    manual_events: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    frame_indices = sorted(by_idx)

    def _tm(frame_index: int) -> float:
        frame = get_frame(by_idx, frame_index)
        return float(frame["timeMs"]) if frame else float(frame_index) / max(fps, 1e-6) * 1000.0

    def _midpoint(frame: dict[str, Any]) -> tuple[float, float] | None:
        landmarks = {landmark["name"]: landmark for landmark in frame.get("landmarks", [])}
        left = landmarks.get("left_ankle")
        right = landmarks.get("right_ankle")
        if not left or not right:
            return None
        return ((left["x"] + right["x"]) / 2, (left["y"] + right["y"]) / 2)

    proposed: list[dict[str, Any]] = []
    mode = "auto"
    if manual_events:
        mode = "manual"
        proposed = [{**event, "source": "corrected"} for event in manual_events]
    else:
        trajectory = [
            (frame_index, midpoint)
            for frame_index in frame_indices
            if (midpoint := _midpoint(by_idx[frame_index])) is not None
        ]
        movements = [
            (math.hypot(cur[1][0] - prev[1][0], cur[1][1] - prev[1][1]), cur[0])
            for prev, cur in zip(trajectory, trajectory[1:])
        ]
        if not movements:
            return {
                "mode": "manual_required",
                "strokeHint": stroke_hint,
                "minConfidence": MIN_PROPOSAL_CONFIDENCE,
                "events": [],
                "reps": [],
                "reason": "Insufficient ankle landmarks for pure footwork proposal",
            }
        movement, first_step = max(movements, key=lambda item: item[0])
        if movement < 0.01:
            return {
                "mode": "manual_required",
                "strokeHint": stroke_hint,
                "minConfidence": MIN_PROPOSAL_CONFIDENCE,
                "events": [],
                "reps": [],
                "reason": "Foot displacement is below the proposal gate — manual marking required",
            }
        confidence = min(0.9, max(MIN_PROPOSAL_CONFIDENCE, 0.55 + movement * 2.0))
        first_frame = frame_indices[0]
        last_frame = frame_indices[-1]
        split_step = max(first_frame, first_step - max(int(fps * 0.2), 1))
        rep_start = max(first_frame, split_step - max(int(fps * 0.3), 1))
        base_return = min(last_frame, first_step + max(int(fps * 0.6), 1))
        rep_end = min(last_frame, base_return + max(int(fps * 0.2), 1))
        proposed = [
            {"type": "rep_start", "frameIndex": rep_start, "timeMs": _tm(rep_start), "confidence": confidence, "source": "model", "repIndex": 0},
            {"type": "split_step", "frameIndex": split_step, "timeMs": _tm(split_step), "confidence": confidence, "source": "model", "repIndex": 0},
            {"type": "first_step", "frameIndex": first_step, "timeMs": _tm(first_step), "confidence": confidence, "source": "model", "repIndex": 0},
            {"type": "base_return", "frameIndex": base_return, "timeMs": _tm(base_return), "confidence": confidence, "source": "model", "repIndex": 0},
            {"type": "rep_end", "frameIndex": rep_end, "timeMs": _tm(rep_end), "confidence": confidence, "source": "model", "repIndex": 0},
        ]

    first_frame = frame_indices[0]
    last_frame = frame_indices[-1]
    start_frame = _event_frame(proposed, "rep_start", first_frame)
    end_frame = _event_frame(proposed, "rep_end", last_frame)
    contact = next((event for event in reversed(proposed) if event.get("type") == "contact"), None)
    anchor = contact["frameIndex"] if contact else _event_frame(proposed, "first_step", first_frame)
    return {
        "mode": mode,
        "strokeHint": stroke_hint,
        "minConfidence": MIN_PROPOSAL_CONFIDENCE,
        "events": proposed,
        "reps": [
            {
                "repIndex": 0,
                "startFrame": start_frame,
                "contactFrame": int(anchor) if contact else None,
                "endFrame": end_frame,
            }
        ],
    }


def _merge_manual_events(
    proposed: list[dict[str, Any]], manual_events: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Replace the model event for a corrected type/rep instead of appending a conflict."""
    merged = list(proposed)
    for raw in manual_events:
        event = {**raw, "source": "corrected"}
        event_type = event.get("type")
        rep_index = event.get("repIndex", 0)
        replacement = next(
            (
                index
                for index in range(len(merged) - 1, -1, -1)
                if merged[index].get("type") == event_type
                and merged[index].get("repIndex", 0) == rep_index
            ),
            None,
        )
        if replacement is None:
            merged.append(event)
        else:
            merged[replacement] = event
    return merged


def _event_frame(events: list[dict[str, Any]], event_type: str, fallback: int) -> int:
    event = next((item for item in reversed(events) if item.get("type") == event_type), None)
    return int(event["frameIndex"]) if event and "frameIndex" in event else fallback


def validate_manual_event_fields(event: dict[str, Any], *, label: str) -> None:
    """Validate manual-event field types before applying capture bounds."""
    frame_index = event.get("frameIndex")
    if isinstance(frame_index, bool) or not isinstance(frame_index, int):
        raise ValueError(f"{label} frameIndex must be an integer")
    for name in ("timeMs", "confidence"):
        if name not in event:
            continue
        number = event[name]
        if isinstance(number, bool) or not isinstance(number, (int, float)):
            raise ValueError(f"{label} {name} must be numeric")
        if not math.isfinite(float(number)):
            raise ValueError(f"{label} {name} must be finite")
    if "repIndex" in event:
        rep_index = event["repIndex"]
        if isinstance(rep_index, bool) or not isinstance(rep_index, int):
            raise ValueError(f"{label} repIndex must be an integer")


def validate_manual_events(
    events: list[dict[str, Any]], *, frame_count: int, duration_ms: float
) -> None:
    """Reject manual overrides that cannot refer to a frame in this capture."""
    if frame_count <= 0 or not math.isfinite(duration_ms) or duration_ms < 0:
        raise ValueError("Manual event validation requires a non-empty capture duration")
    allowed_keys = {"type", "frameIndex", "timeMs", "confidence", "repIndex"}
    for index, event in enumerate(events):
        if not isinstance(event, dict):
            raise ValueError(f"Manual event {index + 1} must be an object")
        unknown = set(event) - allowed_keys
        if unknown:
            raise ValueError(
                f"Manual event {index + 1} contains unsupported fields: {sorted(unknown)}"
            )
        event_type = event.get("type")
        if event_type not in MANUAL_EVENT_TYPES:
            raise ValueError(
                f"Manual event {index + 1} has unsupported type: {event_type!r}"
            )
        label = f"Manual event {index + 1}"
        validate_manual_event_fields(event, label=label)
        frame_index = event.get("frameIndex")
        if not 0 <= frame_index < frame_count:
            raise ValueError(
                f"Manual event {index + 1} frameIndex must be between 0 and {frame_count - 1}"
            )
        time_ms = event.get("timeMs")
        if time_ms is None:
            raise ValueError(f"Manual event {index + 1} timeMs must be finite")
        if not 0.0 <= float(time_ms) <= duration_ms:
            raise ValueError(
                f"Manual event {index + 1} timeMs must be between 0 and {duration_ms:g}"
            )
        confidence = event.get("confidence", 1.0)
        if not 0.0 <= float(confidence) <= 1.0:
            raise ValueError(f"Manual event {index + 1} confidence must be between 0 and 1")
        rep_index = event.get("repIndex", 0)
        if isinstance(rep_index, bool) or not isinstance(rep_index, int) or not 0 <= rep_index <= 100:
            raise ValueError(f"Manual event {index + 1} repIndex must be between 0 and 100")
