## RT-GIDS Backend (Tier-0)

Production-grade FastAPI stack powering the real-time telemetry, analytics, and ML insights required by the RT-GIDS frontend.

### Highlights
- **FastAPI + Redis**: Redis streams and pub/sub drive the LiveLog and ThreatGauge components with millisecond latency.
- **TelemetryService**: Centralised ingestion pipeline with persistence, fan-out broadcasting, and optional synthetic data generation.
- **MLService**: Loads GPU-trained artefacts (or falls back to heuristics) to provide live scoring, threat indexes, and feature attributions.
- **Security & Resilience**: CORS, trusted-host enforcement, session hardening, rate limiting (SlowAPI), and gzip compression enabled by default.
- **Docker & Compose**: One command spins up the API alongside Redis for local development or CI smoke tests.

### Project Layout
```
backend/
├── app/
│   ├── main.py                # FastAPI entry point + middleware, Redis bootstrap
│   ├── routers/
│   │   ├── logs.py            # Log ingestion, WebSocket streaming, recent history
│   │   ├── metrics.py         # System metrics, threat index, scoring endpoint
│   │   └── model.py           # Model metadata, feature importance, reload hook
│   ├── services/
│   │   ├── ml_service.py      # Model loading + inference helper
│   │   └── telemetry_service.py # Redis-backed telemetry orchestrator
│   └── utils/
│       └── file_utils.py      # Additional IO helpers (unchanged)
├── requirements.txt
├── Dockerfile
└── README.md
```

### Quick Start (Docker Compose)
```bash
docker compose up --build
```
The API is available at `http://localhost:8000` and Redis at `redis://localhost:6379`.

### Manual Setup
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
export REDIS_URL=redis://localhost:6379/0
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Core Endpoints
| Endpoint | Description |
| --- | --- |
| `GET /api/health` | Service heartbeat + Redis connectivity status. |
| `GET /api/logs/recent?limit=200` | Latest persisted telemetry events. |
| `POST /api/logs/ingest` | Ingest external IDS events (queued + broadcast). |
| `WS  /api/logs/ws` | Live log stream mirroring Redis pub/sub. |
| `GET /api/metrics/system` | CPU, memory, disk, GPU, and timestamp snapshot. |
| `GET /api/metrics/threat-index` | Derived threat score for UI gauge. |
| `GET /api/metrics/severity` | Severity distribution for dashboards. |
| `POST /api/metrics/score` | On-demand scoring for arbitrary feature vectors. |
| `GET /api/model/summary` | Current model metadata and availability. |
| `GET /api/model/feature-importance` | Ordered feature importances for visualisations. |
| `POST /api/model/reload` | Reload ML artefacts from disk. |

### Environment Variables
| Variable | Default | Purpose |
| --- | --- | --- |
| `REDIS_URL` | `redis://redis:6379/0` (Docker) | Redis connection string. |
| `TELEMETRY_SIMULATE` | `true` | Toggle synthetic telemetry generator. |
| `CORS_ALLOWED_ORIGINS` | `*` | Allowed origins for the frontend. |
| `TRUSTED_HOSTS` | `localhost,127.0.0.1,0.0.0.0` | Host header allow-list. |
| `SESSION_SECRET` | `rtgids-dev-secret` | Secret used by session middleware. |
| `RTGIDS_MODEL_PATH` | `/data/models/threat_model.joblib` | Model artefact location. |
| `RTGIDS_FEATURE_IMPORTANCE_PATH` | `/data/outputs/feature_importance.json` | Feature importance file. |

### WebSocket Client Snippet
```javascript
const socket = new WebSocket("ws://localhost:8000/api/logs/ws");
socket.onmessage = (event) => {
  const entry = JSON.parse(event.data);
  console.log("[RT-GIDS]", entry.severity, entry.message);
};
```

### Docker Images
```bash
cd backend
docker build -t rtgids-backend .
docker run --rm -p 8000:8000 --env REDIS_URL=redis://host.docker.internal:6379/0 rtgids-backend
```

### Frontend Integration Notes
- LiveLog subscribes to `/api/logs/ws` and uses `/api/logs/recent` for bootstrapping the scrollback.
- ThreatGauge polls `/api/metrics/threat-index` and `/api/metrics/severity` for trend and gauge values.
- Model Insights pulls `/api/model/summary` and `/api/model/feature-importance`, optionally triggering `/api/model/reload` after redeploys.

### Next Steps
- Wire production ingest sources into `TelemetryService.ingest`.
- Replace heuristic fallback in `MLService` with the deployed GPU model artefacts.
- Extend `/api/metrics/score` with authenticated access controls once user management lands.
