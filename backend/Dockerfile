FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    RTGIDS_LOG_DIR=/data/logs \
    RTGIDS_MODELS_DIR=/data/models \
    RTGIDS_OUTPUTS_DIR=/data/outputs \
    REDIS_URL=redis://redis:6379/0

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]


