"""
Setup script for RT-GIDS
Run this script to verify dependencies and setup
"""

import sys
import subprocess
import platform

def check_python_version():
    """Check if Python version is 3.8+"""
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print("❌ Python 3.8+ is required")
        return False
    print(f"✅ Python {version.major}.{version.minor}.{version.micro}")
    return True

def check_package(package_name):
    """Check if a package is installed"""
    try:
        __import__(package_name)
        return True
    except ImportError:
        return False

def install_package(package_name):
    """Install a package using pip"""
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", package_name])
        return True
    except subprocess.CalledProcessError:
        return False

def main():
    print("=" * 60)
    print("RT-GIDS Setup and Dependency Check")
    print("=" * 60)
    
    # Check Python version
    if not check_python_version():
        sys.exit(1)
    
    # Required packages
    required_packages = {
        'pandas': 'pandas',
        'numpy': 'numpy',
        'sklearn': 'scikit-learn',
        'xgboost': 'xgboost',
        'pyshark': 'pyshark',
        'scapy': 'scapy',
        'streamlit': 'streamlit',
        'joblib': 'joblib',
        'altair': 'altair',
        'matplotlib': 'matplotlib',
        'seaborn': 'seaborn'
    }
    
    print("\n📦 Checking dependencies...")
    missing_packages = []
    
    for import_name, package_name in required_packages.items():
        if check_package(import_name):
            print(f"✅ {package_name}")
        else:
            print(f"❌ {package_name} - MISSING")
            missing_packages.append(package_name)
    
    if missing_packages:
        print(f"\n⚠️  Missing {len(missing_packages)} package(s)")
        response = input("Install missing packages? (y/n): ")
        if response.lower() == 'y':
            for package in missing_packages:
                print(f"Installing {package}...")
                if install_package(package):
                    print(f"✅ {package} installed")
                else:
                    print(f"❌ Failed to install {package}")
        else:
            print("Please install missing packages manually:")
            print(f"pip install {' '.join(missing_packages)}")
    else:
        print("\n✅ All dependencies are installed!")
    
    # Check for CUDA/GPU
    print("\n🎮 Checking GPU support...")
    try:
        import xgboost as xgb
        # Try to create a simple GPU model to test
        print("✅ XGBoost is installed")
        print("⚠️  Note: GPU support requires CUDA Toolkit and compatible GPU")
        print("   Run 'nvidia-smi' to check GPU availability")
    except Exception as e:
        print(f"❌ XGBoost check failed: {e}")
    
    # Check for Wireshark/TShark (required for PyShark)
    print("\n📡 Checking network capture tools...")
    system = platform.system()
    if system == "Windows":
        try:
            result = subprocess.run(['tshark', '--version'], capture_output=True, text=True)
            if result.returncode == 0:
                print("✅ TShark/Wireshark is installed")
            else:
                print("❌ TShark not found. Please install Wireshark from https://www.wireshark.org/")
        except FileNotFoundError:
            print("❌ TShark not found. Please install Wireshark from https://www.wireshark.org/")
    else:
        try:
            result = subprocess.run(['tshark', '--version'], capture_output=True, text=True)
            if result.returncode == 0:
                print("✅ TShark/Wireshark is installed")
            else:
                print("⚠️  TShark may not be installed. Install with: sudo apt-get install tshark")
        except FileNotFoundError:
            print("⚠️  TShark not found. Install with: sudo apt-get install tshark")
    
    print("\n" + "=" * 60)
    print("Setup check complete!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Place CICIDS2017 CSV files in D:/Data/")
    print("2. Run: python D:/RealTime_IDS/scripts/preprocess_gpu.py")
    print("3. Run: python D:/RealTime_IDS/scripts/train_gpu.py")
    print("4. Run: python D:/RealTime_IDS/scripts/realtime_gpu_ids.py")
    print("5. Run: streamlit run D:/RealTime_IDS/dashboard/dashboard_gpu.py")

if __name__ == "__main__":
    main()

