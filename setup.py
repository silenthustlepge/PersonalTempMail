import os
import sys
import subprocess
import shutil

GREEN = "\033[0;32m"
YELLOW = "\033[1;33m"
RED = "\033[0;31m"
BLUE = "\033[0;34m"
NC = "\033[0m"

def print_status(msg):
    print(f"{GREEN}✅ {msg}{NC}")

def print_warning(msg):
    print(f"{YELLOW}⚠️  {msg}{NC}")

def print_error(msg):
    print(f"{RED}❌ {msg}{NC}")

def print_info(msg):
    print(f"{BLUE}ℹ️  {msg}{NC}")

def pause(msg="Press Enter to continue..."):
    input(msg)

def check_node():
    try:
        version = subprocess.check_output(["node", "--version"], text=True).strip()
        print_status(f"Node.js version: {version}")
        major = int(version.lstrip("v").split(".")[0])
        if major < 16:
            print_error(f"Node.js version 16 or higher is required. Current version: {version}")
            sys.exit(1)
    except Exception:
        print_error("Node.js is not installed. Please install Node.js 16 or higher.")
        sys.exit(1)

def install_node_deps(backend_dir):
    node_modules = os.path.join(backend_dir, "node_modules")
    if not os.path.isdir(node_modules):
        print_info("Installing Node.js dependencies...")
        npm_cmd = "npm"
        # On Windows, try to find full path to npm if not found
        if os.name == "nt":
            from shutil import which
            npm_path = which("npm")
            if npm_path:
                npm_cmd = npm_path
            else:
                print_error("'npm' not found in PATH. Please ensure Node.js and npm are installed and available in your PATH.")
                sys.exit(1)
        try:
            subprocess.check_call([npm_cmd, "install"], cwd=backend_dir)
        except FileNotFoundError:
            print_error("'npm' command not found. Please ensure Node.js and npm are installed and available in your PATH.")
            sys.exit(1)
        print_status("Dependencies installed")

def check_credentials(backend_dir):
    cred_path = os.path.join(backend_dir, "credentials.json")
    if not os.path.isfile(cred_path):
        print_warning("credentials.json not found!")
        print()
        print("📋 You need to:")
        print("1. Go to Google Cloud Console")
        print("2. Create OAuth2 credentials")
        print("3. Download the JSON file")
        print("4. Save it as 'credentials.json' in the backend directory")
        print()
        print_info("See README.md for detailed instructions")
        print()
        pause("Press Enter when you have added credentials.json...")

def check_env(backend_dir):
    env_path = os.path.join(backend_dir, ".env")
    env_example = os.path.join(backend_dir, ".env.example")
    if not os.path.isfile(env_path):
        print_warning(".env file not found! Creating template...")
        shutil.copy(env_example, env_path)
        print_info("Please edit .env and add your Google Cloud Project ID")
        sys.exit(1)
    with open(env_path) as f:
        for line in f:
            line_strip = line.strip()
            if line_strip.startswith('#'):
                continue
            if "your-gcp-project-id-here" in line_strip:
                print_warning("Please update GCP_PROJECT_ID in .env file with your actual Project ID")
                print_info("Edit backend/.env and replace 'your-gcp-project-id-here' with your Google Cloud Project ID")
                sys.exit(1)

def authorize_gmail(backend_dir):
    tokens_path = os.path.join(backend_dir, "tokens.json")
    if not os.path.isfile(tokens_path):
        print_info("Gmail authorization required...")
        print()
        print("📧 This will open a browser for Gmail authorization")
        print("You'll need to:")
        print("1. Sign in to your Gmail account")
        print("2. Grant permissions to read emails")
        print("3. Complete the OAuth flow")
        print()
        pause("Press Enter to start authorization...")
        subprocess.call(["node", "authorize.js"], cwd=backend_dir)
        if not os.path.isfile(tokens_path):
            print_error("Authorization failed. Please check your credentials.json and try again.")
            sys.exit(1)
        print_status("Gmail authorization complete")
    else:
        print_status("Gmail authorization already complete")

def main():
    print("🚀 Starting Temp Mail Service Setup...")
    print("======================================")

    # Check if we're in the correct directory
    if not os.path.isfile(os.path.join("backend", "package.json")):
        print_error("Please run this script from the /app directory")
        sys.exit(1)

    print_status("Checking prerequisites...")
    check_node()

    backend_dir = "backend"
    install_node_deps(backend_dir)
    check_credentials(backend_dir)
    check_env(backend_dir)
    print_status("Configuration files are ready")
    authorize_gmail(backend_dir)
    print_status("Setup completed successfully!")

    print()
    print("🎉 Your Temp Mail Service is ready!")
    print("==================================")
    print()
    print("📋 Next steps:")
    print("1. 🌐 Install ngrok: https://ngrok.com/download")
    print("2. 🔗 Start ngrok tunnel: ngrok http 8001")
    print("3. ⚙️  Set up Pub/Sub subscription in Google Cloud Console")
    print("4. 👀 Run: node start-watch.js")
    print("5. 🧪 Test your service!")
    print()
    print("📖 See README.md for detailed instructions")
    print()
    print_status("Happy temporary emailing! 📧")

if __name__ == "__main__":
    main()