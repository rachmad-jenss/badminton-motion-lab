"""Court calibration from real frames (line detection) with manual 4-corner fallback."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2
import numpy as np

from adapters.media import MediaError


def calibrate_court(
    *,
    video_path: Path | None = None,
    width: int,
    height: int,
    manual_corners: list[dict[str, float]] | None = None,
    sample_frame_bgr: np.ndarray | None = None,
) -> dict[str, Any]:
    if manual_corners and len(manual_corners) == 4:
        corners = [{"x": float(c["x"]), "y": float(c["y"])} for c in manual_corners]
        return {
            "method": "manual_four_corners",
            "valid": True,
            "cornersImage": corners,
            "homography": _homography_from_corners(corners, width, height),
            "confidence": 0.95,
            "message": "Manual four-corner calibration accepted",
        }

    frame = sample_frame_bgr
    if frame is None and video_path is not None:
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise MediaError(f"Cannot open video for court calibration: {video_path}")
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        mid = max(total // 2, 0)
        cap.set(cv2.CAP_PROP_POS_FRAMES, mid)
        ok, frame = cap.read()
        cap.release()
        if not ok or frame is None:
            raise MediaError("Could not read frame for court calibration")

    if frame is None:
        return {
            "method": "auto_lines",
            "valid": False,
            "cornersImage": [],
            "homography": None,
            "confidence": 0.0,
            "message": "No frame available for auto court detection — provide 4 corners",
        }

    corners, confidence, detail = _detect_court_quad(frame)
    valid = corners is not None and confidence >= 0.55
    return {
        "method": "auto_lines",
        "valid": valid,
        "cornersImage": corners or [],
        "homography": _homography_from_corners(corners, width, height) if valid and corners else None,
        "confidence": confidence,
        "message": detail if valid else f"{detail} — mark 4 corners to enable Footwork",
    }


def _detect_court_quad(frame: np.ndarray) -> tuple[list[dict[str, float]] | None, float, str]:
    h, w = frame.shape[:2]
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 50, 150)
    # Prefer lower 70% of frame (court floor)
    mask = np.zeros_like(edges)
    mask[int(h * 0.3) :, :] = 255
    edges = cv2.bitwise_and(edges, mask)
    lines = cv2.HoughLinesP(
        edges, 1, np.pi / 180, threshold=80, minLineLength=int(w * 0.15), maxLineGap=20
    )
    if lines is None or len(lines) < 4:
        return None, 0.2, "Insufficient court lines detected"

    # Collect endpoints and fit a convex hull / approx quad of strong lines
    pts = []
    for line in lines:
        x1, y1, x2, y2 = [int(v) for v in np.asarray(line).reshape(-1)[:4]]
        pts.append([x1, y1])
        pts.append([x2, y2])
    pts_arr = np.array(pts, dtype=np.float32)
    hull = cv2.convexHull(pts_arr)
    peri = cv2.arcLength(hull, True)
    approx = cv2.approxPolyDP(hull, 0.02 * peri, True)
    if len(approx) < 4:
        # fallback: bounding rect of hull
        x, y, bw, bh = cv2.boundingRect(hull)
        corners = [
            {"x": float(x), "y": float(y)},
            {"x": float(x + bw), "y": float(y)},
            {"x": float(x + bw), "y": float(y + bh)},
            {"x": float(x), "y": float(y + bh)},
        ]
        area_ratio = (bw * bh) / float(w * h)
        conf = 0.6 if 0.1 < area_ratio < 0.85 else 0.45
        return corners, conf, "Court approx from line bounding box"

    # Take 4 extreme points
    approx = approx.reshape(-1, 2)
    if len(approx) > 4:
        # pick 4 corners by max distance from center
        center = approx.mean(axis=0)
        d = np.linalg.norm(approx - center, axis=1)
        idx = np.argsort(d)[-4:]
        approx = approx[idx]
    ordered = _order_quad(approx)
    corners = [{"x": float(p[0]), "y": float(p[1])} for p in ordered]
    return corners, 0.72, "Court quad from Hough lines"


def _order_quad(pts: np.ndarray) -> np.ndarray:
    # Order: TL, TR, BR, BL
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).reshape(-1)
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmin(diff)]
    bl = pts[np.argmax(diff)]
    return np.array([tl, tr, br, bl], dtype=np.float32)


def _homography_from_corners(
    corners: list[dict[str, float]] | None, width: int, height: int
) -> list[list[float]] | None:
    if not corners or len(corners) != 4:
        return None
    # Map image court quad to a standard singles court rectangle in meters (6.1 x 13.4)
    src = np.array([[c["x"], c["y"]] for c in corners], dtype=np.float32)
    dst = np.array([[0.0, 0.0], [6.1, 0.0], [6.1, 13.4], [0.0, 13.4]], dtype=np.float32)
    H, _ = cv2.findHomography(src, dst)
    if H is None:
        return None
    return H.tolist()
