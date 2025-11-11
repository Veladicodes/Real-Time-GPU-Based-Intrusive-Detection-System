# ======================================================
# Stage 1 — Dependency Builder (shared for CPU + GPU)
# ======================================================
FROM ubuntu:22.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# --- Core system setup ---
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv python-is-python3 build-essential git curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build

# --- Copy and prebuild dependencies ---
COPY backend/requirements.txt .
RUN python3 -m pip install --upgrade pip setuptools wheel && \
    pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt


# ======================================================
# Stage 2 — CPU Runtime (fallback)
# ======================================================
FROM ubuntu:22.04 AS cpu-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv python-is-python3 redis-server libgomp1 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Install prebuilt wheels from builder stage ---
COPY --from=builder /wheels /wheels
RUN python3 -m pip install --no-cache-dir /wheels/* && rm -rf /wheels

# --- Copy backend code and model assets ---
COPY backend /app
COPY RealTime_IDS/models /data/models

# --- Runtime environment ---
ENV REDIS_URL=redis://localhost:6379/0 \
    RTGIDS_MODELS_DIR=/data/models \
    RTGIDS_API_TOKEN=changeme \
    RTGIDS_JWT_SECRET=changeme

EXPOSE 8000

# --- Launch FastAPI with embedded Redis ---
CMD ["bash", "-c", "redis-server --daemonize yes && \
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000"]


# ======================================================
# Stage 3 — GPU Runtime (PyTorch + CUDA)
# ======================================================
FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04 AS gpu-runtime


ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TORCH_CUDA_ARCH_LIST="8.6" \
    NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility

# --- Base system setup ---
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip python3-venv python-is-python3 redis-server libgomp1 git curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Copy backend requirements ---
COPY backend/requirements.txt .

# --- Install dependencies in correct order ---
RUN python3 -m pip install --upgrade pip setuptools wheel && \
    # GPU-enabled PyTorch (CUDA 12.1 build works with 12.2 runtime)
    pip install torch==2.2.2+cu121 torchvision==0.17.2+cu121 torchaudio==2.2.2+cu121 \
        --extra-index-url https://download.pytorch.org/whl/cu121 && \
    # Install remaining backend dependencies
    pip install -r requirements.txt && \
    # GPU-aware XGBoost
    pip install xgboost==2.1.0 && \
    # Cleanup to reduce image size
    apt-get clean && rm -rf /var/lib/apt/lists/*

# --- Copy backend code and models ---
COPY backend /app
COPY RealTime_IDS/models /data/models

# --- GPU diagnostic helper ---
RUN printf "import torch, json\nprint(json.dumps({\
'gpu_available': torch.cuda.is_available(),\
'device': torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'\
}))\n" > /app/gpu_check.py

# --- Environment variables ---
ENV REDIS_URL=redis://localhost:6379/0 \
    RTGIDS_MODELS_DIR=/data/models \
    RTGIDS_API_TOKEN=changeme \
    RTGIDS_JWT_SECRET=changeme

EXPOSE 8000

# --- Runtime startup ---
CMD ["bash", "-c", "redis-server --daemonize yes && \
echo '🚀 Checking GPU availability...' && python3 gpu_check.py && \
echo '🚀 Starting RT-GIDS FastAPI backend (GPU mode)...' && \
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000"]
