# RT-GIDS Quick Start Guide

## 🚀 Installation Steps

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

Or run the setup check script:
```bash
python RealTime_IDS/scripts/setup_check.py
```

### 2. Install Wireshark/TShark

**Windows:**
- Download and install from https://www.wireshark.org/
- Ensure TShark is added to PATH

**Linux:**
```bash
sudo apt-get install tshark
```

### 3. Prepare Data

Place CICIDS2017 CSV files in `D:/Data/` directory.

## 📋 Execution Workflow

### Step 1: Data Preprocessing
```bash
python D:/RealTime_IDS/scripts/preprocess_gpu.py
```

**Expected Output:**
- `D:/RealTime_IDS/data/features.csv`
- `D:/RealTime_IDS/data/labels.csv`

### Step 2: Train GPU Model
```bash
python D:/RealTime_IDS/scripts/train_gpu.py
```

**Expected Output:**
- `D:/RealTime_IDS/models/xgb_gpu_ids.joblib`
- Training metrics and accuracy report

### Step 3: Real-Time Detection (Optional)
```bash
python D:/RealTime_IDS/scripts/realtime_gpu_ids.py
```

**Note:** Requires administrator privileges for firewall control.

### Step 4: Launch Dashboard
```bash
streamlit run D:/RealTime_IDS/dashboard/dashboard_gpu.py
```

Dashboard will open in your browser at `http://localhost:8501`

## ⚙️ Configuration

### GPU vs CPU Mode

If GPU is not available, modify `train_gpu.py`:

```python
tree_method='hist',      # CPU mode
predictor='cpu_predictor',
```

### Network Interface

Update interface name in scripts:
- Windows: Usually "Wi-Fi" or "Ethernet"
- Linux: Usually "eth0" or "wlan0"

Find available interfaces:
```bash
# Windows PowerShell
Get-NetAdapter | Select-Object Name, InterfaceDescription

# Linux
ip link show
```

## 🔧 Troubleshooting

### Issue: PyShark cannot find interface
**Solution:** Check interface name and ensure Wireshark/TShark is installed.

### Issue: GPU training fails
**Solution:** 
- Verify CUDA installation: `nvidia-smi`
- Fall back to CPU mode (see Configuration section)

### Issue: Firewall blocking fails (Windows)
**Solution:** Run script as Administrator

### Issue: Model file not found
**Solution:** Ensure you've completed Step 1 and Step 2 before running detection/dashboard.

## 📊 Expected Performance

- **Training Time:** 5-30 minutes (depending on dataset size and GPU)
- **Detection Latency:** < 10ms per packet (GPU mode)
- **Accuracy:** Typically 95%+ on CICIDS2017 dataset

## 🔒 Security Notes

- Real-time detection requires elevated privileges
- Firewall modifications can affect network connectivity
- Test in isolated environment before production use

