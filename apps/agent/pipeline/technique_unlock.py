"""
Per-stroke Technique Lab unlock helpers.
Benchmark reports in validation/reports gate locked → on.
"""

from __future__ import annotations

TECHNIQUE_STROKES = [
    "serve",
    "forehand",
    "backhand",
    "smash",
    "clear",
    "drop",
    "drive",
    "net_shot",
    "lift",
    "block",
    "defensive_return",
    "jump_smash",
]

# Engineering unlock order (internal dependency preference — not a public thin slice)
UNLOCK_ORDER = [
    "clear",
    "drive",
    "drop",
    "lift",
    "smash",
    "forehand",
    "backhand",
    "serve",
    "net_shot",
    "block",
    "defensive_return",
    "jump_smash",
]


def technique_module_id(stroke: str) -> str:
    return f"technique:{stroke}"


def footwork_layer_module_id(stroke: str) -> str:
    return f"footwork:layer:{stroke}"


def all_technique_modules() -> list[str]:
    return [technique_module_id(s) for s in TECHNIQUE_STROKES]


def all_footwork_layer_modules() -> list[str]:
    return [footwork_layer_module_id(s) for s in TECHNIQUE_STROKES]
