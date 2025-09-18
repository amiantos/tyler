# Tyler for SillyTavern

**Tyler keeps your SillyTavern installation safe from prying eyes.**

Tyler creates an encrypted, isolated environment for SillyTavern using LUKS encryption. Your conversations, characters, and personal data remain secure and private, even if your host system is compromised.

## Features

- **🔐 LUKS Encryption**: Your SillyTavern data is stored in an encrypted container
- **🚀 One-Click Setup**: Automated SillyTavern installation and configuration
- **🌐 Web Interface**: Simple browser-based management at `http://localhost:3001`
- **🔗 Direct Access**: SillyTavern runs at `http://localhost:8000` when active
- **⚡ Auto-Dismount**: Automatically shuts down and unmounts when inactive
- **🐳 Docker-Based**: Clean, isolated deployment

## Quick Start

1. **Clone and Start**:
   ```bash
   git clone https://github.com/amiantos/tyler.git
   cd tyler
   docker compose up -d
   ```

2. **Setup Your Container**:
   - Open `http://localhost:3001` in your browser
   - Click "Create Container"
   - Set a strong encryption password
   - Choose container size (minimum 5GB)

3. **Use SillyTavern**:
   - Mount your container with your password
   - Access SillyTavern at `http://localhost:8000`

## How It Works

Tyler creates a LUKS-encrypted file container that mounts as a secure filesystem. SillyTavern is automatically installed and configured within this encrypted space.

When you're done, simply unmount the container - your data becomes inaccessible without the encryption password.

If you forget to unmount the container, it will be unmounted for you automatically after 15 minutes of inactivity.

## Security Benefits

- **Encrypted at Rest**: All SillyTavern data encrypted with LUKS
- **Memory Protection**: Unmounted containers can't be accessed
- **Automatic Security**: Containers auto-dismount after periods of inactivity
- **Isolation**: Runs in Docker containers separate from host system
- **No Traces**: When unmounted, no unencrypted data remains on disk
