import pandas as pd
import glob
from sklearn.preprocessing import LabelEncoder
from pathlib import Path
import os
import sys
import numpy as np

# -------------------------------------------------------------------
# AUTO-DETECT DATA PATH
# -------------------------------------------------------------------
REPO_ROOT = Path(__file__).resolve().parents[2]

possible_paths = [
    Path(os.environ["RTGIDS_DATASET_DIR"]) if os.environ.get("RTGIDS_DATASET_DIR") else None,
    REPO_ROOT / "Data",
    Path("D:/CN/Data"),
    Path("D:/Data"),
    Path.cwd() / "Data",
]
possible_paths = [p for p in possible_paths if p is not None]
data_path = None

for p in possible_paths:
    if p.exists() and any(p.glob("*.csv")):
        data_path = p
        break

if data_path is None:
    print("❌ No CSV files found in any known data directory.")
    print("Please place your CICIDS2017 CSV files in one of these paths,")
    print("or set RTGIDS_DATASET_DIR:")
    for p in possible_paths:
        print(f" - {p}")
    sys.exit(1)

print(f"📂 Using dataset directory: {data_path}")

# -------------------------------------------------------------------
# LOAD AND MERGE ALL CSV FILES
#
# SAMPLE_FRAC bounds memory use on constrained machines: each file is
# downsampled by a uniform random sample (preserving its original class
# ratio in expectation) before concatenation, and numeric columns are
# downcast to float32 immediately after load. Set RTGIDS_SAMPLE_FRAC=1.0
# to use the full dataset on a machine with enough RAM. This is disclosed
# in the printed output and recorded in the resulting metrics.json.
# -------------------------------------------------------------------
SAMPLE_FRAC = float(os.environ.get("RTGIDS_SAMPLE_FRAC", "0.2"))

csv_files = glob.glob(str(data_path / "*.csv"))
print(f"📑 Found {len(csv_files)} CSV files for merging (sample_frac={SAMPLE_FRAC})...")

dfs = []
for file in csv_files:
    try:
        print(f"➡️ Reading {os.path.basename(file)}")
        df = pd.read_csv(file)
        if SAMPLE_FRAC < 1.0:
            df = df.sample(frac=SAMPLE_FRAC, random_state=42)
        float_cols = df.select_dtypes(include=["float64"]).columns
        df[float_cols] = df[float_cols].astype("float32")
        dfs.append(df)
    except Exception as e:
        print(f"⚠️ Skipping {file} due to error: {e}")

if not dfs:
    print("❌ No valid CSV files could be loaded.")
    sys.exit(1)

df = pd.concat(dfs, axis=0, ignore_index=True)
print(f"✅ Combined dataset shape: {df.shape}")

# -------------------------------------------------------------------
# CLEAN & ENCODE DATA
# -------------------------------------------------------------------
print("🧹 Cleaning and encoding data...")
df = df.drop_duplicates()
df.columns = df.columns.str.strip()

# Detect label column
label_col = None
for c in df.columns:
    if "label" in c.lower():
        label_col = c
        break

if not label_col:
    print("❌ Could not find a 'Label' column in the dataset.")
    sys.exit(1)

# Handle NaN and Infinity early
df.replace([np.inf, -np.inf], np.nan, inplace=True)
df.fillna(0, inplace=True)

# Encode non-label object columns
label_enc = LabelEncoder()
for col in df.select_dtypes(include=['object']).columns:
    if col != label_col:
        try:
            df[col] = label_enc.fit_transform(df[col].astype(str))
        except Exception as e:
            print(f"⚠️ Encoding skipped for {col}: {e}")

# Binary mapping: 1 = Attack, 0 = Benign
df[label_col] = df[label_col].apply(lambda x: 0 if 'BENIGN' in str(x).upper() else 1)
df.rename(columns={label_col: "Label"}, inplace=True)

# -------------------------------------------------------------------
# SANITIZE NUMERIC FEATURES
# -------------------------------------------------------------------
# Replace invalid or extreme values with safe limits for GPU
numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
df[numeric_cols] = df[numeric_cols].replace([np.inf, -np.inf], np.nan)
df[numeric_cols] = df[numeric_cols].fillna(df[numeric_cols].mean(numeric_only=True)).fillna(0)
df[numeric_cols] = df[numeric_cols].clip(-1e9, 1e9)

print("🧩 Numeric cleaning complete: no inf/NaN or overflow values remain.")

# -------------------------------------------------------------------
# SPLIT AND SAVE OUTPUT
# -------------------------------------------------------------------
X = df.drop('Label', axis=1)
y = df['Label']

out_dir = REPO_ROOT / "RealTime_IDS" / "data"
out_dir.mkdir(parents=True, exist_ok=True)

X_path = out_dir / "features.csv"
y_path = out_dir / "labels.csv"

X.to_csv(X_path, index=False)
y.to_csv(y_path, index=False)

print(f"✅ Saved processed features to: {X_path}")
print(f"✅ Saved processed labels to: {y_path}")
print("🎯 Preprocessing complete. Ready for GPU training!")
