"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  agentBaseUrl,
  agentHealth,
  agentPost,
  agentToken,
  type AgentHealthResult,
} from "@/lib/agent";
import { getModules } from "@/lib/modules";
import {
  buildLabelingTruth,
  frameFromTime,
  labelingTruthJson,
  safeTruthFilename,
  validateCourtCorners,
  type CourtCorner,
  type LabelingHand,
} from "@/lib/labeling";

const EMPTY_CORNERS: CourtCorner[] = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
];

export default function LabelPage() {
  const [health, setHealth] = useState<AgentHealthResult | null>(null);
  const [captureId, setCaptureId] = useState("");
  const [fps, setFps] = useState(30);
  const [timeSeconds, setTimeSeconds] = useState(0);
  const [contactFrame, setContactFrame] = useState<number | null>(null);
  const [corners, setCorners] = useState<CourtCorner[]>(EMPTY_CORNERS);
  const [strokeId, setStrokeId] = useState("clear");
  const [hand, setHand] = useState<LabelingHand>("unknown");
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cornerError, setCornerError] = useState<string | null>(null);

  useEffect(() => {
    void agentHealth().then(setHealth);
  }, []);

  const paired = Boolean(agentToken());
  const techniques = getModules().filter((m) => m.kind === "technique_stroke");
  const frame = frameFromTime(timeSeconds, fps);

  function updateCorner(index: number, axis: "x" | "y", value: string) {
    const parsed = Number(value);
    const next = corners.map((c, i) => (i === index ? { ...c, [axis]: Number.isFinite(parsed) ? parsed : 0 } : c));
    setCorners(next);
  }

  async function loadPreview() {
    setStatus(null);
    if (!captureId.trim()) {
      setStatus("Enter a capture ID first.");
      return;
    }
    try {
      const res = await agentPost<{ captureId: string; expiresAt: number; url: string }>(
        "/media-tickets",
        { capture_id: captureId.trim() },
      );
      setTicketUrl(res.url);
      setStatus("Preview loaded from the Local Agent.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not load the media preview.");
    }
  }

  function markContactFrame() {
    setContactFrame(frame);
    setStatus("Contact frame: " + frame + " (from " + timeSeconds + "s at " + fps + " fps).");
  }

  function handleTimeChange(value: string) {
    const parsed = Number(value);
    const seconds = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    setTimeSeconds(seconds);
    if (videoRef.current && Number.isFinite(videoRef.current.duration) && videoRef.current.duration > 0) {
      videoRef.current.currentTime = seconds;
    }
  }

  function exportTruth() {
    const video = videoRef.current;
    const validation = validateCourtCorners(corners, {
      width: video?.videoWidth || 1280,
      height: video?.videoHeight || 720,
    });
    if (!validation.valid) {
      setCornerError(validation.reason);
      return;
    }
    setCornerError(null);
    const truth = buildLabelingTruth({
      id: captureId.trim(),
      fps,
      contactFrameTruth: contactFrame,
      courtCorners: corners,
      strokeId,
      hand,
      notes: "Labeled in the web labeling mode; sha256 filled by scripts when saved to validation/domain-media.",
    });
    const blob = new Blob([labelingTruthJson(truth)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeTruthFilename(captureId.trim());
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus("Truth JSON downloaded. Save it under validation/domain-media/ and add the clip to the manifest.");
  }

  async function copyTruth() {
    const video = videoRef.current;
    const validation = validateCourtCorners(corners, {
      width: video?.videoWidth || 1280,
      height: video?.videoHeight || 720,
    });
    if (!validation.valid) {
      setCornerError(validation.reason);
      return;
    }
    setCornerError(null);
    const truth = buildLabelingTruth({
      id: captureId.trim(),
      fps,
      contactFrameTruth: contactFrame,
      courtCorners: corners,
      strokeId,
      hand,
    });
    try {
      await navigator.clipboard.writeText(labelingTruthJson(truth));
      setStatus("Truth JSON copied to the clipboard.");
    } catch {
      setStatus("Could not copy; use the download button instead.");
    }
  }

  if (!paired) {
    return (
      <main className="page-label">
        <h1>Label a capture</h1>
        <div className="notice" role="status">
          Pair this browser first. <Link href="/agent">Open setup →</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page-label">
      <h1>Label a capture</h1>
      <p className="muted">
        Maintainer tool: mark the contact frame and the four court corners so a clip becomes
        domain-valid ground truth (fixtureKind badminton_stroke). The video never leaves this PC.
      </p>

      <section className="panel">
        <h2>Capture</h2>
        <div className="form-row">
          <label htmlFor="capture-id">Capture ID</label>
          <input
            id="capture-id"
            className="d-input"
            value={captureId}
            onChange={(e) => setCaptureId(e.target.value)}
            placeholder="Capture ID from the agent run"
          />
          <button className="d-btn d-btn-primary" onClick={() => void loadPreview()}>
            Load preview
          </button>
        </div>
        <div className="form-row">
          <label htmlFor="label-fps">Frames per second (fps)</label>
          <input
            id="label-fps"
            className="d-input"
            type="number"
            min={1}
            max={120}
            value={fps}
            onChange={(e) => setFps(Math.max(1, Number(e.target.value) || 30))}
          />
        </div>
        {ticketUrl ? <video ref={videoRef} controls src={ticketUrl} className="label-video" /> : null}
      </section>

      <section className="panel">
        <h2>Contact frame</h2>
        <div className="form-row">
          <label htmlFor="label-time">Preview time (seconds)</label>
          <input
            id="label-time"
            className="d-input"
            type="number"
            min={0}
            step={0.01}
            value={timeSeconds}
            onChange={(e) => handleTimeChange(e.target.value)}
          />
        </div>
        <p className="muted">Frame {frame}</p>
        <button className="d-btn d-btn-primary" onClick={markContactFrame}>
          Mark contact frame
        </button>
        {contactFrame != null ? <p className="status" role="status">Contact frame: {contactFrame}</p> : null}
      </section>

      <section className="panel">
        <h2>Stroke and court</h2>
        <div className="form-row">
          <label htmlFor="label-stroke">Stroke</label>
          <select
            id="label-stroke"
            className="d-select"
            value={strokeId}
            onChange={(e) => setStrokeId(e.target.value)}
          >
            {techniques.map((m) => (
              <option key={m.moduleId} value={m.moduleId.replace("technique:", "")}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="label-hand">Hand</label>
          <select
            id="label-hand"
            className="d-select"
            value={hand}
            onChange={(e) => setHand(e.target.value as LabelingHand)}
          >
            <option value="forehand">Forehand</option>
            <option value="backhand">Backhand</option>
            <option value="around_head">Around the head</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
        <p className="muted">Court corners (pixel coordinates, top-left origin):</p>
        <div className="corner-grid">
          {corners.map((corner, index) => (
            <div className="form-row" key={index}>
              <label htmlFor={"corner-" + (index + 1) + "-x"}>Corner {index + 1} X</label>
              <input
                id={"corner-" + (index + 1) + "-x"}
                className="d-input"
                type="number"
                value={corner.x}
                onChange={(e) => updateCorner(index, "x", e.target.value)}
              />
              <label htmlFor={"corner-" + (index + 1) + "-y"}>Corner {index + 1} Y</label>
              <input
                id={"corner-" + (index + 1) + "-y"}
                className="d-input"
                type="number"
                value={corner.y}
                onChange={(e) => updateCorner(index, "y", e.target.value)}
              />
            </div>
          ))}
        </div>
        {cornerError ? (
          <div className="notice" role="alert">
            {cornerError}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2>Export truth</h2>
        <div className="row">
          <button className="d-btn d-btn-primary" onClick={exportTruth}>
            Download truth JSON
          </button>
          <button className="d-btn d-btn-ghost" onClick={() => void copyTruth()}>
            Copy truth JSON
          </button>
        </div>
        {status ? <p className="status" role="status">{status}</p> : null}
        <p className="muted">
          The downloaded file is your ground truth. Save it next to the clip in
          validation/domain-media/ and reference it from validation/domain-manifest.json.
        </p>
      </section>
    </main>
  );
}
