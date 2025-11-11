import streamlit as st
import pandas as pd
import altair as alt
import pyshark
import joblib
import time
import os

st.set_page_config(page_title="RT-GIDS Dashboard", layout="wide")
st.title("🛡️ Real-Time GPU-Accelerated Intrusion Detection Dashboard")

# Sidebar configuration
st.sidebar.header("⚙️ Configuration")
interface_name = st.sidebar.text_input("Network Interface", value="Wi-Fi")
max_logs = st.sidebar.slider("Max Log Entries", 10, 1000, 100)

# Load model
try:
    model_path = "D:/RealTime_IDS/models/xgb_gpu_ids.joblib"
    if not os.path.exists(model_path):
        st.error(f"❌ Model not found at {model_path}. Please train the model first.")
        st.stop()
    model = joblib.load(model_path)
    st.sidebar.success("✅ Model loaded successfully")
except Exception as e:
    st.error(f"❌ Error loading model: {e}")
    st.stop()

# Initialize session state
if 'logs' not in st.session_state:
    st.session_state.logs = []
if 'stats' not in st.session_state:
    st.session_state.stats = {"normal": 0, "attack": 0}

# Main display area
col1, col2, col3 = st.columns(3)
with col1:
    st.metric("Normal Packets", st.session_state.stats["normal"])
with col2:
    st.metric("Attack Packets", st.session_state.stats["attack"])
with col3:
    total = st.session_state.stats["normal"] + st.session_state.stats["attack"]
    attack_rate = (st.session_state.stats["attack"] / total * 100) if total > 0 else 0
    st.metric("Attack Rate", f"{attack_rate:.2f}%")

# Real-time log display
st.subheader("📊 Real-Time Packet Analysis")
log_placeholder = st.empty()

# Attack visualization
st.subheader("🚨 Attack Visualization")
chart_placeholder = st.empty()

# Initialize capture
try:
    capture = pyshark.LiveCapture(interface=interface_name)
    st.info(f"🟢 Monitoring interface: {interface_name}")
except Exception as e:
    st.warning(f"⚠️ Could not access interface '{interface_name}'. Trying default interface...")
    try:
        capture = pyshark.LiveCapture()
        st.info("🟢 Using default interface")
    except Exception as e2:
        st.error(f"❌ Failed to initialize packet capture: {e2}")
        st.stop()

# Packet processing loop
def extract_features(pkt):
    try:
        features = {
            "packet_length": int(pkt.length),
            "protocol": hash(pkt.highest_layer) % 1000 if hasattr(pkt, 'highest_layer') else 0,
            "src_port": int(pkt[pkt.transport_layer].srcport) if hasattr(pkt, 'transport_layer') else 0,
            "dst_port": int(pkt[pkt.transport_layer].dstport) if hasattr(pkt, 'transport_layer') else 0,
            "src_ip": pkt.ip.src if hasattr(pkt, "ip") else "Unknown"
        }
        return features
    except Exception:
        return None

for pkt in capture.sniff_continuously():
    features = extract_features(pkt)
    if features:
        try:
            X = pd.DataFrame([features])
            pred = model.predict(X)[0]
            status = "⚠️ Attack" if pred == 1 else "✅ Normal"
            
            # Update stats
            if pred == 1:
                st.session_state.stats["attack"] += 1
            else:
                st.session_state.stats["normal"] += 1
            
            # Add to logs
            log_entry = [
                time.strftime("%H:%M:%S"),
                status,
                features["src_port"],
                features["dst_port"],
                features["src_ip"],
                features["packet_length"]
            ]
            st.session_state.logs.append(log_entry)
            
            # Keep only recent logs
            if len(st.session_state.logs) > max_logs:
                st.session_state.logs = st.session_state.logs[-max_logs:]
            
            # Update log display
            df = pd.DataFrame(
                st.session_state.logs[-15:],
                columns=["Time", "Status", "Src Port", "Dst Port", "Src IP", "Length"]
            )
            log_placeholder.dataframe(df, use_container_width=True)
            
            # Update attack chart
            if len(st.session_state.logs) > 0:
                attack_df = pd.DataFrame(st.session_state.logs, columns=["Time", "Status", "Src Port", "Dst Port", "Src IP", "Length"])
                attack_df = attack_df[attack_df["Status"] == "⚠️ Attack"]
                if not attack_df.empty:
                    chart = alt.Chart(attack_df).mark_bar().encode(
                        x="Src IP",
                        y="count()",
                        color=alt.Color("Status", scale=alt.Scale(domain=["⚠️ Attack"], range=["red"]))
                    ).properties(title="Attack Distribution by Source IP")
                    chart_placeholder.altair_chart(chart, use_container_width=True)
        except Exception as e:
            continue

