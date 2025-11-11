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
possible_paths = [Path("D:/CN/Data"), Path("D:/Data"), Path.cwd() / "Data"]
data_path = None

for p in possible_paths:
    if p.exists() and any(p.glob("*.csv")):
        data_path = p
        break

if data_path is None:
    print("❌ No CSV files found in any known data directory.")
    print("Please place your CICIDS2017 CSV files in one of these paths:")
    print(" - D:/CN/Data")
    print(" - D:/Data")
    print("Or update this script manually.")
    sys.exit(1)

print(f"📂 Using dataset directory: {data_path}")

# -------------------------------------------------------------------
# LOAD AND MERGE ALL CSV FILES
# -------------------------------------------------------------------
csv_files = glob.glob(str(data_path / "*.csv"))
print(f"📑 Found {len(csv_files)} CSV files for merging...")

dfs = []
for file in csv_files:
    try:
        print(f"➡️ Reading {os.path.basename(file)}")
        df = pd.read_csv(file)
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

out_dir = Path("D:/CN/RealTime_IDS/data")
out_dir.mkdir(parents=True, exist_ok=True)

X_path = out_dir / "features.csv"
y_path = out_dir / "labels.csv"

X.to_csv(X_path, index=False)
y.to_csv(y_path, index=False)

print(f"✅ Saved processed features to: {X_path}")
print(f"✅ Saved processed labels to: {y_path}")
print("🎯 Preprocessing complete. Ready for GPU training!")
