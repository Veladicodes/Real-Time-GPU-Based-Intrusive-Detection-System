"""Model service for AI-based threat inference (XGBoost GPU/CPU)."""

import joblib
import numpy as np
from pathlib import Path
from xgboost import XGBClassifier

class ModelService:
    def __init__(self, model_dir: str):
        self.model_dir = Path(model_dir)
        self.model_path = self.model_dir / "xgb_realtime_ids.joblib"
        self.metrics_path = self.model_dir / "metrics.json"
        self.model = None
        self.feature_names = []
        self.gpu_mode = False

    def load(self):
        if not self.model_path.exists():
            raise FileNotFoundError(f"Model not found: {self.model_path}")
        self.model: XGBClassifier = joblib.load(self.model_path)
        self.feature_names = getattr(self.model, "feature_names_in_", [])
        print(f"✅ Loaded model: {self.model_path.name} ({len(self.feature_names)} features)")
        return self

    def predict(self, payload: dict):
        if self.model is None:
            raise RuntimeError("Model not loaded")

        # Extract expected features
        features = [payload.get(f, 0) for f in self.feature_names]
        x = np.array(features).reshape(1, -1)
        y_pred = self.model.predict(x)[0]
        y_prob = float(self.model.predict_proba(x)[0, 1])

        return {
            "prediction": int(y_pred),
            "probability": round(y_prob, 4),
            "severity": "high" if y_prob > 0.7 else "medium" if y_prob > 0.4 else "low"
        }

    def info(self):
        return {
            "model_path": str(self.model_path),
            "features": self.feature_names,
            "gpu_mode": self.gpu_mode,
        }
