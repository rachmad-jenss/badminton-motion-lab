from __future__ import annotations

import math
from typing import Any

import numpy as np

from adapters.frame_index import get_frame, index_frames_by_frame_index


def _landmark(frame: dict[str, Any], name: str) -> dict[str, Any] | None:
    return next((l for l in frame.get("landmarks", []) if l["name"] == name), None)


def _angle(a: dict[str, Any], b: dict[str, Any], c: dict[str, Any]) -> float:
    bax, bay = a["x"] - b["x"], a["y"] - b["y"]
    bcx, bcy = c["x"] - b["x"], c["y"] - b["y"]
    dot = bax * bcx + bay * bcy
    na = math.hypot(bax, bay) * math.hypot(bcx, bcy)
    if na == 0:
        return 0.0
    return math.degrees(math.acos(max(-1.0, min(1.0, dot / na))))


def _apply_homography(H: list[list[float]], x: float, y: float) -> tuple[float, float]:
    m = np.array(H, dtype=np.float64)
    v = m @ np.array([x, y, 1.0], dtype=np.float64)
    if abs(v[2]) < 1e-9:
        return x, y
    return float(v[0] / v[2]), float(v[1] / v[2])


def compute_metrics(
    *,
    modules: list[str],
    pose: dict[str, Any],
    racket: dict[str, Any],
    shuttle: dict[str, Any],
    events: dict[str, Any],
    court: dict[str, Any],
    fps: float,
) -> list[dict[str, Any]]:
    frames = pose.get("frames", [])
    by_idx = index_frames_by_frame_index(frames)
    contact = next((e for e in events.get("events", []) if e["type"] == "contact"), None)
    split = next((e for e in events.get("events", []) if e["type"] == "split_step"), None)
    base = next((e for e in events.get("events", []) if e["type"] == "base_return"), None)

    out: list[dict[str, Any]] = []
    if not contact or not by_idx:
        return out

    fr = get_frame(by_idx, int(contact["frameIndex"]))
    if not fr:
        return out

    sh = _landmark(fr, "right_shoulder") or _landmark(fr, "left_shoulder")
    el = _landmark(fr, "right_elbow") or _landmark(fr, "left_elbow")
    wr = _landmark(fr, "right_wrist") or _landmark(fr, "left_wrist")
    lh = _landmark(fr, "left_hip")
    rh = _landmark(fr, "right_hip")
    la = _landmark(fr, "left_ankle")
    ra = _landmark(fr, "right_ankle")

    def add(metric_id: str, value: float | None, unit: str, confidence: float, **kwargs: Any) -> None:
        withheld = value is None or kwargs.get("withheld", False)
        out.append(
            {
                "metricId": metric_id,
                "value": None if withheld else value,
                "unit": unit,
                "confidence": confidence,
                "withheld": withheld,
                "limitation": kwargs.get("limitation"),
                "evidenceFrameIndex": contact["frameIndex"],
                "repIndex": 0,
                "version": "1.0.0",
                "moduleIds": kwargs.get("moduleIds", modules),
            }
        )

    if sh and el and wr:
        add("elbow_angle_contact", _angle(sh, el, wr), "degrees", 0.85)
    else:
        add("elbow_angle_contact", None, "degrees", 0.0, withheld=True, limitation="Missing landmarks")

    if sh and lh and rh:
        mid_x = (lh["x"] + rh["x"]) / 2
        trunk = math.degrees(math.atan2(sh["x"] - mid_x, rh["y"] - sh["y"] + 1e-6))
        add("trunk_lean_contact", trunk, "degrees", 0.75)
        add("shoulder_abduction_contact", abs(trunk) + 40, "degrees", 0.7)

    if wr and la and ra and sh:
        body_h = abs(((la["y"] + ra["y"]) / 2) - wr["y"])
        add(
            "wrist_height_ratio_contact",
            min(1.0, body_h / (abs(la["y"] - sh["y"]) + 1e-6)),
            "ratio",
            0.8,
        )
    elif wr and la and ra:
        add(
            "wrist_height_ratio_contact",
            None,
            "ratio",
            0.0,
            withheld=True,
            limitation="Missing shoulder landmark",
        )

    pts = racket.get("points", [])
    idx = int(contact["frameIndex"])
    nearby = [p for p in pts if abs(p["frameIndex"] - idx) <= 2]
    if len(nearby) >= 2:
        speeds = [
            math.hypot(nearby[i]["x"] - nearby[i - 1]["x"], nearby[i]["y"] - nearby[i - 1]["y"])
            for i in range(1, len(nearby))
        ]
        add("racket_speed_proxy_contact", max(speeds), "px", 0.8)
    else:
        add(
            "racket_speed_proxy_contact",
            None,
            "px",
            0.0,
            withheld=True,
            limitation="Insufficient racket track",
        )

    spts = shuttle.get("points", [])
    s_near = [p for p in spts if abs(p["frameIndex"] - idx) <= 3]
    if len(s_near) >= 2:
        ang = math.degrees(
            math.atan2(s_near[-1]["y"] - s_near[0]["y"], s_near[-1]["x"] - s_near[0]["x"])
        )
        add("shuttle_approach_angle", ang, "degrees", 0.75)
    else:
        add(
            "shuttle_approach_angle",
            None,
            "degrees",
            0.0,
            withheld=True,
            limitation="Shuttle track gap",
        )

    wants_fw = any(m.startswith("footwork:") for m in modules)
    H = court.get("homography") if court.get("valid") else None

    if wants_fw and not court.get("valid"):
        for mid in (
            "recovery_path_length_court",
            "court_coverage_area",
            "path_efficiency",
            "first_step_latency",
            "landing_symmetry",
            "split_step_count",
        ):
            add(
                mid,
                None,
                "meters" if "area" in mid or "length" in mid else ("ratio" if "symmetry" in mid or "efficiency" in mid else ("count" if "count" in mid else "seconds")),
                0.0,
                withheld=True,
                limitation="Court calibration invalid — Footwork withheld",
            )
    elif wants_fw:
        if split:
            add(
                "split_step_timing_to_contact",
                float(contact["frameIndex"] - split["frameIndex"]),
                "frames",
                0.8,
            )
            # first-step latency: contact-relative split timing in seconds
            add(
                "first_step_latency",
                abs(float(contact["frameIndex"] - split["frameIndex"])) / max(fps, 1e-6),
                "seconds",
                0.75,
            )
        else:
            add(
                "first_step_latency",
                None,
                "seconds",
                0.0,
                withheld=True,
                limitation="No split_step event",
            )

        if la and ra:
            if H:
                lx, ly = _apply_homography(H, la["x"], la["y"])
                rx, ry = _apply_homography(H, ra["x"], ra["y"])
                add("stance_width_contact", math.hypot(rx - lx, ry - ly), "meters", 0.75)
            else:
                add(
                    "stance_width_contact",
                    None,
                    "meters",
                    0.0,
                    withheld=True,
                    limitation="Homography missing",
                )

        # Path metrics from ankle midpoints over frames in contact→base window
        start_fi = int(contact["frameIndex"])
        end_fi = int(base["frameIndex"]) if base else start_fi
        path_pts: list[tuple[float, float]] = []
        for fi in sorted(by_idx.keys()):
            if fi < start_fi or fi > end_fi:
                continue
            f = by_idx[fi]
            a_l = _landmark(f, "left_ankle")
            a_r = _landmark(f, "right_ankle")
            if not a_l or not a_r:
                continue
            mx, my = (a_l["x"] + a_r["x"]) / 2, (a_l["y"] + a_r["y"]) / 2
            if H:
                mx, my = _apply_homography(H, mx, my)
                path_pts.append((mx, my))

        if len(path_pts) >= 2 and H:
            lengths = [
                math.hypot(path_pts[i][0] - path_pts[i - 1][0], path_pts[i][1] - path_pts[i - 1][1])
                for i in range(1, len(path_pts))
            ]
            path_len = float(sum(lengths))
            straight = math.hypot(
                path_pts[-1][0] - path_pts[0][0], path_pts[-1][1] - path_pts[0][1]
            )
            xs = [p[0] for p in path_pts]
            ys = [p[1] for p in path_pts]
            # axis-aligned bbox area as coverage proxy (m^2)
            coverage = max(0.0, (max(xs) - min(xs)) * (max(ys) - min(ys)))
            add("recovery_path_length_court", path_len, "meters", 0.7)
            add("court_coverage_area", coverage, "meters", 0.65)
            add(
                "path_efficiency",
                (straight / path_len) if path_len > 1e-6 else None,
                "ratio",
                0.7,
                withheld=path_len <= 1e-6,
                limitation="Degenerate path" if path_len <= 1e-6 else None,
            )
        else:
            for mid, unit in (
                ("recovery_path_length_court", "meters"),
                ("court_coverage_area", "meters"),
                ("path_efficiency", "ratio"),
            ):
                add(
                    mid,
                    None,
                    unit,
                    0.0,
                    withheld=True,
                    limitation="Insufficient ankle path or homography",
                )

        # Landing symmetry from left/right ankle vertical velocity magnitude ratio near contact
        window = [fi for fi in by_idx if abs(fi - idx) <= int(max(fps * 0.1, 1))]
        left_dys, right_dys = [], []
        prev = None
        for fi in sorted(window):
            f = by_idx[fi]
            a_l = _landmark(f, "left_ankle")
            a_r = _landmark(f, "right_ankle")
            if prev and a_l and a_r:
                pl = _landmark(prev, "left_ankle")
                pr = _landmark(prev, "right_ankle")
                if pl and pr:
                    left_dys.append(abs(a_l["y"] - pl["y"]))
                    right_dys.append(abs(a_r["y"] - pr["y"]))
            prev = f
        if left_dys and right_dys:
            lmean, rmean = float(np.mean(left_dys)), float(np.mean(right_dys))
            denom = max(lmean, rmean, 1e-6)
            add("landing_symmetry", min(lmean, rmean) / denom, "ratio", 0.65)
        else:
            add(
                "landing_symmetry",
                None,
                "ratio",
                0.0,
                withheld=True,
                limitation="Insufficient ankle motion near contact",
            )

        # split_step_count from events
        splits = [e for e in events.get("events", []) if e["type"] == "split_step"]
        add("split_step_count", float(len(splits)), "count", 0.8 if splits else 0.4)

    return out


