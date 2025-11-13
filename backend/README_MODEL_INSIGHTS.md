# Model Insights Feature

This document captures the key endpoints, workflows, and validation steps for the RT‑GIDS
**Model Insights** capability introduced in this iteration.

## API Endpoints

All endpoints require the `Authorization: Bearer api::<token>` header. The default token is
`dev-token-abc`.

- `GET /api/model/status` – Model metadata, GPU mode, and feature list.
- `GET /api/model/feature-importance` – Ranked feature importance (raw + normalised scores).
- `GET /api/model/feature-distribution?feature=<name>&samples=<int>` – Histogram and percentiles for a feature.
- `POST /api/model/shap/explain` – Queue SHAP analysis for supplied instances (rate limited to 1 request every 10s per client).
- `GET /api/model/shap/result/{id}` – Retrieve final SHAP explanation bundle.
- `POST /api/model/summary` – Start AI pattern summary generation (rate limited to 1 request every 10s per client).
- `GET /api/model/summary/{id}` – Fetch generated summary text and supporting signals.
- `WS /ws/model/insights` – Bi-directional channel for status, SHAP progress, summaries, and heartbeats.

Redis keys:

- `model:status` – Cached model status payload.
- `model:feature_importance` – Cached feature importance response.
- `shap:job:<id>` – SHAP job metadata and final payload.
- `model:summary:<id>` – Summary job payload.
- `model:summary:last` – Most recent summary broadcast to WebSocket clients.

## Demo Scripts

Two helper scripts are available under `backend/scripts/`:

- `test_shap.py` – Triggers a SHAP job and polls for completion.
- `demo_send_events.py` – Connects to the WebSocket feed and prints streamed events.

Both scripts honour `RTGIDS_API_TOKEN`; `demo_send_events.py` additionally accepts `--url` to
point at a remote backend instance.

## Quick Verification Checklist

1. Start Redis and the FastAPI backend (`uvicorn app.main:app --reload`).
2. Run the frontend (`pnpm dev`) and open `/model-insights`.
3. Call `curl -H "Authorization: Bearer api::dev-token-abc" http://localhost:8000/api/model/feature-importance` and confirm chart updates.
4. Click **Generate AI Summary** in the UI, observe progress via WebSocket, and confirm a summary paragraph appears.
5. Use the SHAP modal on any threat row (or run `test_shap.py`) to verify explanations and per-feature contributions.

