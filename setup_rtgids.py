# =========================================================
# RT-GIDS — Finalize & Execute (Paper-ready)
# This script creates/overwrites files and runs preprocessing & training
# =========================================================

# ------------------------------
# 1) Project directories
# ------------------------------
import os, textwrap, sys, json, shutil

proj_root = "D:/RealTime_IDS"

os.makedirs(proj_root, exist_ok=True)
for d in ("data","models","scripts","dashboard","outputs","paper","slides","logs"):
    os.makedirs(os.path.join(proj_root,d), exist_ok=True)

# ------------------------------
# 2) requirements.txt
# ------------------------------
req = """pandas>=2.0.0
numpy>=1.24.0
scikit-learn>=1.3.0
xgboost>=1.7.0
pyshark>=0.6.6
scapy>=2.5.0
streamlit>=1.22.0
joblib>=1.3.2
matplotlib>=3.7.0
altair>=5.0.0
folium>=0.14.0
python-pptx>=0.6.21
jinja2>=3.1.2
latexcodec>=2.0.1
"""

open(os.path.join(proj_root,"requirements.txt"),"w",encoding="utf-8").write(req)

# ------------------------------
# 3) Preprocess script (multi-file merge + cleanup + feature save)
# ------------------------------
preprocess_code = r'''
"""
preprocess_gpu.py
• Merge all CSVs in D:\Data
• Clean, encode, and save features.csv + labels.csv to D:/RealTime_IDS/data/
"""
import glob, os, pandas as pd
from pathlib import Path
from sklearn.preprocessing import LabelEncoder
import numpy as np

src = Path("D:/Data")
out_dir = Path("D:/RealTime_IDS/data")
out_dir.mkdir(parents=True, exist_ok=True)

csvs = sorted([str(p) for p in src.glob("*.csv")])
if len(csvs) == 0:
    raise SystemExit("No CSV files found in D:/Data — please place CICIDS2017 CSVs there.")

print(f"[preprocess] found {len(csvs)} files. Sample: {csvs[:3]}")

# read in chunks to avoid memory explosion if necessary (we'll try direct concat first)
dfs = []
for f in csvs:
    print("[preprocess] reading", f)
    try:
        df = pd.read_csv(f)
    except Exception as e:
        print("  failed to load", f, ":", e)
        continue
    dfs.append(df)

df = pd.concat(dfs, ignore_index=True)
print("[preprocess] combined shape:", df.shape)

# Basic cleaning
df.columns = df.columns.str.strip()
# Drop columns that are obviously non-informative if present
drop_cols = [c for c in ['Flow ID','Timestamp','Label'] if c in df.columns and c == 'Flow ID']  # keep Timestamp if useful; customized below
# Normalize label column
label_col_candidates = [c for c in df.columns if c.lower().strip() in ('label',' attack','label ')]
label_col = None
for c in df.columns:
    if c.lower().strip() == 'label':
        label_col = c
        break
if label_col is None:
    # fallback common name
    for c in df.columns:
        if 'label' in c.lower():
            label_col = c
            break
if label_col is None:
    raise SystemExit("Couldn't find label column in CSV files.")

# drop NAs & duplicate rows
df = df.dropna().drop_duplicates().reset_index(drop=True)
print("[preprocess] after dropna/dup shape:", df.shape)

# Create binary label: 0 = BENIGN/Normal, 1 = Attack (any other label)
df['__LABEL_BIN'] = df[label_col].astype(str).apply(lambda x: 0 if 'BENIGN' in x.upper() or 'NORMAL' in x.upper() else 1)

# Select numeric features only for quick first pass (safe for 2-day project). Keep a few engineered features.
num = df.select_dtypes(include=['number']).copy()
 # if there are no numeric features, try to convert
if num.shape[1] < 3:
    for c in df.columns:
        try:
            num[c] = pd.to_numeric(df[c], errors='coerce')
        except Exception:
            pass
num = num.fillna(0)

# minimal engineered features:
if 'Flow Duration' in df.columns:
    num['flow_duration_log'] = (num.get('Flow Duration',0).astype(float) + 1).apply(np.log1p)
num['pkt_len_mean'] = num.get('TotLen Fwd Pkts', 0) + num.get('TotLen Bwd Pkts', 0)
# more robust features could be added later

# final X,y
X = num
y = df['__LABEL_BIN']

# save
X.to_csv(out_dir / "features.csv", index=False)
y.to_csv(out_dir / "labels.csv", index=False)
print("[preprocess] saved features.csv and labels.csv to", out_dir)
'''

