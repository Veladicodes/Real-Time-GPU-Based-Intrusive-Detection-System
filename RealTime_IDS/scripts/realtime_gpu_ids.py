import pyshark
import joblib
import pandas as pd
import os
import platform
import subprocess
from datetime import datetime
from pathlib import Path

# ============================================================
# 🔍 MODEL AUTO-DETECTION (REALTIME LIGHTWEIGHT MODEL)
# ============================================================
possible_models = [
    Path("D:/CN/RealTime_IDS/models/xgb_realtime_ids.joblib"),
    Path("D:/RealTime_IDS/models/xgb_realtime_ids.joblib")
]
model_path = next((p for p in possible_models if p.exists()), None)
if not model_path:
    raise FileNotFoundError(
        "❌ No real-time model found. Run train_gpu.py first to generate xgb_realtime_ids.joblib."
    )

model = joblib.load(model_path)
print(f"✅ Loaded Real-Time IDS model from: {model_path}")

# ============================================================
# ⚙️ FIREWALL BLOCKING UTILITIES
# ============================================================
def block_ip_windows(ip_address: str) -> bool:
    """Block IP address using Windows Firewall"""
    try:
        rule_name = f"RT-GIDS-Block-{ip_address.replace('.', '-')}"
        cmd = [
            "netsh", "advfirewall", "firewall", "add", "rule",
            f"name={rule_name}", "dir=in", "action=block",
            f"remoteip={ip_address}", "enable=yes"
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        return True
    except Exception as e:
        print(f"⚠️ Firewall rule creation failed: {e}")
        return False


def block_ip_linux(ip_address: str) -> bool:
    """Block IP address using Linux iptables"""
    try:
        os.system(f"sudo iptables -A INPUT -s {ip_address} -j DROP")
        return True
    except Exception as e:
        print(f"⚠️ iptables block failed: {e}")
        return False


def block_malicious_ip(ip_address: str) -> bool:
    """Platform-agnostic IP blocking"""
    system = platform.system()
    if system == "Windows":
        return block_ip_windows(ip_address)
    elif system == "Linux":
        return block_ip_linux(ip_address)
    else:
        print(f"⚠️ Firewall blocking not supported on {system}")
        return False

# ============================================================
# 🧩 FEATURE EXTRACTION (5-FEATURE SCHEMA)
# ============================================================
def extract_features(pkt):
    """Extracts simplified numerical features from a network packet."""
    try:
        return {
            "packet_length": int(pkt.length),
            "protocol": hash(pkt.highest_layer) % 1000,
            "src_port": int(pkt[pkt.transport_layer].srcport) if hasattr(pkt, "transport_layer") else 0,
            "dst_port": int(pkt[pkt.transport_layer].dstport) if hasattr(pkt, "transport_layer") else 0,
            "ip_version": 4 if hasattr(pkt, "ip") else 6,
        }
    except Exception:
        return None

# ============================================================
# 🧾 LOGGING SETUP
# ============================================================
LOG_DIR = Path("D:/CN/RealTime_IDS/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)
log_file = LOG_DIR / f"detection_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"

def log_event(event: str):
    timestamp = datetime.now().strftime("[%Y-%m-%d %H:%M:%S]")
    entry = f"{timestamp} {event}"
    print(entry)
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(entry + "\n")

# ============================================================
# 🚀 START REAL-TIME DETECTION
# ============================================================
print("\n🟢 Starting Real-Time Detection (Lightweight Model). Press Ctrl+C to stop.")
print(f"🖥️  Detected OS: {platform.system()}")
print(f"📄 Logging to: {log_file}")

# Try Wi-Fi interface; fall back to default or list interfaces
try:
    capture = pyshark.LiveCapture(interface="Wi-Fi")
except Exception:
    print("⚠️ 'Wi-Fi' interface not found.")
    try:
        available = pyshark.LiveCapture().interfaces
        print("🔍 Available interfaces:", available)
        capture = pyshark.LiveCapture(interface=available[0] if available else None)
    except Exception:
        print("⚠️ No interfaces detected; using default capture.")
        capture = pyshark.LiveCapture()

# ============================================================
# 🔁 CONTINUOUS PACKET MONITORING LOOP
# ============================================================
try:
    for pkt in capture.sniff_continuously():
        data = extract_features(pkt)
        if not data:
            continue

        X = pd.DataFrame([data])
        try:
            pred = int(model.predict(X)[0])
        except Exception as e:
            print(f"⚠️ Prediction error: {e}")
            continue

        if pred == 1:
            src_ip = pkt.ip.src if hasattr(pkt, "ip") else "Unknown"
            alert = (
                f"⚠️ [ATTACK DETECTED] Src IP: {src_ip} | "
                f"Src Port: {data['src_port']} | Dst Port: {data['dst_port']}"
            )
            log_event(alert)
            if src_ip != "Unknown":
                if block_malicious_ip(src_ip):
                    log_event(f"🚫 Blocked Malicious IP: {src_ip}")
                else:
                    log_event(f"⚙️ Firewall Update Failed for IP: {src_ip}")
        else:
            log_event(
                f"✅ Normal Traffic | Src Port: {data['src_port']} | Dst Port: {data['dst_port']}"
            )

except KeyboardInterrupt:
    print("\n🛑 Detection stopped by user (Ctrl+C).")
    print(f"📄 Log saved at: {log_file}")
    capture.close()
except Exception as e:
    print(f"❌ Unexpected error: {e}")
finally:
    print("✅ Real-Time IDS shutdown complete.")
