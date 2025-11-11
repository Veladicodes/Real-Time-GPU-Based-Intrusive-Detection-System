"""Machine learning service wrapper for threat scoring."""

from __future__ import annotations

import asyncio
import logging
import math
import os
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List

import joblib
import numpy as np

from app.observability import ML_LATENCY, ML_QUEUE

log = logging.getLogger("rtgids.ml")

try:  # Optional GPU / ONNX support
    import torch
except Exception:  # pragma: no cover - optional dependency
    torch = None

try:  # Optional ONNX runtime
    import onnxruntime as ort
except Exception:  # pragma: no cover - optional dependency
    ort = None


MODELS_DIR = os.getenv("RTGIDS_MODELS_DIR", "/data/models")
BATCH_MAX = int(os.getenv("RTGIDS_BATCH_MAX", "32"))
BATCH_TIMEOUT = float(os.getenv("RTGIDS_BATCH_TIMEOUT", "0.05"))
SUPPORTED_EXTENSIONS = (".pt", ".pth", ".onnx", ".joblib")


class MLService:
    def __init__(self, model_dir: str = MODELS_DIR) -> None:
        self.model_dir = model_dir
        self.model_path = os.path.join(model_dir, "model.joblib")
        self.model: Any = None
        self.model_type = "heuristic"
        self._queue: "asyncio.Queue[tuple[Dict[str, float], asyncio.Future]]" = asyncio.Queue()
        self._task: asyncio.Task | None = None
        self._executor = ThreadPoolExecutor(max_workers=4)

    def _resolve_model_path(self) -> str:
        for filename in os.listdir(self.model_dir):
            if any(filename.endswith(ext) for ext in SUPPORTED_EXTENSIONS):
                return os.path.join(self.model_dir, filename)
        return self.model_path

    def load(self) -> None:
        path = self._resolve_model_path()
        if not os.path.exists(path):
            log.warning("⚠️ No model found at %s; using heuristic fallback", path)
            self.model, self.model_type = None, "heuristic"
            self.model_path = path
            return

        ext = os.path.splitext(path)[1].lower()
        try:
            if ext in {".pt", ".pth"} and torch:
                mdl = torch.load(path, map_location="cpu")
                if isinstance(mdl, torch.nn.Module):
                    mdl.eval()
                self.model, self.model_type = mdl, "torch"
            elif ext == ".onnx" and ort:
                session = ort.InferenceSession(path, providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
                self.model, self.model_type = session, "onnx"
            else:
                mdl = joblib.load(path)
                self.model, self.model_type = mdl, "joblib"
            self.model_path = path
            log.info("✅ Loaded model (%s): %s", self.model_type, path)
        except Exception as exc:  # pragma: no cover - depends on external artefacts
            log.exception("Model load failed: %s", exc)
            self.model, self.model_type = None, "heuristic"

    def start_worker(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._batch_worker())

    async def stop_worker(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:  # pragma: no cover - cooperative cancellation
                pass
            self._task = None
        ML_QUEUE.set(self._queue.qsize())

    async def predict_async(self, features: Dict[str, float]) -> Dict[str, Any]:
        if self._task is None or self._task.done():
            self.start_worker()
        future: asyncio.Future = asyncio.get_running_loop().create_future()
        await self._queue.put((features, future))
        ML_QUEUE.set(self._queue.qsize())
        return await future

    async def _batch_worker(self) -> None:
        try:
            while True:
                features, future = await self._queue.get()
                batch = [(features, future)]
                start = time.perf_counter()

                while len(batch) < BATCH_MAX:
                    timeout = BATCH_TIMEOUT - (time.perf_counter() - start)
                    if timeout <= 0:
                        break
                    try:
                        item = await asyncio.wait_for(self._queue.get(), timeout=timeout)
                        batch.append(item)
                    except asyncio.TimeoutError:
                        break

                feature_names = sorted({key for payload, _ in batch for key in payload})
                vectors = [
                    [float(payload.get(name, 0.0)) for name in feature_names]
                    for payload, _ in batch
                ]

                ML_QUEUE.set(self._queue.qsize())

                try:
                    with ML_LATENCY.time():
                        results = await self._run_inference(vectors)
                except Exception as exc:  # pragma: no cover - inference failure path
                    log.exception("Batch inference error: %s", exc)
                    results = [{"score": 0.0, "label": "error", "error": str(exc)} for _ in batch]

                for (payload, fut), result in zip(batch, results):
                    result.setdefault("features", payload)
                    if not fut.cancelled():
                        fut.set_result(result)
                for _ in batch:
                    self._queue.task_done()
        except asyncio.CancelledError:  # pragma: no cover - worker shutdown
            pass
        finally:
            ML_QUEUE.set(self._queue.qsize())

    async def _run_inference(self, inputs: List[List[float]]) -> List[Dict[str, Any]]:
        if self.model_type == "heuristic" or self.model is None:
            outputs: List[Dict[str, Any]] = []
            for row in inputs:
                score = math.tanh(sum(row) / (len(row) + 1e-6))
                outputs.append({"score": float(score), "label": "ANOMALY" if score >= 0.5 else "NORMAL"})
            return outputs

        if self.model_type == "torch" and torch:
            tensor = torch.tensor(inputs, dtype=torch.float32)
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            tensor = tensor.to(device)
            model = self.model
            if isinstance(model, torch.nn.Module):
                model = model.to(device)
                model.eval()
            with torch.no_grad():
                output = model(tensor)
            if isinstance(output, torch.Tensor):
                output = output.cpu().numpy()
            return self._scores_from_array(output)

        if self.model_type == "onnx" and ort:
            array = np.array(inputs, dtype=np.float32)
            input_name = self.model.get_inputs()[0].name
            outputs = self.model.run(None, {input_name: array})
            return self._scores_from_array(outputs[0])

        if self.model_type == "joblib":
            loop = asyncio.get_running_loop()
            array = np.array(inputs, dtype=np.float32)
            if hasattr(self.model, "predict_proba"):
                prob = await loop.run_in_executor(self._executor, lambda: self.model.predict_proba(array))
                return self._scores_from_array(prob)
            prediction = await loop.run_in_executor(self._executor, lambda: self.model.predict(array))
            return self._scores_from_array(prediction)

        raise RuntimeError("Unsupported model backend or missing dependency")

    @staticmethod
    def _scores_from_array(array: Any) -> List[Dict[str, Any]]:
        arr = np.asarray(array)
        if arr.ndim == 0:
            arr = np.array([[arr]])
        if arr.ndim == 1:
            arr = arr.reshape(-1, 1)

        results: List[Dict[str, Any]] = []
        for row in arr:
            if row.size >= 2:
                score = float(row[1])
            else:
                score = float(row[0])
            results.append({"score": score, "label": "ANOMALY" if score >= 0.5 else "NORMAL"})
        return results

    def summary(self) -> Dict[str, Any]:
        return {
            "model": self.model_type,
            "path": self.model_path,
            "status": "ok" if self.model or self.model_type != "heuristic" else "degraded",
            "queue": self._queue.qsize(),
        }