open(os.path.join(proj_root,"scripts","preprocess_gpu.py"),"w",encoding="utf-8").write(preprocess_code)

# ------------------------------
# 4) GPU-aware train script (xgboost GPU or CPU fallback)
# ------------------------------
train_code = r'''
"""
train_gpu.py
• Load features/labels from D:/RealTime_IDS/data
• Train XGBoost using GPU if available (tree_method=gpu_hist). Save metrics, plot, and model.
"""
import os, time, joblib, json
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from xgboost import XGBClassifier
import matplotlib.pyplot as plt
import numpy as np

DATA_DIR = "D:/RealTime_IDS/data"
MODEL_DIR = "D:/RealTime_IDS/models"
os.makedirs(MODEL_DIR, exist_ok=True)

X = pd.read_csv(os.path.join(DATA_DIR,"features.csv"))
y = pd.read_csv(os.path.join(DATA_DIR,"labels.csv"), squeeze=True)

# quick train/test split (stratify if possible)
try:
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
except Exception:
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

print("[train] shapes:", X_train.shape, X_test.shape)

# Detect GPU support for xgboost by attempting to use gpu_hist in tree_method
gpu_available = True
params = dict(
    n_estimators=200,
    max_depth=8,
    learning_rate=0.1,
    subsample=0.8,
    colsample_bytree=0.8,
    use_label_encoder=False,
    eval_metric='logloss'
)
try:
    print("[train] attempting to train with GPU (gpu_hist)...")
    model = XGBClassifier(**params, tree_method='gpu_hist', predictor='gpu_predictor')
    start = time.time()
    model.fit(X_train, y_train)
    elapsed = time.time() - start
    print("[train] GPU train finished in {:.2f}s".format(elapsed))
except Exception as e:
    print("[train] GPU train failed or not available:", e)
    gpu_available = False
    print("[train] falling back to CPU training (hist)...")
    model = XGBClassifier(**params, tree_method='hist', predictor='cpu_predictor')
    start = time.time()
    model.fit(X_train, y_train)
    elapsed = time.time() - start
    print("[train] CPU train finished in {:.2f}s".format(elapsed))

# Evaluate
y_pred = model.predict(X_test)
acc = accuracy_score(y_test, y_pred)
print("[train] Accuracy:", acc)
print("[train] Classification report:\n", classification_report(y_test, y_pred))

# Save model and metrics
joblib.dump(model, os.path.join(MODEL_DIR, "xgb_ids.joblib"))
with open(os.path.join(MODEL_DIR,"metrics.json"), "w") as f:
    json.dump({"accuracy": float(acc)}, f)

# Save confusion matrix plot
cm = confusion_matrix(y_test, y_pred)
plt.figure(figsize=(4,4))
plt.imshow(cm, interpolation='nearest')
plt.colorbar()
plt.title("Confusion matrix")
plt.xlabel("predicted")
plt.ylabel("true")
for (i,j), val in np.ndenumerate(cm):
    plt.text(j, i, str(val), ha='center', va='center')
plt.tight_layout()
plt.savefig("D:/RealTime_IDS/outputs/confusion_matrix.png", dpi=150)
print("[train] saved confusion matrix to outputs/confusion_matrix.png")
print("[train] model saved to models/xgb_ids.joblib")
'''

open(os.path.join(proj_root,"scripts","train_gpu.py"),"w",encoding="utf-8").write(train_code)

