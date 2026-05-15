# ECHO Next Audio Core

This folder owns local playback, device discovery, native host bridging, and
output-side timing. It deliberately does not copy the old mixed `AudioEngine.js`
shape from ECHO.

## Modules

- `AudioSession.ts`: playback state machine and sample-rate policy orchestration.
- `DecoderPipeline.ts`: local file probing and ffmpeg PCM decoding.
- `NativeOutputBridge.ts`: `echo-audio-host` process lifecycle, PCM stdin, JSON-line stdout events.
- `DeviceService.ts`: native/shared and ASIO device listing.
- `PlaybackClock.ts`: output-side frame counter to position conversion.
- `audioTypes.ts`: main-process audio core contracts.

## Sample-Rate Fields

The status contract keeps source, decoder, requested output, and actual device
rates separate:

- `fileSampleRate`
- `decoderOutputSampleRate`
- `requestedOutputSampleRate`
- `actualDeviceSampleRate`
- `sharedDeviceSampleRate`
- `outputMode`
- `resampling`
- `bitPerfectCandidate`
- `sampleRateMismatch`

Exclusive and ASIO playback default `requestedOutputSampleRate` to the source
file rate. Shared mode uses a fixed mix-rate policy for transition stability:
explicit request, selected shared mix rate, current ready device rate, then
48 kHz fallback. Shared mode must not fall back to the source file rate, and
`decoderOutputSampleRate` should match the requested shared mix rate so track
sample-rate changes do not recreate the resident host.
