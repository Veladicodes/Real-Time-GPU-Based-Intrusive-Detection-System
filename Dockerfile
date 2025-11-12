# ======================================================
# Base Builder (shared deps)
# ======================================================
FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv python-is-python3 build-essential git curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY backend/requirements.txt .
RUN python3 -m pip install --upgrade pip setuptools wheel && \
    pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt


# ======================================================
# CPU Runtime
# ======================================================
FROM ubuntu:22.04 AS cpu-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv python-is-python3 redis-server libgomp1 git curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /wheels /wheels
RUN python3 -m pip install --no-cache-dir /wheels/* && rm -rf /wheels

COPY backend /app/backend
COPY RealTime_IDS/models /data/models

ENV REDIS_URL=redis://localhost:6379/0 \
    RTGIDS_MODELS_DIR=/data/models \
    RTGIDS_API_TOKEN=dev-token-abc \
    RTGIDS_JWT_SECRET=supersecret

EXPOSE 8000

CMD redis-server --daemonize yes && \
    echo "Redis URL: $REDIS_URL" && \
    echo "🚀 Starting RT-GIDS backend (CPU mode)" && \
    python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000


# ======================================================
# GPU Runtime
# ======================================================
FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04 AS gpu-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend \
    NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv python-is-python3 redis-server libgomp1 git curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./
RUN python3 -m pip install --upgrade pip setuptools wheel && \
    pip install torch==2.2.2+cu121 torchvision==0.17.2+cu121 torchaudio==2.2.2+cu121 \
      --extra-index-url https://download.pytorch.org/whl/cu121 && \
    pip install -r requirements.txt && \
    python3 -m pip cache purge

COPY backend /app/backend
COPY RealTime_IDS/models /data/models

ENV REDIS_URL=redis://localhost:6379/0 \
    RTGIDS_MODELS_DIR=/data/models \
    RTGIDS_API_TOKEN=dev-token-abc \
    RTGIDS_JWT_SECRET=supersecret

EXPOSE 8000

CMD redis-server --daemonize yes && \
    echo "Redis URL: $REDIS_URL" && \
    echo "🚀 Checking CUDA availability..." && \
    python3 -c "import torch; print('GPU Available:' if torch.cuda.is_available() else 'CPU Fallback')" && \
    echo "🚀 Launching RT-GIDS backend (GPU mode)" && \
    python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