# ------------------------------
# 5) Real-time detection script (Windows + Linux firewall commands)
# ------------------------------
realtime_code = r'''
"""
realtime_gpu_ids.py
• Live packet capture via PyShark
• Classify each packet using trained model
• If malicious detected: add firewall rule (Windows: netsh, Linux: iptables)
• Safe mode: only prints detection if firewall commands require admin and fail.
"""
import joblib, pandas as pd, time, os, platform, subprocess
from pathlib import Path

MODEL = "D:/RealTime_IDS/models/xgb_ids.joblib"
if not Path(MODEL).exists():
    raise SystemExit("Model not found. Run train first.")

model = joblib.load(MODEL)
print("[realtime] loaded model")

import pyshark

def extract_features(pkt):
    try:
        return {
            "packet_length": int(getattr(pkt, "length", 0)),
            "protocol": hash(pkt.highest_layer) % 1000,
            "src_port": int(pkt[pkt.transport_layer].srcport) if hasattr(pkt, 'transport_layer') else 0,
            "dst_port": int(pkt[pkt.transport_layer].dstport) if hasattr(pkt, 'transport_layer') else 0,
            "ip_version": 4 if hasattr(pkt, 'ip') else 6
        }
    except Exception:
        return None

def block_ip(ip):
    system = platform.system().lower()
    print("[realtime] attempting to block", ip, "on", system)
    try:
        if 'windows' in system:
            # add firewall rule using netsh (requires admin)
            cmd = f'netsh advfirewall firewall add rule name="RTGIDS_Block_{ip}" dir=in action=block remoteip={ip}'
            subprocess.check_call(cmd, shell=True)
        else:
            # linux iptables
            cmd = f'sudo iptables -I INPUT -s {ip} -j DROP'
            subprocess.check_call(cmd, shell=True)
        return True
    except Exception as e:
        print("[realtime] blocking failed (maybe not admin):", e)
        return False

# Choose interface
INTERF = None
# Attempt to auto-detect a live interface name; user can change this variable
print("[realtime] using live capture; set INTERF variable for specific interface if needed")
capture = pyshark.LiveCapture(interface=INTERF)  # None => default

for pkt in capture.sniff_continuously():
    f = extract_features(pkt)
    if not f:
        continue
    X = pd.DataFrame([f])
    pred = model.predict(X)[0]
    ts = time.strftime("%H:%M:%S")
    if pred == 1:
        sip = getattr(pkt, "ip", None)
        src_ip = sip.src if sip is not None and hasattr(sip, "src") else "Unknown"
        print(f"{ts} ⚠️ ATTACK detected from {src_ip} | feat={f}")
        ok = block_ip(src_ip)
        if ok:
            print(f"{ts} ✅ Blocked {src_ip}")
        else:
            print(f"{ts} ⚠️ Could not block {src_ip}; logged for manual action.")
            with open("D:/RealTime_IDS/logs/detections.log","a") as lf:
                lf.write(f"{ts} BLOCK_FAILED {src_ip} {f}\n")
    else:
        print(f"{ts} ✅ Normal | feat={f}")
'''

open(os.path.join(proj_root,"scripts","realtime_gpu_ids.py"),"w",encoding="utf-8").write(realtime_code)

# ------------------------------
# 6) Streamlit dashboard (live logs + attack counts + heatmap placeholder)
# ------------------------------
dash_code = r'''
"""
dashboard_gpu.py
• Streamlit app to show latest detections, simple stats, and saved confusion matrix
"""
import streamlit as st, pandas as pd, time, os
from PIL import Image

st.set_page_config(page_title="RT-GIDS Dashboard", layout="wide")
st.title("🛡️ RT-GIDS Live Dashboard")

col1, col2 = st.columns([2,1])
with col1:
    st.header("Latest Detections (tail)")
    if os.path.exists("D:/RealTime_IDS/logs/detections.log"):
        df = pd.read_csv("D:/RealTime_IDS/logs/detections.log", sep=" ", header=None, names=["time","type","ip","rest"], engine="python", on_bad_lines="skip")
        st.dataframe(df.tail(25))
    else:
        st.info("No detection log yet. Start realtime script to populate logs.")

with col2:
    st.header("Model Metrics")
    if os.path.exists("D:/RealTime_IDS/models/metrics.json"):
        st.json(open("D:/RealTime_IDS/models/metrics.json").read())
    else:
        st.info("No metrics.json found. Run training.")

st.header("Confusion Matrix")
cm_path = "D:/RealTime_IDS/outputs/confusion_matrix.png"
if os.path.exists(cm_path):
    st.image(cm_path, caption="Confusion matrix")
else:
    st.info("confusion_matrix.png will appear here after training.")
'''

open(os.path.join(proj_root,"dashboard","dashboard_gpu.py"),"w",encoding="utf-8").write(dash_code)

# ------------------------------
# 7) Paper skeleton (LaTeX-like markdown + placeholders)
# ------------------------------
paper_md = r'''
# RT-GIDS — GPU-Accelerated Real-Time Intrusion Detection and Adaptive Defense System

## Abstract

(Write abstract here. Use accuracy, latency, and defense automation claims that your experiments support.)

## Introduction

Motivation, contributions:

1. GPU-accelerated XGBoost IDS for real-time classification.

2. Closed-loop automated response (Windows & Linux firewall integration).

3. Live visualization and reproducible artifact (code + data pointers).

## Dataset

CICIDS2017 — merged from the CSV files placed in `D:\Data\`.

## Methodology

- Preprocessing steps (numeric features, label mapping)

- Model: XGBoost (gpu_hist / hist fallback)

- Real-time capture: PyShark

- Auto-blocking: netsh / iptables

## Experiments & Results

- Report accuracy, precision, recall, F1 from `models/metrics.json`

- Show confusion matrix image `outputs/confusion_matrix.png`

- Measure detection latency: average time to classify & block (manual measurement possible)

## Deployment & Discussion

- False positives risks (auto-blocking should be cautious)

- Possible extension: federated learning, SDN integration

## Conclusion & Future Work
'''.strip()

