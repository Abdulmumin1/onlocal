#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
MUTED='\033[0;2m'
NC='\033[0m'

REPO="Abdulmumin1/onlocal"
INSTALL_DIR="$HOME/.onlocal/bin"

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Darwin*) echo "darwin" ;;
        Linux*)  echo "linux" ;;
        MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
        *) echo "unsupported" ;;
    esac
}

# Detect architecture
detect_arch() {
    local arch
    arch=$(uname -m)
    case "$arch" in
        x86_64|amd64) echo "x64" ;;
        aarch64|arm64) echo "arm64" ;;
        *) echo "unsupported" ;;
    esac
}

# Check for Rosetta on macOS
check_rosetta() {
    if [ "$(detect_os)" = "darwin" ] && [ "$(detect_arch)" = "x64" ]; then
        if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then
            echo "arm64"
            return
        fi
    fi
    detect_arch
}

os=$(detect_os)
arch=$(check_rosetta)

if [ "$os" = "unsupported" ] || [ "$arch" = "unsupported" ]; then
    echo -e "${RED}Unsupported platform: $(uname -s) $(uname -m)${NC}"
    exit 1
fi

# Build filename
if [ "$os" = "windows" ]; then
    filename="onlocal-${os}-${arch}.exe"
else
    filename="onlocal-${os}-${arch}"
fi

echo -e "${MUTED}Detected: ${NC}${os}-${arch}"

# Get latest version
echo -e "${MUTED}Fetching latest version...${NC}"
latest_tag=$(curl -sI "https://github.com/${REPO}/releases/latest" | grep -i "^location:" | sed -n 's/.*tag\/\([^[:space:]]*\).*/\1/p' | tr -d '\r')

if [ -z "$latest_tag" ]; then
    echo -e "${RED}Failed to fetch latest version${NC}"
    exit 1
fi

echo -e "${MUTED}Installing version: ${NC}${latest_tag}"

# Download URL
url="https://github.com/${REPO}/releases/download/${latest_tag}/${filename}"

# Create install directory
mkdir -p "$INSTALL_DIR"

# Download binary
echo -e "${MUTED}Downloading...${NC}"
if ! curl -fSL --progress-bar -o "$INSTALL_DIR/onlocal" "$url"; then
    echo -e "${RED}Download failed. Check if the release exists: ${url}${NC}"
    exit 1
fi

chmod +x "$INSTALL_DIR/onlocal"

# Add to PATH
add_to_path() {
    local shell_config="$1"
    local export_cmd="export PATH=\"$INSTALL_DIR:\$PATH\""

    if [ -f "$shell_config" ]; then
        if ! grep -q "$INSTALL_DIR" "$shell_config" 2>/dev/null; then
            echo -e "\n# onlocal\n$export_cmd" >> "$shell_config"
            echo -e "${MUTED}Added to PATH in ${NC}$shell_config"
        fi
    fi
}

# Detect shell and update config
case "$(basename "$SHELL")" in
    zsh)  add_to_path "$HOME/.zshrc" ;;
    bash) add_to_path "$HOME/.bashrc" ;;
    fish)
        fish_config="$HOME/.config/fish/config.fish"
        if [ -f "$fish_config" ] && ! grep -q "$INSTALL_DIR" "$fish_config" 2>/dev/null; then
            echo -e "\n# onlocal\nfish_add_path $INSTALL_DIR" >> "$fish_config"
            echo -e "${MUTED}Added to PATH in ${NC}$fish_config"
        fi
        ;;
esac

# GitHub Actions support
if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
    echo "$INSTALL_DIR" >> "$GITHUB_PATH"
fi

echo -e ""
echo -e "${GREEN}onlocal installed successfully!${NC}"
echo -e ""
echo -e "${MUTED}To get started:${NC}"
echo -e "  ${MUTED}1.${NC} Restart your terminal or run: ${MUTED}source ~/.zshrc${NC} (or ~/.bashrc)"
echo -e "  ${MUTED}2.${NC} Run: ${MUTED}onlocal${NC}"
echo -e ""
