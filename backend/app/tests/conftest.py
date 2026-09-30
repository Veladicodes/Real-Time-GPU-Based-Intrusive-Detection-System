"""Shared pytest configuration for the backend test suite.

Sets RTGIDS_MODELS_DIR to the real model artifacts shipped in RealTime_IDS/models
before any test module imports app.main (which loads a model at import time),
so the suite is runnable out of the box without manual environment setup.
"""

from __future__ import annotations

import os
from pathlib import Path

_DEFAULT_MODELS_DIR = (Path(__file__).resolve().parents[3] / "RealTime_IDS" / "models")

os.environ.setdefault("RTGIDS_MODELS_DIR", str(_DEFAULT_MODELS_DIR))