open(os.path.join(proj_root,"paper","paper.md"),"w",encoding="utf-8").write(paper_md)

# ------------------------------
# 8) PPTX skeleton generator script (creates a simple slide deck)
# ------------------------------
ppt_script = r'''
"""
make_slides.py
Creates a simple PPTX using python-pptx with placeholders for results & images.
"""
from pptx import Presentation
from pptx.util import Inches, Pt
import os

prs = Presentation()
title = prs.slides.add_slide(prs.slide_layouts[0])
title.shapes.title.text = "RT-GIDS — GPU-Accelerated Real-Time IDS"
title.placeholders[1].text = "Author | Institution | Date"

# Add slide: Architecture
s = prs.slides.add_slide(prs.slide_layouts[1])
s.shapes.title.text = "System Architecture"
s.placeholders[1].text = "Network → Sniffer → GPU XGBoost → Auto-Firewall → Dashboard"

# Add slide: Results
s2 = prs.slides.add_slide(prs.slide_layouts[1])
s2.shapes.title.text = "Results (Placeholders)"
s2.placeholders[1].text = "Accuracy: TBD\nPrecision: TBD\nRecall: TBD\nLatency: TBD"

# Add slide: Demo screenshots
s3 = prs.slides.add_slide(prs.slide_layouts[1])
s3.shapes.title.text = "Demo / Live Dashboard"
s3.placeholders[1].text = "Insert screenshots from D:/RealTime_IDS/outputs/"

out = "D:/RealTime_IDS/slides/RTGIDS_presentation.pptx"
prs.save(out)
print("Saved PPTX to", out)
'''

open(os.path.join(proj_root,"scripts","make_slides.py"),"w",encoding="utf-8").write(ppt_script)

# ------------------------------
# 9) README QuickStart
# ------------------------------
readme = f"""
# RT-GIDS QuickStart (D:/RealTime_IDS)

Prerequisites:
- Python 3.9+
- Wireshark/tshark installed and in PATH (for pyshark)
- Optional: CUDA + GPU drivers + xgboost with GPU support

Install:
    pip install -r D:/RealTime_IDS/requirements.txt

Workflow:
1. Place CICIDS2017 CSV files in D:/Data/
2. Preprocess:
    python D:/RealTime_IDS/scripts/preprocess_gpu.py
3. Train:
    python D:/RealTime_IDS/scripts/train_gpu.py
   - model saved to D:/RealTime_IDS/models/xgb_ids.joblib
4. Realtime detection (open a terminal as Admin if you want auto-blocking):
    python D:/RealTime_IDS/scripts/realtime_gpu_ids.py
5. Dashboard:
    streamlit run D:/RealTime_IDS/dashboard/dashboard_gpu.py

Notes:
- If automatic firewall blocking is not permitted (no admin), the realtime script still logs detections to D:/RealTime_IDS/logs/detections.log
- For a paper: update paper/paper.md with metrics & screenshots from outputs/
"""

open(os.path.join(proj_root,"README.md"),"w",encoding="utf-8").write(readme)

# ------------------------------
# 10) Run preprocessing + training automatically (optional)
# We will run preprocessing and training automatically here to produce artifacts.
# WARNING: This may take significant time and memory depending on dataset size.
# If you prefer to run them manually, stop here and run the commands from README.
# ------------------------------
print("=== AUTOMATIC RUN STARTING: preprocess -> train ===")
print("Running preprocessing...")
os.system(sys.executable + " D:/RealTime_IDS/scripts/preprocess_gpu.py")
print("Running training (this will try GPU then fallback to CPU)...")
os.system(sys.executable + " D:/RealTime_IDS/scripts/train_gpu.py")
print("=== AUTOMATIC RUN FINISHED ===")
print("Artifacts (model, metrics, confusion matrix) will be in D:/RealTime_IDS/models and D:/RealTime_IDS/outputs")
print("To generate slides: python D:/RealTime_IDS/scripts/make_slides.py")
print("Open README at D:/RealTime_IDS/README.md for next steps")

