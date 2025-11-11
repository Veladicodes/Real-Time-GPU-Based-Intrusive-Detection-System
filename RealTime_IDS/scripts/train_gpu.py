import pandas as pd
import joblib
import numpy as np
import os, json, time
from pathlib import Path
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
import matplotlib.pyplot as plt
import seaborn as sns

# ============================================================
# 🚀 GPU–Accelerated Intrusion Detection System (Tier-0 Edition)
# ============================================================
DATA_DIR  = Path("D:/CN/RealTime_IDS/data")
MODEL_DIR = Path("D:/CN/RealTime_IDS/models")
OUT_DIR   = Path("D:/CN/RealTime_IDS/outputs")
for d in [MODEL_DIR, OUT_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# ============================================================
# 1️⃣ Load & Sanitize Data
# ============================================================
print("🚀 Loading processed data...")
X_path, y_path = DATA_DIR / "features.csv", DATA_DIR / "labels.csv"
if not X_path.exists() or not y_path.exists():
    raise FileNotFoundError("❌ Processed data not found. Run preprocess_gpu.py first!")

X = pd.read_csv(X_path)
y = pd.read_csv(y_path).squeeze()

X.replace([np.inf, -np.inf], np.nan, inplace=True)
X = X.fillna(X.mean(numeric_only=True)).fillna(0).clip(-1e9, 1e9)

print(f"📊 Data Loaded: {X.shape[0]} samples, {X.shape[1]} features")

# ============================================================
# 2️⃣ Split Dataset
# ============================================================
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
print(f"🔹 Training: {len(X_train)} | Testing: {len(X_test)}")

# ============================================================
# 3️⃣ Train Main XGBoost (Full Feature Model)
# ============================================================
params = dict(
    n_estimators=200,
    max_depth=8,
    learning_rate=0.1,
    subsample=0.8,
    colsample_bytree=0.8,
    eval_metric="logloss"
)
print("\n⚡ Training full XGBoost model (CUDA if available)...")
start = time.time()
try:
    model = XGBClassifier(**params, tree_method="hist", device="cuda")
    model.fit(X_train, y_train)
    gpu_mode = True
except Exception as e:
    print("⚠️ GPU not available – training on CPU:", e)
    model = XGBClassifier(**params, tree_method="hist", device="cpu")
    model.fit(X_train, y_train)
    gpu_mode = False
end = time.time()

# ============================================================
# 4️⃣ Evaluate Full Model
# ============================================================
y_pred = model.predict(X_test)
acc = accuracy_score(y_test, y_pred)
print(f"\n✅ Training Done in {end - start:.2f}s | GPU Mode: {gpu_mode}")
print(f"🎯 Accuracy: {acc:.4f}\n")
print(classification_report(y_test, y_pred))

# Confusion matrix plot
cm = confusion_matrix(y_test, y_pred)
plt.figure(figsize=(6, 5))
sns.heatmap(cm, annot=True, fmt="d", cmap="Blues",
            xticklabels=["Benign", "Attack"],
            yticklabels=["Benign", "Attack"])
plt.title("Confusion Matrix - Full IDS Model")
plt.xlabel("Predicted"); plt.ylabel("True")
plt.tight_layout()
plt.savefig(OUT_DIR / "confusion_matrix_full.png")
plt.close()

# Feature importance
fi = pd.Series(model.feature_importances_, index=X.columns).sort_values(ascending=False)
fi.to_csv(OUT_DIR / "feature_importance_full.csv", header=["importance"])

# ============================================================
# 5️⃣ Train Lightweight Real-Time Model (5 features)
# ============================================================
realtime_feats = ["packet_length", "protocol", "src_port", "dst_port", "ip_version"]
available = [f for f in realtime_feats if f in X.columns]

if len(available) < 5:
    print("⚙️ Synthesizing simplified features for real-time model...")
    X_simple = pd.DataFrame({
        "packet_length": X["Packet Length Mean"] if "Packet Length Mean" in X else X.iloc[:, 0],
        "protocol": 0,
        "src_port": X["Destination Port"] if "Destination Port" in X else 0,
        "dst_port": X["Destination Port"] if "Destination Port" in X else 0,
        "ip_version": 4
    })
else:
    X_simple = X[realtime_feats]

X_train_s, X_test_s, y_train_s, y_test_s = train_test_split(
    X_simple, y, test_size=0.2, random_state=42, stratify=y
)

print("\n⚡ Training lightweight real-time model...")
start2 = time.time()
realtime_model = XGBClassifier(
    n_estimators=150, max_depth=6, learning_rate=0.1,
    tree_method="hist", device="cuda" if gpu_mode else "cpu", eval_metric="logloss"
)
realtime_model.fit(X_train_s, y_train_s)
end2 = time.time()
y_pred_s = realtime_model.predict(X_test_s)
acc_s = accuracy_score(y_test_s, y_pred_s)
print(f"✅ Real-time model accuracy: {acc_s:.4f} (trained in {end2-start2:.2f}s)")

# ============================================================
# 6️⃣ Save All Artifacts
# ============================================================
main_model_path = MODEL_DIR / "xgb_gpu_ids.joblib"
rt_model_path   = MODEL_DIR / "xgb_realtime_ids.joblib"
metrics_path    = MODEL_DIR / "metrics.json"

joblib.dump(model, main_model_path)
joblib.dump(realtime_model, rt_model_path)

metrics = {
    "full_model": {
        "accuracy": float(acc),
        "train_time_sec": round(end - start, 2),
        "gpu_mode": gpu_mode,
        "features": list(X.columns)
    },
    "realtime_model": {
        "accuracy": float(acc_s),
        "train_time_sec": round(end2 - start2, 2),
        "features": realtime_feats
    }
}
with open(metrics_path, "w") as f:
    json.dump(metrics, f, indent=4)

print(f"\n💾 Full model:      {main_model_path}")
print(f"💾 Real-time model: {rt_model_path}")
print(f"📊 Metrics saved:   {metrics_path}")
print(f"🖼️  Confusion matrix: {OUT_DIR / 'confusion_matrix_full.png'}")
print(f"📈 Feature importances: {OUT_DIR / 'feature_importance_full.csv'}")
print("\n🏁 Tier-0 GPU Training Pipeline Completed Successfully.")
