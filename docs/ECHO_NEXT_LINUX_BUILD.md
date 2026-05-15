# ECHO Next Linux Build

Linux packages must be built from a Linux x64 environment. Use native Linux, WSL2, a Linux VM, or a Linux CI runner. Windows-to-Linux cross packaging is intentionally blocked because the build needs a Linux `echo-audio-host` binary and Linux packaging tools.

## Ubuntu dependencies

Install Node.js/npm for the project, then install the native build and packaging tools:

```bash
sudo apt update
sudo apt install cmake g++ pkg-config fakeroot dpkg rpm binutils
```

Install the JUCE Linux development libraries used by `echo-audio-host`:

```bash
sudo apt install \
  libasound2-dev libjack-jackd2-dev \
  libfreetype-dev libfontconfig1-dev \
  libx11-dev libxcomposite-dev libxcursor-dev libxext-dev \
  libxinerama-dev libxrandr-dev libxrender-dev
```

## Build

```bash
npm ci
npm run build:linux
```

`build:linux` performs the full Linux build:

1. Builds `electron-app/build/echo-audio-host`.
2. Runs the TypeScript and Electron/Vite production build.
3. Runs `electron-builder --linux`.
4. Verifies the packaged audio host and the AppImage/deb artifacts.

Expected outputs:

- `dist/linux-unpacked/resources/echo-audio-host`
- `dist/*.AppImage`
- `dist/*.deb`

The Linux audio host currently provides shared native output through JUCE. Windows-only SMTC, WASAPI exclusive, and ASIO paths remain Windows-only.