def findings_from_metrics(
    *,
    metrics: list[dict[str, Any]],
    events: dict[str, Any],
    modules: list[str],
) -> list[dict[str, Any]]:
    findings = []
    for m in metrics:
        if m.get("withheld"):
            continue
        findings.append(
            {
                "id": f"finding-{m['metricId']}",
                "moduleId": (m.get("moduleIds") or modules)[0],
                "title": m["metricId"].replace("_", " "),
                "observation": f"Measured {m['metricId']} = {m['value']} {m['unit']}",
                "metricIds": [m["metricId"]],
                "evidenceFrameIndices": [m.get("evidenceFrameIndex") or 0],
                "confidence": m.get("confidence", 0.5),
                "limitation": m.get("limitation"),
            }
        )
    contact = next((e for e in events.get("events", []) if e["type"] == "contact"), None)
    if contact:
        findings.insert(
            0,
            {
                "id": "finding-contact-event",
                "moduleId": modules[0] if modules else "technique:clear",
                "title": "Contact frame proposal",
                "observation": f"Contact proposed at frame {contact['frameIndex']} (conf={contact['confidence']})",
                "metricIds": [],
                "evidenceFrameIndices": [contact["frameIndex"]],
                "confidence": contact["confidence"],
            },
        )
    return findings
