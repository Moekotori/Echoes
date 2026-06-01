# Bundled Windows tools

This directory is copied to packaged Windows resources as `resources/tools`.

Large third-party binaries stay out of git. Prepare them locally or in CI before packaging:

```text
ffmpeg.exe
yt-dlp.exe
NCMConverter.exe
```

`ffmpeg.exe` is required by `npm run verify:ffmpeg` and Windows release builds. `yt-dlp.exe` and `NCMConverter.exe` are optional at build time; when absent, their related download/import features report the tool as unavailable.
