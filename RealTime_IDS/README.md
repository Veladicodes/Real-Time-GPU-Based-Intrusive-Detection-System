# Real-Time GPU-Accelerated Intrusion Detection and Adaptive Defense System (RT-GIDS)

## 🎯 Project Overview

RT-GIDS is a comprehensive intrusion detection system that leverages GPU-accelerated machine learning for real-time network packet classification and automatic firewall defense.

## 🏗️ System Architecture

```
Network Traffic → PyShark Packet Sniffer → GPU-Optimized XGBoost Classifier →
┌─────────────┬──────────────┐
│ Normal Flow │ Attack Flow  │
└─────────────┴──────────────┘
Attack Flow → Auto-Firewall Defense (iptables) → Streamlit Live Dashboard Visualization
```

## 📁 Project Structure

```
RealTime_IDS/
├── data/              # Processed features and labels
├── models/            # Trained XGBoost models
├── scripts/           # Core processing scripts
│   ├── preprocess_gpu.py
│   ├── train_gpu.py
│   └── realtime_gpu_ids.py
├── dashboard/         # Streamlit visualization
│   └── dashboard_gpu.py
├── outputs/           # Documentation and reports
│   └── architecture_gpu.txt
├── requirements.txt   # Python dependencies
└── README.md         # This file
```

## 🚀 Quick Start

### Prerequisites

- Python 3.8+
- CUDA Toolkit (for GPU acceleration)
- CICIDS2017 dataset in `D:/Data/` directory
- Administrative privileges (for firewall control)

### Installation

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Ensure CUDA is properly configured:**
   - Install CUDA Toolkit from NVIDIA
   - Verify GPU availability with `nvidia-smi`

### Execution Guide

#### 1️⃣ Data Preprocessing

Combine and preprocess CICIDS2017 CSV files:

```bash
python D:/RealTime_IDS/scripts/preprocess_gpu.py
```

This script will:
- Merge all CSV files from `D:/Data/`
- Clean and encode categorical features
- Create binary labels (0 = Normal, 1 = Attack)
- Save processed features and labels

#### 2️⃣ GPU Model Training

Train the XGBoost model with GPU acceleration:

```bash
python D:/RealTime_IDS/scripts/train_gpu.py
```

The model will be saved to `D:/RealTime_IDS/models/xgb_gpu_ids.joblib`

#### 3️⃣ Real-Time Detection

Start real-time network monitoring and auto-defense:

```bash
python D:/RealTime_IDS/scripts/realtime_gpu_ids.py
```

**Note:** On Windows, firewall blocking uses Windows Firewall commands instead of iptables. Modify the script for Windows compatibility if needed.

#### 4️⃣ Launch Dashboard

Start the Streamlit visualization dashboard:

```bash
streamlit run D:/RealTime_IDS/dashboard/dashboard_gpu.py
```

## 🔧 Features Used

- `packet_length`: Size of network packet
- `protocol`: Network protocol identifier
- `src_port`: Source port number
- `dst_port`: Destination port number
- `ip_version`: IP version (4 or 6)

## 📊 Evaluation Metrics

- **Accuracy**: Overall classification accuracy
- **Precision/Recall/F1-score**: Per-class performance metrics
- **Detection Latency**: Real-time processing time (ms)

## ⚠️ Important Notes

### Windows Compatibility

- **Firewall Control**: The real-time detection script uses `iptables` which is Linux-specific. For Windows, you'll need to modify the firewall blocking logic to use Windows Firewall commands (`netsh advfirewall firewall`).

- **Network Interface**: The scripts use "Wi-Fi" as the default interface. Adjust this to match your system's network interface name.

- **PyShark Installation**: PyShark requires Wireshark/TShark to be installed. Download from [Wireshark.org](https://www.wireshark.org/)

### GPU Requirements

If GPU is not available, XGBoost will fall back to CPU. To force CPU-only mode, modify `train_gpu.py`:

```python
tree_method='hist',  # CPU mode
predictor='cpu_predictor',
```

## 🔒 Security Considerations

- Running real-time detection requires administrative privileges
- Firewall modifications can affect network connectivity
- Test in a controlled environment before production deployment

## 📝 License

This project is provided as-is for research and educational purposes.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

