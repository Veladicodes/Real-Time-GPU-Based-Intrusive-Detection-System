# 🛡️ RT-GIDS: Real-Time GPU-Accelerated Intrusion Detection System

<div align="center">

![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-14.2-black.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-green.svg)
![XGBoost](https://img.shields.io/badge/XGBoost-2.1.0-orange.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

**A production-ready, real-time network intrusion detection system powered by XGBoost machine learning, featuring a modern Next.js dashboard and comprehensive threat analytics.**

[Features](#-features) • [Quick Start](#-quick-start) • [Architecture](#-architecture) • [Documentation](#-documentation) • [Contributing](#-contributing)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Project Structure](#-project-structure)
- [Machine Learning Models](#-machine-learning-models)
- [API Documentation](#-api-documentation)
- [Frontend Dashboard](#-frontend-dashboard)
- [Configuration](#-configuration)
- [Usage Examples](#-usage-examples)
- [Development](#-development)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Overview

**RT-GIDS** (Real-Time GPU-Accelerated Intrusion Detection System) is an advanced network security monitoring platform that combines machine learning-based threat detection with real-time visualization and analytics. The system processes network traffic in real-time, identifies malicious patterns using XGBoost classifiers, and provides comprehensive threat intelligence through an intuitive web dashboard.

### Key Highlights

- **Real-Time Detection**: Sub-second threat identification with WebSocket streaming
- **Dual ML Models**: Full-feature and lightweight realtime models for different use cases
- **Modern Dashboard**: Next.js 14 with Three.js 3D visualizations and real-time charts
- **Production Ready**: CPU-only mode with in-memory state management (no Docker/GPU required)
- **Comprehensive Analytics**: Threat trends, attack frequency, top attackers, and incident overview
- **AI-Powered Narratives**: GPT-4o-mini integration for intelligent threat summaries
- **SHAP Explainability**: Model interpretability for security analysts

---

## ✨ Features

### 🔍 Threat Detection
- **Real-time packet analysis** with XGBoost-based classification
- **Multi-attack type detection**: Port scans, brute force, SQL injection, DDoS, malware C2 traffic
- **Confidence scoring** with severity classification (Low/Medium/High/Critical)
- **Automated threat blocking** and IP tracking
- **Anomaly detection** with statistical analysis

### 📊 Analytics & Visualization
- **Live threat radar** with 3D globe visualization
- **Attack frequency charts** with time-series trends
- **Top attackers** geolocation mapping
- **Incident overview** with critical event tracking
- **System diagnostics** with health monitoring
- **Model insights** with SHAP feature importance

### 🎨 Modern UI/UX
- **Dark/Light theme** support
- **Responsive design** with mobile compatibility
- **Real-time WebSocket** updates
- **Audio notifications** for critical threats
- **Smooth animations** with Framer Motion
- **Accessibility** features (reduced motion, low performance mode)

### 🔧 Developer Experience
- **Local simulation mode** (no external dependencies)
- **Hot reload** for both frontend and backend
- **TypeScript** for type safety
- **Comprehensive API** with OpenAPI documentation
- **Attack seeder** for testing and demos

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         RT-GIDS Architecture                      │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Frontend   │◄───────►│   Backend    │◄───────►│  ML Models   │
│  (Next.js)   │  HTTP   │  (FastAPI)   │  Load   │  (XGBoost)   │
│              │  + WS   │              │         │              │
└──────────────┘         └──────────────┘         └──────────────┘
      │                         │                         │
      │                         │                         │
      ▼                         ▼                         ▼
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Dashboard  │         │  Telemetry   │         │  Threat      │
│  Components  │         │   Service    │         │  Metrics     │
└──────────────┘         └──────────────┘         └──────────────┘
      │                         │                         │
      │                         │                         │
      └─────────────────────────┴─────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  FakeRedis       │
                    │  (In-Memory)     │
                    │  or Real Redis   │
                    └─────────────────┘
```

### Component Flow

1. **Data Ingestion**: Network events posted to `/ingest` endpoint
2. **ML Inference**: XGBoost models classify threats in real-time
3. **Telemetry Processing**: Events aggregated and normalized
4. **WebSocket Streaming**: Real-time updates pushed to frontend
5. **Dashboard Rendering**: React components visualize threats
6. **Analytics**: Historical trends and patterns analyzed

---

## 🛠️ Tech Stack

### Backend
- **FastAPI** 0.109+ - Modern async Python web framework
- **XGBoost** 2.1.0 - Gradient boosting for threat classification
- **Pandas** 2.1+ - Data manipulation and preprocessing
- **NumPy** 1.26+ - Numerical computations
- **SHAP** 0.41+ - Model explainability
- **OpenAI** 1.12+ - AI-powered threat narratives
- **Uvicorn** - ASGI server with WebSocket support
- **Prometheus Client** - Metrics collection

### Frontend
- **Next.js** 14.2 - React framework with App Router
- **TypeScript** 5.0 - Type-safe development
- **React** 19 - UI library
- **Three.js** 0.169 - 3D visualizations (Threat Globe)
- **Recharts** 2.15 - Data visualization
- **Framer Motion** 11 - Animations
- **Tailwind CSS** 3.4 - Utility-first styling
- **Radix UI** - Accessible component primitives
- **Axios** 1.7 - HTTP client
- **Zustand/SWR** - State management and data fetching

### ML & Data Science
- **XGBoost** - Primary ML framework
- **scikit-learn** - Model evaluation and preprocessing
- **SHAP** - Feature importance and explainability
- **Matplotlib/Seaborn** - Visualization

### Development Tools
- **ESLint** - Code linting
- **Playwright** - E2E testing
- **Lighthouse** - Performance auditing
- **Stylelint** - CSS linting

---

## 📦 Prerequisites

- **Python** 3.10 or higher
- **Node.js** 18+ and `npm` or `pnpm`
- **Git** for cloning the repository
- **Optional**: `OPENAI_API_KEY` for AI narrative summaries

### System Requirements
- **OS**: Windows 10+, Linux, or macOS
- **RAM**: 4GB minimum (8GB recommended)
- **Storage**: 2GB free space
- **Network**: Local network access for testing

---

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/rt-gids.git
cd rt-gids
```

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install
# or
pnpm install
```

### 4. ML Models (Optional)

If you want to train your own models:

```bash
# Navigate to ML training directory
cd RealTime_IDS/scripts

# Preprocess CICIDS2017 dataset
python preprocess_gpu.py

# Train models
python train_gpu.py
```

Pre-trained models are included in `RealTime_IDS/models/`.

---

## ⚡ Quick Start

### Option 1: Unified Launcher (Recommended)

```bash
# From project root
python run.py
```

This starts both backend (port 8000) and frontend (port 3000) automatically.

### Option 2: Manual Start

#### Start Backend

```bash
cd backend
.venv\Scripts\activate  # Windows
# or
source .venv/bin/activate  # Linux/macOS

set SIM_MODE=true  # Windows
# or
export SIM_MODE=true  # Linux/macOS

uvicorn backend.app.main:app --reload --port 8000
```

#### Start Frontend

```bash
cd frontend
npm run dev
# or
pnpm dev
```

#### Seed Attack Data (Optional)

```bash
# From project root
python attack_seeder.py --count 200
```

### Access the Dashboard

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/api/health

---

## 📁 Project Structure

```
rt-gids/
├── backend/                    # FastAPI backend
│   ├── app/
│   │   ├── main.py            # Application entry point
│   │   ├── routers/           # API route handlers
│   │   │   ├── analytics.py   # Analytics endpoints
│   │   │   ├── logs.py         # Log streaming
│   │   │   ├── metrics.py      # System metrics
│   │   │   ├── threats.py      # Threat detection
│   │   │   └── ...
│   │   ├── services/          # Business logic
│   │   │   ├── ml_service.py   # ML inference
│   │   │   ├── telemetry_service.py  # Telemetry
│   │   │   ├── model_service.py      # Model management
│   │   │   └── ...
│   │   ├── utils/             # Utilities
│   │   │   ├── local_runtime.py  # FakeRedis, SIM_MODE
│   │   │   └── model_loader.py   # Model loading
│   │   └── schemas/           # Pydantic models
│   ├── requirements.txt       # Python dependencies
│   └── models/                # ML model storage
│
├── frontend/                   # Next.js frontend
│   ├── app/                   # Next.js App Router
│   │   ├── page.tsx           # Home page
│   │   ├── command-center/    # Main dashboard
│   │   ├── threat-analytics/  # Threat analytics page
│   │   └── ...
│   ├── components/             # React components
│   │   ├── command-center/    # Dashboard components
│   │   ├── threat/            # Threat visualization
│   │   ├── system/            # System diagnostics
│   │   └── ui/                # UI primitives
│   ├── hooks/                 # React hooks
│   │   ├── useThreatTelemetry.ts  # Telemetry hook
│   │   ├── useThreatAnalytics.ts  # Analytics hook
│   │   └── ...
│   ├── lib/                   # Utilities
│   │   └── api.ts             # API client
│   └── package.json           # Node dependencies
│
├── RealTime_IDS/              # ML training pipeline
│   ├── scripts/
│   │   ├── preprocess_gpu.py  # Data preprocessing
│   │   └── train_gpu.py       # Model training
│   ├── models/                # Trained models
│   │   ├── xgb_gpu_ids.json   # Full model
│   │   └── xgb_realtime_ids.json  # Realtime model
│   └── data/                  # Processed datasets
│
├── attack_seeder.py           # Synthetic attack generator
├── run.py                     # Unified launcher
└── README.md                  # This file
```

---

## 🤖 Machine Learning Models

### Model Architecture

RT-GIDS uses **XGBoost Gradient Boosting** classifiers for threat detection:

#### 1. Full IDS Model (`xgb_gpu_ids.json`)
- **Purpose**: Comprehensive threat detection with all features
- **Features**: All CICIDS2017 dataset features
- **Accuracy**: ~99.92%
- **Training Time**: ~25 seconds
- **Use Case**: Deep analysis, high accuracy requirements

#### 2. Realtime Model (`xgb_realtime_ids.json`)
- **Purpose**: Fast real-time packet classification
- **Features**: 5 lightweight features
  - `packet_length`
  - `protocol`
  - `src_port`
  - `dst_port`
  - `ip_version`
- **Accuracy**: ~96.92% (per `RealTime_IDS/models/metrics.json`)
- **Training Time**: ~6 seconds
- **Use Case**: Live network monitoring, low latency

### Training Pipeline

#### Step 1: Data Preprocessing

```bash
cd RealTime_IDS/scripts
python preprocess_gpu.py
```

**Process**:
1. Load CICIDS2017 CSV files
2. Clean and encode categorical features
3. Handle missing values and outliers
4. Create binary labels (Benign=0, Attack=1)
5. Output: `features.csv` and `labels.csv`

#### Step 2: Model Training

```bash
python train_gpu.py
```

**Process**:
1. Load preprocessed data
2. Train/test split (80/20, stratified)
3. Train full model with all features
4. Extract realtime features (5 features)
5. Train lightweight realtime model
6. Evaluate and save models
7. Generate metrics and visualizations

**Output Files**:
- `xgb_gpu_ids.json` - Full model
- `xgb_realtime_ids.json` - Realtime model
- `metrics.json` - Training metrics
- `confusion_matrix_full.png` - Confusion matrix
- `feature_importance_full.csv` - Feature rankings

### Model Hyperparameters

**Full Model**:
```python
n_estimators=200
max_depth=8
learning_rate=0.1
subsample=0.8
colsample_bytree=0.8
tree_method="hist"  # CPU mode
```

**Realtime Model**:
```python
n_estimators=150
max_depth=6
learning_rate=0.1
tree_method="hist"
```

### Model Deployment

Models are automatically loaded by:
- **ModelService**: Loads `xgb_realtime_ids.json` for real-time inference
- **MLService**: Loads realtime model (preferred) or full model (fallback)

Models support:
- **Batch inference** for performance
- **SHAP explainability** for feature importance
- **Confidence scoring** for threat severity

---

## 📡 API Documentation

### Base URL
```
http://localhost:8000
```

### Key Endpoints

#### Threat Detection
- `POST /ingest` - Ingest network events
- `GET /api/threats/stats` - Get threat statistics
- `GET /api/threats/recent?n=100` - Get recent threats
- `WebSocket /ws/logs?token=api::dev-token-abc` - Real-time log stream

#### Analytics
- `GET /api/analytics/incidents-overview` - Incident summary
- `GET /api/analytics/top-attackers?limit=5` - Top attacker IPs
- `GET /api/analytics/trends` - Attack trends (15 minutes)
- `GET /api/analytics/attack-frequency?window=5m` - Attack frequency

#### Metrics
- `GET /api/metrics/system` - System metrics
- `GET /api/metrics/threat` - Threat metrics
- `GET /api/metrics/anomalies` - Anomaly detection

#### Model Insights
- `GET /api/model/info` - Model information
- `POST /api/model/reload` - Reload ML model
- `GET /api/shap/explain` - SHAP feature importance

#### Health & Diagnostics
- `GET /api/health` - Health check
- `GET /api/health/scan` - System diagnostics
- `WebSocket /ws/telemetry` - Real-time telemetry stream

### Interactive API Docs

Visit http://localhost:8000/docs for Swagger UI with:
- Endpoint documentation
- Request/response schemas
- Try-it-out functionality

---

## 🎨 Frontend Dashboard

### Pages

#### 1. Command Center (`/command-center`)
- **Incident Overview**: Total attacks, notifications, critical events
- **Top Attackers**: IP addresses with attack counts and geolocation
- **Attack Frequency Chart**: Time-series visualization
- **AI Core Status**: Model information and reload capability
- **System Summary**: Real-time metrics bar

#### 2. Threat Analytics (`/threat-analytics`)
- **Threat Radar**: 3D radar visualization with attack points
- **Threat Globe**: Interactive 3D globe with attacker locations
- **Threat Table**: Detailed event log with filtering
- **Timeline**: Attack timeline visualization

#### 3. System Diagnostics (`/system-diagnostics`)
- **System Health**: CPU, memory, disk usage
- **Network Stats**: Packet counts, throughput
- **Model Status**: ML model information
- **Service Status**: Backend service health

#### 4. Model Insights (`/model-insights`)
- **Feature Importance**: SHAP-based feature rankings
- **Model Metrics**: Accuracy, precision, recall
- **Prediction Examples**: Sample predictions with explanations

### Key Features

- **Real-time Updates**: WebSocket streaming for live data
- **Responsive Design**: Mobile and desktop support
- **Dark/Light Theme**: System preference detection
- **Audio Notifications**: Sound alerts for critical threats
- **Performance Controls**: Reduced motion, low performance mode
- **Accessibility**: WCAG-compliant components

---

## ⚙️ Configuration

### Environment Variables

#### Backend

```bash
# Simulation mode (default: true)
SIM_MODE=true

# Model directory
RTGIDS_MODELS_DIR=D:/CN/RealTime_IDS/models

# OpenAI API (optional)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Batch processing
RTGIDS_BATCH_MAX=32
RTGIDS_BATCH_TIMEOUT=0.05
```

#### Frontend

```bash
# Backend URL (optional, defaults to http://127.0.0.1:8000)
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
```

### SIM_MODE Explained

When `SIM_MODE=true` (default):
- Uses `FakeRedis` (in-memory state)
- No external Redis required
- CPU-only ML inference
- Tokenless WebSocket connections
- Perfect for local development

When `SIM_MODE=false`:
- Requires real Redis instance
- GPU inference if available
- Token-based WebSocket auth
- Production-ready mode

---

## 💡 Usage Examples

### Ingest Network Event

```bash
curl -X POST http://localhost:8000/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2024-01-15T10:30:00Z",
    "src_ip": "192.168.1.100",
    "dst_ip": "192.168.1.5",
    "dst_port": 80,
    "proto": "TCP",
    "bytes_in": 1024,
    "bytes_out": 2048,
    "is_attack": true,
    "label": "Port Scan"
  }'
```

### Get Threat Statistics

```bash
curl http://localhost:8000/api/threats/stats
```

### Get Top Attackers

```bash
curl http://localhost:8000/api/analytics/top-attackers?limit=10
```

### WebSocket Connection (JavaScript)

```javascript
const ws = new WebSocket('ws://127.0.0.1:8000/ws/logs?token=api::dev-token-abc');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Threat detected:', data);
};
```

### Python Client Example

```python
import requests

# Ingest event
response = requests.post(
    'http://localhost:8000/ingest',
    json={
        'src_ip': '10.0.0.1',
        'dst_ip': '192.168.1.1',
        'dst_port': 443,
        'proto': 'TCP',
        'is_attack': True
    }
)

# Get analytics
stats = requests.get('http://localhost:8000/api/analytics/incidents-overview').json()
print(f"Total attacks: {stats['total_attacks']}")
```

---

## 🔧 Development

### Running in Development Mode

```bash
# Backend with hot reload
cd backend
uvicorn backend.app.main:app --reload --port 8000

# Frontend with hot reload
cd frontend
npm run dev
```

### Running Tests

```bash
# Backend tests
cd backend
pytest

# Frontend tests
cd frontend
npm run test

# E2E tests
npm run verify:tier0
```

### Code Quality

```bash
# Lint frontend
cd frontend
npm run lint

# Format Python (using black)
cd backend
black app/

# Type check
cd frontend
npm run type-check
```

### Building for Production

```bash
# Build frontend
cd frontend
npm run build

# Start production server
npm run start
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** and add tests
4. **Commit with clear messages**: `git commit -m 'Add amazing feature'`
5. **Push to your branch**: `git push origin feature/amazing-feature`
6. **Open a Pull Request**

### Contribution Guidelines

- Follow existing code style and conventions
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass
- Write clear commit messages

### Areas for Contribution

- 🐛 Bug fixes
- ✨ New features
- 📚 Documentation improvements
- 🎨 UI/UX enhancements
- 🚀 Performance optimizations
- 🧪 Test coverage
- 🌐 Internationalization

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **CICIDS2017 Dataset** - For training data
- **XGBoost** - Machine learning framework
- **FastAPI** - Modern Python web framework
- **Next.js** - React framework
- **Three.js** - 3D graphics library
- **SHAP** - Model explainability

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/rt-gids/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/rt-gids/discussions)
- **Email**: support@rt-gids.example.com

---

<div align="center">

**Made with ❤️ by the RT-GIDS Team**

⭐ Star this repo if you find it helpful!

</div>
