#ifdef _WIN32

#include "asio_host.h"

#ifndef NOMINMAX
#define NOMINMAX
#endif

#include "asiosys.h"
#include "asio.h"
#include "asiodrivers.h"

#include <windows.h>

#include <algorithm>
#include <ctype.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <string>
#include <vector>

extern AsioDrivers* asioDrivers;
bool loadAsioDriver(char* name);

constexpr long maxAsioInputChannels = 8;
constexpr long maxAsioOutputChannels = 8;
constexpr long maxAsioTotalChannels = maxAsioInputChannels + maxAsioOutputChannels;
constexpr long maxAsioDrivers = 64;

struct asio_runtime
{
    ASIODriverInfo driverInfo {};
    ASIOCallbacks callbacks {};
    ASIOBufferInfo bufferInfos[maxAsioTotalChannels] {};
    ASIOChannelInfo channelInfos[maxAsioTotalChannels] {};
    long inputChannelCount = 0;
    long outputChannelCount = 0;
    long totalChannelCount = 0;
    long outputChannelOffset = 0;
    long outputChannelStart = 0;
    long bufferSize = 0;
    long minBufferSize = 0;
    long maxBufferSize = 0;
    long preferredBufferSize = 0;
    long granularity = 0;
    uint32_t requestedSampleRate = 0;
    ASIOSampleRate sampleRate = 0.0;
    ASIOBool postOutput = ASIOFalse;
    uint32_t sourceChannels = 0;
    float* scratch = nullptr;
    HWND sysRefWindow = nullptr;
    asio_render_callback callback = nullptr;
    void* userData = nullptr;
    bool initialized = false;
    bool buffersCreated = false;
    bool started = false;
    char selectedName[512] {};
};

namespace
{
struct BufferAttempt
{
    long size = 0;
    ASIOError error = ASE_OK;
};

asio_runtime* activeRuntime = nullptr;

void set_error(char* error, size_t errorLen, const char* message)
{
    if (error == nullptr || errorLen == 0)
        return;

    snprintf(error, errorLen, "%s", message != nullptr ? message : "unknown ASIO error");
    error[errorLen - 1] = '\0';
}

void append_error(char* error, size_t errorLen, const char* message)
{
    if (error == nullptr || errorLen == 0 || message == nullptr)
        return;

    const size_t used = strlen(error);
    if (used >= errorLen - 1)
        return;

    snprintf(error + used, errorLen - used, "%s", message);
    error[errorLen - 1] = '\0';
}

void ansi_to_utf8(const char* input, char* output, int outputLen)
{
    if (output == nullptr || outputLen <= 0)
        return;

    output[0] = '\0';
    if (input == nullptr || input[0] == '\0')
        return;

    int wideLen = MultiByteToWideChar(CP_ACP, 0, input, -1, nullptr, 0);
    if (wideLen <= 0)
    {
        snprintf(output, static_cast<size_t>(outputLen), "%s", input);
        output[outputLen - 1] = '\0';
        return;
    }

    std::vector<wchar_t> wide(static_cast<size_t>(wideLen));
    if (MultiByteToWideChar(CP_ACP, 0, input, -1, wide.data(), wideLen) <= 0)
        return;

    if (WideCharToMultiByte(CP_UTF8, 0, wide.data(), -1, output, outputLen, nullptr, nullptr) <= 0)
        output[0] = '\0';
}

void utf8_to_ansi(const char* input, char* output, int outputLen)
{
    if (output == nullptr || outputLen <= 0)
        return;

    output[0] = '\0';
    if (input == nullptr || input[0] == '\0')
        return;

    int wideLen = MultiByteToWideChar(CP_UTF8, 0, input, -1, nullptr, 0);
    if (wideLen <= 0)
    {
        snprintf(output, static_cast<size_t>(outputLen), "%s", input);
        output[outputLen - 1] = '\0';
        return;
    }

    std::vector<wchar_t> wide(static_cast<size_t>(wideLen));
    if (MultiByteToWideChar(CP_UTF8, 0, input, -1, wide.data(), wideLen) <= 0)
        return;

    if (WideCharToMultiByte(CP_ACP, 0, wide.data(), -1, output, outputLen, nullptr, nullptr) <= 0)
        output[0] = '\0';
}

int contains_icase(const char* haystack, const char* needle)
{
    if (haystack == nullptr || needle == nullptr)
        return 0;

    const size_t hayLen = strlen(haystack);
    const size_t needleLen = strlen(needle);
    if (needleLen == 0)
        return 1;
    if (hayLen < needleLen)
        return 0;

    for (size_t i = 0; i + needleLen <= hayLen; ++i)
    {
        size_t j = 0;
        while (j < needleLen)
        {
            const auto left = static_cast<unsigned char>(haystack[i + j]);
            const auto right = static_cast<unsigned char>(needle[j]);
            if (tolower(left) != tolower(right))
                break;
            ++j;
        }
        if (j == needleLen)
            return 1;
    }

    return 0;
}

const char* asio_error_name(ASIOError error)
{
    switch (error)
    {
        case ASE_OK: return "ASE_OK";
        case ASE_NotPresent: return "ASE_NotPresent";
        case ASE_HWMalfunction: return "ASE_HWMalfunction";
        case ASE_InvalidParameter: return "ASE_InvalidParameter";
        case ASE_InvalidMode: return "ASE_InvalidMode";
        case ASE_SPNotAdvancing: return "ASE_SPNotAdvancing";
        case ASE_NoClock: return "ASE_NoClock";
        case ASE_NoMemory: return "ASE_NoMemory";
        default: return "ASE_Unknown";
    }
}

float clamp_sample(float sample)
{
    if (sample > 1.0f)
        return 1.0f;
    if (sample < -1.0f)
        return -1.0f;
    return sample;
}

void write_u16_be(unsigned char* target, uint16_t value)
{
    target[0] = static_cast<unsigned char>((value >> 8) & 0xff);
    target[1] = static_cast<unsigned char>(value & 0xff);
}

void write_u24_le(unsigned char* target, int32_t value)
{
    target[0] = static_cast<unsigned char>(value & 0xff);
    target[1] = static_cast<unsigned char>((value >> 8) & 0xff);
    target[2] = static_cast<unsigned char>((value >> 16) & 0xff);
}

void write_u24_be(unsigned char* target, int32_t value)
{
    target[0] = static_cast<unsigned char>((value >> 16) & 0xff);
    target[1] = static_cast<unsigned char>((value >> 8) & 0xff);
    target[2] = static_cast<unsigned char>(value & 0xff);
}

void write_u32_be(unsigned char* target, uint32_t value)
{
    target[0] = static_cast<unsigned char>((value >> 24) & 0xff);
    target[1] = static_cast<unsigned char>((value >> 16) & 0xff);
    target[2] = static_cast<unsigned char>((value >> 8) & 0xff);
    target[3] = static_cast<unsigned char>(value & 0xff);
}

int32_t scaled_int_sample(float sample, int bits)
{
    const float clamped = clamp_sample(sample);
    const double peak = static_cast<double>((1u << (bits - 1)) - 1u);
    return static_cast<int32_t>(clamped * peak);
}

int32_t aligned_i32_sample(float sample, int validBits)
{
    const int32_t value = scaled_int_sample(sample, validBits);
    return value << (32 - validBits);
}

void write_asio_sample(void* buffer, ASIOSampleType type, long frameIndex, float sample)
{
    auto* bytes = static_cast<unsigned char*>(buffer);

    switch (type)
    {
        case ASIOSTInt16LSB:
            reinterpret_cast<int16_t*>(buffer)[frameIndex] = static_cast<int16_t>(scaled_int_sample(sample, 16));
            break;
        case ASIOSTInt16MSB:
            write_u16_be(bytes + frameIndex * 2, static_cast<uint16_t>(static_cast<int16_t>(scaled_int_sample(sample, 16))));
            break;
        case ASIOSTInt24LSB:
            write_u24_le(bytes + frameIndex * 3, scaled_int_sample(sample, 24));
            break;
        case ASIOSTInt24MSB:
            write_u24_be(bytes + frameIndex * 3, scaled_int_sample(sample, 24));
            break;
        case ASIOSTInt32LSB:
            reinterpret_cast<int32_t*>(buffer)[frameIndex] = scaled_int_sample(sample, 32);
            break;
        case ASIOSTInt32MSB:
            write_u32_be(bytes + frameIndex * 4, static_cast<uint32_t>(scaled_int_sample(sample, 32)));
            break;
        case ASIOSTInt32LSB16:
            reinterpret_cast<int32_t*>(buffer)[frameIndex] = aligned_i32_sample(sample, 16);
            break;
        case ASIOSTInt32LSB18:
            reinterpret_cast<int32_t*>(buffer)[frameIndex] = aligned_i32_sample(sample, 18);
            break;
        case ASIOSTInt32LSB20:
            reinterpret_cast<int32_t*>(buffer)[frameIndex] = aligned_i32_sample(sample, 20);
            break;
        case ASIOSTInt32LSB24:
            reinterpret_cast<int32_t*>(buffer)[frameIndex] = aligned_i32_sample(sample, 24);
            break;
        case ASIOSTInt32MSB16:
            write_u32_be(bytes + frameIndex * 4, static_cast<uint32_t>(aligned_i32_sample(sample, 16)));
            break;
        case ASIOSTInt32MSB18:
            write_u32_be(bytes + frameIndex * 4, static_cast<uint32_t>(aligned_i32_sample(sample, 18)));
            break;
        case ASIOSTInt32MSB20:
            write_u32_be(bytes + frameIndex * 4, static_cast<uint32_t>(aligned_i32_sample(sample, 20)));
            break;
        case ASIOSTInt32MSB24:
            write_u32_be(bytes + frameIndex * 4, static_cast<uint32_t>(aligned_i32_sample(sample, 24)));
            break;
        case ASIOSTFloat32LSB:
            reinterpret_cast<float*>(buffer)[frameIndex] = clamp_sample(sample);
            break;
        case ASIOSTFloat32MSB:
        {
            union { float f; uint32_t u; } cvt {};
            cvt.f = clamp_sample(sample);
            write_u32_be(bytes + frameIndex * 4, cvt.u);
            break;
        }
        case ASIOSTFloat64LSB:
            reinterpret_cast<double*>(buffer)[frameIndex] = static_cast<double>(clamp_sample(sample));
            break;
        case ASIOSTFloat64MSB:
        {
            union { double d; uint64_t u; } cvt {};
            cvt.d = static_cast<double>(clamp_sample(sample));
            auto* target = bytes + frameIndex * 8;
            target[0] = static_cast<unsigned char>((cvt.u >> 56) & 0xff);
            target[1] = static_cast<unsigned char>((cvt.u >> 48) & 0xff);
            target[2] = static_cast<unsigned char>((cvt.u >> 40) & 0xff);
            target[3] = static_cast<unsigned char>((cvt.u >> 32) & 0xff);
            target[4] = static_cast<unsigned char>((cvt.u >> 24) & 0xff);
            target[5] = static_cast<unsigned char>((cvt.u >> 16) & 0xff);
            target[6] = static_cast<unsigned char>((cvt.u >> 8) & 0xff);
            target[7] = static_cast<unsigned char>(cvt.u & 0xff);
            break;
        }
        default:
            break;
    }
}

bool asio_sample_type_supported(ASIOSampleType type)
{
    switch (type)
    {
        case ASIOSTInt16LSB:
        case ASIOSTInt24LSB:
        case ASIOSTInt32LSB:
        case ASIOSTFloat32LSB:
        case ASIOSTFloat64LSB:
        case ASIOSTInt32LSB16:
        case ASIOSTInt32LSB18:
        case ASIOSTInt32LSB20:
        case ASIOSTInt32LSB24:
        case ASIOSTInt16MSB:
        case ASIOSTInt24MSB:
        case ASIOSTInt32MSB:
        case ASIOSTFloat32MSB:
        case ASIOSTFloat64MSB:
        case ASIOSTInt32MSB16:
        case ASIOSTInt32MSB18:
        case ASIOSTInt32MSB20:
        case ASIOSTInt32MSB24:
            return true;
        default:
            return false;
    }
}

const char* asio_sample_type_name(ASIOSampleType type)
{
    switch (type)
    {
        case ASIOSTInt16LSB: return "int16lsb";
        case ASIOSTInt24LSB: return "int24lsb";
        case ASIOSTInt32LSB: return "int32lsb";
        case ASIOSTFloat32LSB: return "float32lsb";
        case ASIOSTFloat64LSB: return "float64lsb";
        case ASIOSTInt32LSB16: return "int32lsb16";
        case ASIOSTInt32LSB18: return "int32lsb18";
        case ASIOSTInt32LSB20: return "int32lsb20";
        case ASIOSTInt32LSB24: return "int32lsb24";
        case ASIOSTInt16MSB: return "int16msb";
        case ASIOSTInt24MSB: return "int24msb";
        case ASIOSTInt32MSB: return "int32msb";
        case ASIOSTFloat32MSB: return "float32msb";
        case ASIOSTFloat64MSB: return "float64msb";
        case ASIOSTInt32MSB16: return "int32msb16";
        case ASIOSTInt32MSB18: return "int32msb18";
        case ASIOSTInt32MSB20: return "int32msb20";
        case ASIOSTInt32MSB24: return "int32msb24";
        default: return "unsupported";
    }
}

ASIOSampleRate asio_sample_rate_from_uint32(uint32_t sampleRate)
{
    return static_cast<ASIOSampleRate>(sampleRate);
}

uint32_t asio_sample_rate_to_uint32(ASIOSampleRate sampleRate)
{
    return static_cast<uint32_t>(sampleRate + 0.5);
}

bool asio_sample_rate_matches(ASIOSampleRate left, ASIOSampleRate right)
{
    return fabs(left - right) < 0.5;
}

ASIOSampleRate read_asio_sample_rate_or(ASIOSampleRate fallback)
{
    ASIOSampleRate actualRate = fallback;
    if (ASIOGetSampleRate(&actualRate) != ASE_OK || actualRate <= 0.0)
        return fallback;

    return actualRate;
}

ASIOSampleRate wait_for_asio_sample_rate(ASIOSampleRate requestedRate, ASIOSampleRate fallback, int attempts, int sleepMs)
{
    ASIOSampleRate observedRate = read_asio_sample_rate_or(fallback);
    for (int attempt = 0; attempt < attempts && ! asio_sample_rate_matches(observedRate, requestedRate); ++attempt)
    {
        Sleep(static_cast<DWORD>(std::max(1, sleepMs)));
        observedRate = read_asio_sample_rate_or(observedRate);
    }

    return observedRate;
}

bool try_asio_sample_rate_pivot(ASIOSampleRate pivotRate, ASIOSampleRate requestedRate, ASIOSampleRate* actualRate)
{
    if (asio_sample_rate_matches(pivotRate, requestedRate) || ASIOCanSampleRate(pivotRate) != ASE_OK)
        return false;

    fprintf(stderr,
        "[echo-audio-host] ASIO sample-rate pivot attempt: pivot=%u requested=%u\n",
        asio_sample_rate_to_uint32(pivotRate),
        asio_sample_rate_to_uint32(requestedRate));

    ASIOError result = ASIOSetSampleRate(pivotRate);
    if (result != ASE_OK)
    {
        fprintf(stderr,
            "[echo-audio-host] ASIO sample-rate pivot failed: pivot=%u result=%s(%ld)\n",
            asio_sample_rate_to_uint32(pivotRate),
            asio_error_name(result),
            static_cast<long>(result));
        return false;
    }

    const ASIOSampleRate pivotObservedRate = wait_for_asio_sample_rate(pivotRate, pivotRate, 20, 20);
    fprintf(stderr,
        "[echo-audio-host] ASIO sample-rate pivot observed: pivot=%u actual=%u\n",
        asio_sample_rate_to_uint32(pivotRate),
        asio_sample_rate_to_uint32(pivotObservedRate));

    Sleep(50);
    result = ASIOSetSampleRate(requestedRate);
    if (result != ASE_OK)
    {
        if (actualRate != nullptr)
            *actualRate = read_asio_sample_rate_or(pivotObservedRate);
        fprintf(stderr,
            "[echo-audio-host] ASIO sample-rate pivot restore failed: requested=%u result=%s(%ld)\n",
            asio_sample_rate_to_uint32(requestedRate),
            asio_error_name(result),
            static_cast<long>(result));
        return false;
    }

    const ASIOSampleRate requestedObservedRate = wait_for_asio_sample_rate(requestedRate, pivotObservedRate, 35, 20);
    if (actualRate != nullptr)
        *actualRate = requestedObservedRate;

    fprintf(stderr,
        "[echo-audio-host] ASIO sample-rate pivot completed: requested=%u actual=%u\n",
        asio_sample_rate_to_uint32(requestedRate),
        asio_sample_rate_to_uint32(requestedObservedRate));

    return asio_sample_rate_matches(requestedObservedRate, requestedRate);
}

std::vector<ASIOSampleRate> build_asio_sample_rate_pivot_candidates(ASIOSampleRate requestedRate)
{
    const ASIOSampleRate knownRates[] = { 44100.0, 48000.0, 88200.0, 96000.0, 176400.0, 192000.0 };
    std::vector<ASIOSampleRate> candidates;

    const auto addCandidate = [&] (ASIOSampleRate rate)
    {
        if (asio_sample_rate_matches(rate, requestedRate))
            return;

        const auto duplicate = std::find_if(candidates.begin(), candidates.end(), [&] (ASIOSampleRate candidate)
        {
            return asio_sample_rate_matches(candidate, rate);
        });

        if (duplicate == candidates.end())
            candidates.push_back(rate);
    };

    if (! asio_sample_rate_matches(requestedRate, 48000.0))
        addCandidate(48000.0);

    for (ASIOSampleRate rate : knownRates)
        addCandidate(rate);

    return candidates;
}

ASIOError set_asio_sample_rate_and_wait(ASIOSampleRate requestedRate, ASIOSampleRate* actualRate)
{
    ASIOError result = ASIOCanSampleRate(requestedRate);
    if (result != ASE_OK)
    {
        if (actualRate != nullptr)
            *actualRate = read_asio_sample_rate_or(requestedRate);
        return result;
    }

    result = ASIOSetSampleRate(requestedRate);
    if (result != ASE_OK)
    {
        if (actualRate != nullptr)
            *actualRate = read_asio_sample_rate_or(requestedRate);
        return result;
    }

    ASIOSampleRate observedRate = wait_for_asio_sample_rate(requestedRate, requestedRate, 25, 20);

    if (! asio_sample_rate_matches(observedRate, requestedRate))
    {
        for (ASIOSampleRate pivotRate : build_asio_sample_rate_pivot_candidates(requestedRate))
        {
            if (try_asio_sample_rate_pivot(pivotRate, requestedRate, &observedRate))
                break;
        }
    }

    if (actualRate != nullptr)
        *actualRate = observedRate;

    return ASE_OK;
}

LRESULT CALLBACK asio_host_wndproc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    return DefWindowProc(hwnd, msg, wParam, lParam);
}

HWND create_asio_host_window()
{
    static const wchar_t* className = L"EchoNextAudioHostAsioWindow";
    static bool classRegistered = false;
    HINSTANCE instance = GetModuleHandleW(nullptr);

    if (! classRegistered)
    {
        WNDCLASSW wc {};
        wc.lpfnWndProc = asio_host_wndproc;
        wc.hInstance = instance;
        wc.lpszClassName = className;
        if (! RegisterClassW(&wc) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS)
            return nullptr;
        classRegistered = true;
    }

    return CreateWindowExW(
        0,
        className,
        L"ECHO Next ASIO Host",
        WS_OVERLAPPED,
        0,
        0,
        0,
        0,
        nullptr,
        nullptr,
        instance,
        nullptr);
}

bool is_power_of_two(long value)
{
    return value > 0 && (value & (value - 1)) == 0;
}

bool buffer_size_is_legal(long size, long minSize, long maxSize, long preferredSize, long granularity)
{
    if (size <= 0)
        return false;

    if (minSize <= 0)
        minSize = 1;

    if (maxSize < minSize)
        maxSize = std::max(minSize, preferredSize);

    if (size < minSize || size > maxSize)
        return false;

    if (size == preferredSize)
        return true;

    if (granularity == -1)
        return is_power_of_two(size);

    if (granularity > 0)
        return ((size - minSize) % granularity) == 0;

    return true;
}

void add_buffer_candidate(
    std::vector<long>& candidates,
    long size,
    long minSize,
    long maxSize,
    long preferredSize,
    long granularity)
{
    if (! buffer_size_is_legal(size, minSize, maxSize, preferredSize, granularity))
        return;

    if (std::find(candidates.begin(), candidates.end(), size) == candidates.end())
        candidates.push_back(size);
}

void add_nearest_legal_buffer_candidates(
    std::vector<long>& candidates,
    long size,
    long minSize,
    long maxSize,
    long preferredSize,
    long granularity)
{
    if (size <= 0)
        return;

    add_buffer_candidate(candidates, size, minSize, maxSize, preferredSize, granularity);

    if (minSize <= 0)
        minSize = 1;
    if (maxSize < minSize)
        maxSize = std::max(minSize, preferredSize);

    const long clamped = std::max(minSize, std::min(maxSize, size));
    add_buffer_candidate(candidates, clamped, minSize, maxSize, preferredSize, granularity);

    if (granularity == -1)
    {
        long lower = 1;
        while (lower <= clamped / 2)
            lower *= 2;
        long upper = lower;
        while (upper < clamped && upper <= maxSize / 2)
            upper *= 2;
        add_buffer_candidate(candidates, lower, minSize, maxSize, preferredSize, granularity);
        add_buffer_candidate(candidates, upper, minSize, maxSize, preferredSize, granularity);
        if (upper <= maxSize / 2)
            add_buffer_candidate(candidates, upper * 2, minSize, maxSize, preferredSize, granularity);
        return;
    }

    if (granularity > 0)
    {
        const long offset = clamped - minSize;
        const long lower = minSize + (offset / granularity) * granularity;
        const long upper = lower + granularity;
        add_buffer_candidate(candidates, lower, minSize, maxSize, preferredSize, granularity);
        add_buffer_candidate(candidates, upper, minSize, maxSize, preferredSize, granularity);
    }
}

std::vector<long> build_buffer_candidates(
    long minSize,
    long maxSize,
    long preferredSize,
    long granularity,
    uint32_t requestedBufferFrames)
{
    std::vector<long> candidates;
    const long requested = static_cast<long>(requestedBufferFrames);

    if (requested > 0)
        add_nearest_legal_buffer_candidates(candidates, requested, minSize, maxSize, preferredSize, granularity);

    add_buffer_candidate(candidates, preferredSize, minSize, maxSize, preferredSize, granularity);

    for (long size : { 512L, 1024L, 2048L, 4096L, 8192L, 256L })
        add_nearest_legal_buffer_candidates(candidates, size, minSize, maxSize, preferredSize, granularity);

    add_buffer_candidate(candidates, minSize, minSize, maxSize, preferredSize, granularity);
    add_buffer_candidate(candidates, maxSize, minSize, maxSize, preferredSize, granularity);

    return candidates;
}

int collect_asio_devices(std::vector<asio_device_info>& devices)
{
    char nameStorage[maxAsioDrivers][512] {};
    char* names[maxAsioDrivers] {};
    AsioDrivers drivers;

    for (long i = 0; i < maxAsioDrivers; ++i)
        names[i] = nameStorage[i];

    const long count = drivers.getDriverNames(names, maxAsioDrivers);
    if (count <= 0)
        return 0;

    for (long i = 0; i < count; ++i)
    {
        char utf8Name[512] {};
        ansi_to_utf8(names[i], utf8Name, static_cast<int>(sizeof(utf8Name)));
        if (utf8Name[0] == '\0')
            continue;

        const auto duplicate = std::find_if(devices.begin(), devices.end(), [&] (const asio_device_info& device)
        {
            return strcmp(device.name, utf8Name) == 0;
        });
        if (duplicate != devices.end())
            continue;

        asio_device_info info {};
        snprintf(info.name, sizeof(info.name), "%s", utf8Name);
        info.isDefault = devices.empty() ? 1 : 0;

        char ansiName[512] {};
        utf8_to_ansi(utf8Name, ansiName, static_cast<int>(sizeof(ansiName)));
        if (contains_icase(utf8Name, "asio4all") && ansiName[0] != '\0' && loadAsioDriver(ansiName))
        {
            ASIODriverInfo driverInfo {};
            driverInfo.asioVersion = 2;
            HWND window = create_asio_host_window();
            driverInfo.sysRef = window != nullptr ? window : GetDesktopWindow();
            if (ASIOInit(&driverInfo) == ASE_OK)
            {
                long inputChannels = 0;
                long outputChannels = 0;
                if (ASIOGetChannels(&inputChannels, &outputChannels) == ASE_OK && outputChannels > 0)
                {
                    info.outputChannels = static_cast<uint32_t>(std::min<long>(outputChannels, maxAsioOutputChannels));
                    std::string namesText;
                    for (long channel = 0; channel < static_cast<long>(info.outputChannels); ++channel)
                    {
                        ASIOChannelInfo channelInfo {};
                        channelInfo.channel = channel;
                        channelInfo.isInput = ASIOFalse;
                        if (ASIOGetChannelInfo(&channelInfo) == ASE_OK && channelInfo.name[0] != '\0')
                        {
                            char channelUtf8[128] {};
                            ansi_to_utf8(channelInfo.name, channelUtf8, static_cast<int>(sizeof(channelUtf8)));
                            if (channelUtf8[0] != '\0')
                            {
                                if (! namesText.empty())
                                    namesText += "|";
                                namesText += channelUtf8;
                            }
                        }
                    }
                    snprintf(info.outputChannelNames, sizeof(info.outputChannelNames), "%s", namesText.c_str());
                }
                ASIOExit();
                if (asioDrivers != nullptr)
                    asioDrivers->removeCurrentDriver();
            }
            if (window != nullptr)
                DestroyWindow(window);
        }

        devices.push_back(info);
    }

    return 0;
}

bool resolve_device_name(
    const std::vector<asio_device_info>& devices,
    const char* targetDeviceName,
    int targetDeviceIndex,
    char* selectedUtf8,
    size_t selectedUtf8Len)
{
    if (selectedUtf8 == nullptr || selectedUtf8Len == 0)
        return false;

    selectedUtf8[0] = '\0';

    if (targetDeviceIndex >= 0)
    {
        if (static_cast<size_t>(targetDeviceIndex) >= devices.size())
            return false;
        snprintf(selectedUtf8, selectedUtf8Len, "%s", devices[static_cast<size_t>(targetDeviceIndex)].name);
        selectedUtf8[selectedUtf8Len - 1] = '\0';
        return true;
    }

    if (targetDeviceName != nullptr && targetDeviceName[0] != '\0')
    {
        for (const auto& device : devices)
        {
            if (strcmp(device.name, targetDeviceName) == 0
                || contains_icase(device.name, targetDeviceName)
                || contains_icase(targetDeviceName, device.name))
            {
                snprintf(selectedUtf8, selectedUtf8Len, "%s", device.name);
                selectedUtf8[selectedUtf8Len - 1] = '\0';
                return true;
            }
        }
    }

    if (devices.empty())
        return false;

    snprintf(selectedUtf8, selectedUtf8Len, "%s", devices.front().name);
    selectedUtf8[selectedUtf8Len - 1] = '\0';
    return true;
}

void render_asio_output(long bufferIndex)
{
    asio_runtime* runtime = activeRuntime;
    if (runtime == nullptr || runtime->scratch == nullptr)
        return;

    const auto frames = static_cast<uint32_t>(std::max<long>(1, runtime->bufferSize));
    const auto sourceChannels = static_cast<uint32_t>(std::max<uint32_t>(1, runtime->sourceChannels));

    memset(runtime->scratch, 0, static_cast<size_t>(frames) * sourceChannels * sizeof(float));
    if (runtime->callback != nullptr)
        runtime->callback(runtime->userData, runtime->scratch, frames, sourceChannels);

    for (long channel = 0; channel < runtime->outputChannelCount; ++channel)
    {
        const long asioIndex = runtime->outputChannelOffset + channel;
        void* output = runtime->bufferInfos[asioIndex].buffers[bufferIndex];
        const ASIOSampleType sampleType = runtime->channelInfos[asioIndex].type;
        const auto sourceChannel = static_cast<uint32_t>(std::min<long>(channel, static_cast<long>(sourceChannels) - 1));

        for (long frame = 0; frame < runtime->bufferSize; ++frame)
        {
            const float sample = runtime->scratch[static_cast<size_t>(frame) * sourceChannels + sourceChannel];
            write_asio_sample(output, sampleType, frame, sample);
        }
    }

    if (runtime->postOutput)
        ASIOOutputReady();
}

void asio_buffer_switch(long index, ASIOBool processNow)
{
    (void)processNow;
    render_asio_output(index);
}

ASIOTime* asio_buffer_switch_time_info(ASIOTime* params, long index, ASIOBool processNow)
{
    (void)processNow;
    render_asio_output(index);
    return params;
}

void asio_sample_rate_changed(ASIOSampleRate sampleRate)
{
    if (activeRuntime != nullptr)
        activeRuntime->sampleRate = sampleRate;
}

long asio_messages(long selector, long value, void* message, double* opt)
{
    (void)message;
    (void)opt;

    switch (selector)
    {
        case kAsioSelectorSupported:
            return value == kAsioResetRequest
                || value == kAsioEngineVersion
                || value == kAsioResyncRequest
                || value == kAsioLatenciesChanged
                || value == kAsioSupportsTimeInfo
                || value == kAsioSupportsTimeCode
                || value == kAsioSupportsInputMonitor;
        case kAsioResetRequest:
        case kAsioResyncRequest:
        case kAsioLatenciesChanged:
            return 1L;
        case kAsioEngineVersion:
            return 2L;
        case kAsioSupportsTimeInfo:
            return 1L;
        case kAsioSupportsTimeCode:
        case kAsioSupportsInputMonitor:
            return 0L;
        default:
            return 0L;
    }
}

void prepare_buffer_infos(asio_runtime* runtime, bool includeInputs)
{
    memset(runtime->bufferInfos, 0, sizeof(runtime->bufferInfos));

    long index = 0;
    runtime->outputChannelOffset = 0;
    if (includeInputs)
    {
        for (long channel = 0; channel < runtime->inputChannelCount; ++channel, ++index)
        {
            runtime->bufferInfos[index].isInput = ASIOTrue;
            runtime->bufferInfos[index].channelNum = channel;
        }
        runtime->outputChannelOffset = runtime->inputChannelCount;
    }

    for (long channel = 0; channel < runtime->outputChannelCount; ++channel, ++index)
    {
        runtime->bufferInfos[index].isInput = ASIOFalse;
        runtime->bufferInfos[index].channelNum = runtime->outputChannelStart + channel;
    }

    runtime->totalChannelCount = index;
}

bool populate_channel_infos(asio_runtime* runtime, char* error, size_t errorLen)
{
    memset(runtime->channelInfos, 0, sizeof(runtime->channelInfos));

    for (long i = 0; i < runtime->totalChannelCount; ++i)
    {
        runtime->channelInfos[i].channel = runtime->bufferInfos[i].channelNum;
        runtime->channelInfos[i].isInput = runtime->bufferInfos[i].isInput;

        const ASIOError infoResult = ASIOGetChannelInfo(&runtime->channelInfos[i]);
        if (infoResult != ASE_OK)
        {
            char message[256] {};
            snprintf(
                message,
                sizeof(message),
                "ASIOGetChannelInfo failed driver=\"%s\" channel=%ld isInput=%ld error=%s(%ld)",
                runtime->selectedName,
                i,
                static_cast<long>(runtime->channelInfos[i].isInput),
                asio_error_name(infoResult),
                static_cast<long>(infoResult));
            set_error(error, errorLen, message);
            return false;
        }

        if (! runtime->channelInfos[i].isInput && ! asio_sample_type_supported(runtime->channelInfos[i].type))
        {
            char message[256] {};
            snprintf(
                message,
                sizeof(message),
                "unsupported ASIO output sample type driver=\"%s\" channel=%ld type=%ld",
                runtime->selectedName,
                i,
                static_cast<long>(runtime->channelInfos[i].type));
            set_error(error, errorLen, message);
            return false;
        }
    }

    return true;
}

bool create_buffers_with_candidates(
    asio_runtime* runtime,
    const std::vector<long>& candidates,
    char* error,
    size_t errorLen)
{
    std::vector<BufferAttempt> attempts;

    for (bool includeInputs : { true, false })
    {
        if (includeInputs && runtime->inputChannelCount <= 0)
            continue;

        for (long candidate : candidates)
        {
            prepare_buffer_infos(runtime, includeInputs);
            const ASIOError result = ASIOCreateBuffers(
                runtime->bufferInfos,
                runtime->totalChannelCount,
                candidate,
                &runtime->callbacks);

            if (result == ASE_OK)
            {
                runtime->bufferSize = candidate;
                runtime->buffersCreated = true;
                if (populate_channel_infos(runtime, error, errorLen))
                    return true;

                ASIODisposeBuffers();
                runtime->buffersCreated = false;
                continue;
            }

            attempts.push_back({ candidate, result });
            ASIODisposeBuffers();
        }
    }

    char message[768] {};
    snprintf(
        message,
        sizeof(message),
        "ASIOCreateBuffers failed driver=\"%s\" requestedRate=%u actualRate=%u min=%ld max=%ld preferred=%ld granularity=%ld attempts=",
        runtime->selectedName,
        static_cast<unsigned int>(runtime->requestedSampleRate),
        asio_sample_rate_to_uint32(runtime->sampleRate),
        runtime->minBufferSize,
        runtime->maxBufferSize,
        runtime->preferredBufferSize,
        runtime->granularity);
    set_error(error, errorLen, message);

    for (size_t i = 0; i < attempts.size(); ++i)
    {
        const auto& attempt = attempts[i];
        char attemptText[96] {};
        snprintf(
            attemptText,
            sizeof(attemptText),
            "%s%ld:%s(%ld)",
            i == 0 ? "" : ",",
            attempt.size,
            asio_error_name(attempt.error),
            static_cast<long>(attempt.error));
        append_error(error, errorLen, attemptText);
    }

    return false;
}

bool refresh_asio_buffer_size(asio_runtime* runtime, const char* label, char* error, size_t errorLen)
{
    long minBufferSize = 0;
    long maxBufferSize = 0;
    long preferredBufferSize = 0;
    long granularity = 0;
    const ASIOError result = ASIOGetBufferSize(
        &minBufferSize,
        &maxBufferSize,
        &preferredBufferSize,
        &granularity);

    if (result != ASE_OK || preferredBufferSize <= 0)
    {
        char message[256] {};
        snprintf(
            message,
            sizeof(message),
            "ASIOGetBufferSize failed %s error=%s(%ld)",
            label != nullptr ? label : "",
            asio_error_name(result),
            static_cast<long>(result));
        set_error(error, errorLen, message);
        return false;
    }

    runtime->minBufferSize = minBufferSize;
    runtime->maxBufferSize = maxBufferSize;
    runtime->preferredBufferSize = preferredBufferSize;
    runtime->granularity = granularity;

    fprintf(stderr,
        "[echo-audio-host] ASIOGetBufferSize %s: min=%ld max=%ld preferred=%ld granularity=%ld actual=%u\n",
        label != nullptr ? label : "refreshed",
        runtime->minBufferSize,
        runtime->maxBufferSize,
        runtime->preferredBufferSize,
        runtime->granularity,
        asio_sample_rate_to_uint32(runtime->sampleRate));

    return true;
}

bool retry_create_buffers_after_sample_rate_recovery(
    asio_runtime* runtime,
    ASIOSampleRate requestedRate,
    uint32_t requestedBufferFrames,
    char* error,
    size_t errorLen)
{
    if (refresh_asio_buffer_size(runtime, "after-create-failure", error, errorLen))
    {
        const auto refreshedCandidates = build_buffer_candidates(
            runtime->minBufferSize,
            runtime->maxBufferSize,
            runtime->preferredBufferSize,
            runtime->granularity,
            requestedBufferFrames);
        if (create_buffers_with_candidates(runtime, refreshedCandidates, error, errorLen))
            return true;

        fprintf(stderr,
            "[echo-audio-host] ASIOCreateBuffers retry after buffer refresh failed: %s\n",
            error != nullptr ? error : "");
    }

    for (ASIOSampleRate pivotRate : build_asio_sample_rate_pivot_candidates(requestedRate))
    {
        ASIOSampleRate recoveredRate = runtime->sampleRate;
        if (! try_asio_sample_rate_pivot(pivotRate, requestedRate, &recoveredRate))
        {
            runtime->sampleRate = recoveredRate;
            continue;
        }

        runtime->sampleRate = recoveredRate;
        if (! refresh_asio_buffer_size(runtime, "after-rate-pivot", error, errorLen))
            continue;

        const auto retryCandidates = build_buffer_candidates(
            runtime->minBufferSize,
            runtime->maxBufferSize,
            runtime->preferredBufferSize,
            runtime->granularity,
            requestedBufferFrames);
        if (create_buffers_with_candidates(runtime, retryCandidates, error, errorLen))
            return true;

        fprintf(stderr,
            "[echo-audio-host] ASIOCreateBuffers retry after pivot failed: pivot=%u requested=%u error=%s\n",
            asio_sample_rate_to_uint32(pivotRate),
            asio_sample_rate_to_uint32(requestedRate),
            error != nullptr ? error : "");
    }

    return false;
}

std::string output_format_summary(const asio_runtime* runtime)
{
    if (runtime == nullptr || runtime->outputChannelCount <= 0)
        return "unknown";

    const ASIOSampleType firstType = runtime->channelInfos[runtime->outputChannelOffset].type;
    for (long channel = 1; channel < runtime->outputChannelCount; ++channel)
    {
        if (runtime->channelInfos[runtime->outputChannelOffset + channel].type != firstType)
            return "mixed";
    }

    return asio_sample_type_name(firstType);
}
} // namespace

int asio_list_devices(asio_device_info** outDevices, uint32_t* outCount)
{
    if (outDevices == nullptr || outCount == nullptr)
        return -1;

    *outDevices = nullptr;
    *outCount = 0;

    std::vector<asio_device_info> devices;
    if (collect_asio_devices(devices) != 0)
        return -1;

    if (devices.empty())
        return 0;

    auto* copy = static_cast<asio_device_info*>(calloc(devices.size(), sizeof(asio_device_info)));
    if (copy == nullptr)
        return -1;

    memcpy(copy, devices.data(), devices.size() * sizeof(asio_device_info));
    *outDevices = copy;
    *outCount = static_cast<uint32_t>(devices.size());
    return 0;
}

void asio_free_devices(asio_device_info* devices)
{
    free(devices);
}

int asio_open_control_panel(
    const char* targetDeviceName,
    int targetDeviceIndex,
    char* error,
    size_t errorLen)
{
    if (error != nullptr && errorLen > 0)
        error[0] = '\0';

    std::vector<asio_device_info> devices;
    if (collect_asio_devices(devices) != 0 || devices.empty())
    {
        set_error(error, errorLen, "ASIO device enumeration returned no devices");
        return -1;
    }

    char selectedUtf8[512] {};
    if (! resolve_device_name(devices, targetDeviceName, targetDeviceIndex, selectedUtf8, sizeof(selectedUtf8)))
    {
        set_error(error, errorLen, "ASIO device not found");
        return -1;
    }

    char selectedAnsi[512] {};
    utf8_to_ansi(selectedUtf8, selectedAnsi, static_cast<int>(sizeof(selectedAnsi)));
    if (selectedAnsi[0] == '\0')
    {
        set_error(error, errorLen, "ASIO device name conversion failed");
        return -1;
    }

    if (! loadAsioDriver(selectedAnsi))
    {
        set_error(error, errorLen, "ASIO loadDriver failed");
        return -1;
    }

    ASIODriverInfo driverInfo {};
    driverInfo.asioVersion = 2;
    HWND window = create_asio_host_window();
    driverInfo.sysRef = window != nullptr ? window : GetDesktopWindow();

    const ASIOError initResult = ASIOInit(&driverInfo);
    if (initResult != ASE_OK)
    {
        if (window != nullptr)
            DestroyWindow(window);
        char message[512] {};
        snprintf(
            message,
            sizeof(message),
            "ASIOInit failed driver=\"%s\" error=%s(%ld)",
            selectedUtf8,
            asio_error_name(initResult),
            static_cast<long>(initResult));
        set_error(error, errorLen, message);
        return -1;
    }

    const ASIOError panelResult = ASIOControlPanel();
    ASIOExit();
    if (asioDrivers != nullptr)
        asioDrivers->removeCurrentDriver();
    if (window != nullptr)
        DestroyWindow(window);

    if (panelResult != ASE_OK)
    {
        char message[512] {};
        snprintf(
            message,
            sizeof(message),
            "ASIOControlPanel failed driver=\"%s\" error=%s(%ld)",
            selectedUtf8,
            asio_error_name(panelResult),
            static_cast<long>(panelResult));
        set_error(error, errorLen, message);
        return -1;
    }

    return 0;
}

int asio_start(
    const char* targetDeviceName,
    int targetDeviceIndex,
    uint32_t requestedSampleRate,
    uint32_t sourceChannels,
    uint32_t requestedBufferFrames,
    uint32_t outputChannelStart,
    asio_render_callback callback,
    void* userData,
    asio_runtime** outRuntime,
    asio_ready_info* outInfo,
    char* error,
    size_t errorLen)
{
    if (outRuntime == nullptr || outInfo == nullptr || callback == nullptr)
        return -1;

    *outRuntime = nullptr;
    memset(outInfo, 0, sizeof(*outInfo));
    if (error != nullptr && errorLen > 0)
        error[0] = '\0';

    if (activeRuntime != nullptr)
    {
        set_error(error, errorLen, "ASIO runtime already active");
        return -1;
    }

    std::vector<asio_device_info> devices;
    if (collect_asio_devices(devices) != 0 || devices.empty())
    {
        set_error(error, errorLen, "ASIO device enumeration returned no devices");
        return -1;
    }

    char selectedUtf8[512] {};
    if (! resolve_device_name(devices, targetDeviceName, targetDeviceIndex, selectedUtf8, sizeof(selectedUtf8)))
    {
        set_error(error, errorLen, "ASIO device not found");
        return -1;
    }

    char selectedAnsi[512] {};
    utf8_to_ansi(selectedUtf8, selectedAnsi, static_cast<int>(sizeof(selectedAnsi)));
    if (selectedAnsi[0] == '\0')
    {
        set_error(error, errorLen, "ASIO device name conversion failed");
        return -1;
    }

    auto* runtime = static_cast<asio_runtime*>(calloc(1, sizeof(asio_runtime)));
    if (runtime == nullptr)
    {
        set_error(error, errorLen, "failed to allocate ASIO runtime");
        return -1;
    }

    snprintf(runtime->selectedName, sizeof(runtime->selectedName), "%s", selectedUtf8);
    runtime->sourceChannels = std::max<uint32_t>(1, std::min<uint32_t>(sourceChannels, maxAsioOutputChannels));
    runtime->outputChannelStart = static_cast<long>(std::min<uint32_t>(outputChannelStart, static_cast<uint32_t>(maxAsioOutputChannels)));
    runtime->requestedSampleRate = requestedSampleRate;
    runtime->callback = callback;
    runtime->userData = userData;
    runtime->driverInfo.asioVersion = 2;
    runtime->sysRefWindow = create_asio_host_window();
    runtime->driverInfo.sysRef = runtime->sysRefWindow != nullptr ? runtime->sysRefWindow : GetDesktopWindow();

    fprintf(stderr, "[echo-audio-host] ASIO loadDriver starting: %s\n", selectedUtf8);
    if (! loadAsioDriver(selectedAnsi))
    {
        set_error(error, errorLen, "ASIO loadDriver failed");
        asio_stop(runtime);
        return -1;
    }
    fprintf(stderr, "[echo-audio-host] ASIO loadDriver completed: %s\n", selectedUtf8);

    fprintf(stderr, "[echo-audio-host] ASIOInit starting: %s\n", selectedUtf8);
    ASIOError result = ASIOInit(&runtime->driverInfo);
    if (result != ASE_OK)
    {
        char message[768] {};
        snprintf(
            message,
            sizeof(message),
            "ASIOInit failed driver=\"%s\" error=%s(%ld) driverMessage=\"%s\"",
            selectedUtf8,
            asio_error_name(result),
            static_cast<long>(result),
            runtime->driverInfo.errorMessage[0] != '\0' ? runtime->driverInfo.errorMessage : "(none)");
        set_error(error, errorLen, message);
        asio_stop(runtime);
        return -1;
    }
    runtime->initialized = true;
    fprintf(stderr, "[echo-audio-host] ASIOInit completed: %s\n", selectedUtf8);

    long availableInputChannels = 0;
    long availableOutputChannels = 0;
    fprintf(stderr, "[echo-audio-host] ASIOGetChannels starting: %s\n", selectedUtf8);
    result = ASIOGetChannels(&availableInputChannels, &availableOutputChannels);
    if (result != ASE_OK || availableOutputChannels <= 0)
    {
        set_error(error, errorLen, "ASIOGetChannels failed or no output channels available");
        asio_stop(runtime);
        return -1;
    }
    fprintf(stderr, "[echo-audio-host] ASIOGetChannels completed: inputs=%ld outputs=%ld\n", availableInputChannels, availableOutputChannels);

    fprintf(stderr, "[echo-audio-host] ASIOGetBufferSize starting: %s\n", selectedUtf8);
    if (! refresh_asio_buffer_size(runtime, "initial", error, errorLen))
    {
        asio_stop(runtime);
        return -1;
    }

    ASIOSampleRate requestedRate = asio_sample_rate_from_uint32(requestedSampleRate);
    ASIOSampleRate actualRate = requestedRate;
    fprintf(stderr, "[echo-audio-host] ASIO sample-rate negotiation starting: requested=%u\n", requestedSampleRate);
    const ASIOError sampleRateResult = set_asio_sample_rate_and_wait(requestedRate, &actualRate);
    runtime->sampleRate = actualRate;
    fprintf(stderr,
        "[echo-audio-host] ASIO sample-rate negotiation completed: requested=%u actual=%u result=%s(%ld)\n",
        requestedSampleRate,
        asio_sample_rate_to_uint32(actualRate),
        asio_error_name(sampleRateResult),
        static_cast<long>(sampleRateResult));
    if (! refresh_asio_buffer_size(runtime, "after-rate-negotiation", error, errorLen))
    {
        asio_stop(runtime);
        return -1;
    }

    if (runtime->outputChannelStart < 0 || runtime->outputChannelStart >= availableOutputChannels)
    {
        char message[256] {};
        snprintf(
            message,
            sizeof(message),
            "ASIO output channel start out of range driver=\"%s\" start=%ld availableOutputs=%ld",
            selectedUtf8,
            runtime->outputChannelStart,
            availableOutputChannels);
        set_error(error, errorLen, message);
        asio_stop(runtime);
        return -1;
    }

    runtime->inputChannelCount = std::min<long>(std::max<long>(0, availableInputChannels), maxAsioInputChannels);
    runtime->outputChannelCount = std::min<long>(
        std::max<long>(1, availableOutputChannels - runtime->outputChannelStart),
        std::min<long>(maxAsioOutputChannels, static_cast<long>(runtime->sourceChannels)));

    runtime->callbacks.bufferSwitch = asio_buffer_switch;
    runtime->callbacks.sampleRateDidChange = asio_sample_rate_changed;
    runtime->callbacks.asioMessage = asio_messages;
    runtime->callbacks.bufferSwitchTimeInfo = asio_buffer_switch_time_info;
    fprintf(stderr, "[echo-audio-host] ASIOOutputReady probe starting: %s\n", selectedUtf8);
    runtime->postOutput = ASIOOutputReady() == ASE_OK ? ASIOTrue : ASIOFalse;
    fprintf(stderr, "[echo-audio-host] ASIOOutputReady probe completed: supported=%ld\n", static_cast<long>(runtime->postOutput));

    const auto candidates = build_buffer_candidates(
        runtime->minBufferSize,
        runtime->maxBufferSize,
        runtime->preferredBufferSize,
        runtime->granularity,
        requestedBufferFrames);

    activeRuntime = runtime;
    fprintf(stderr, "[echo-audio-host] ASIOCreateBuffers attempts starting: %s\n", selectedUtf8);
    if (! create_buffers_with_candidates(runtime, candidates, error, errorLen))
    {
        const std::string firstCreateBuffersError = error != nullptr ? error : "";
        fprintf(stderr,
            "[echo-audio-host] ASIOCreateBuffers initial attempt failed: %s\n",
            firstCreateBuffersError.c_str());

        if (! retry_create_buffers_after_sample_rate_recovery(runtime, requestedRate, requestedBufferFrames, error, errorLen))
        {
            activeRuntime = nullptr;
            asio_stop(runtime);
            return -1;
        }
    }
    fprintf(stderr, "[echo-audio-host] ASIOCreateBuffers completed: buffer=%ld\n", runtime->bufferSize);

    runtime->scratch = static_cast<float*>(calloc(
        static_cast<size_t>(runtime->bufferSize) * runtime->sourceChannels,
        sizeof(float)));
    if (runtime->scratch == nullptr)
    {
        set_error(error, errorLen, "failed to allocate ASIO render scratch buffer");
        activeRuntime = nullptr;
        asio_stop(runtime);
        return -1;
    }

    fprintf(stderr, "[echo-audio-host] ASIOStart starting: %s\n", selectedUtf8);
    result = ASIOStart();
    if (result != ASE_OK)
    {
        char message[256] {};
        snprintf(message, sizeof(message), "ASIOStart failed error=%s(%ld)", asio_error_name(result), static_cast<long>(result));
        set_error(error, errorLen, message);
        activeRuntime = nullptr;
        asio_stop(runtime);
        return -1;
    }
    runtime->started = true;
    fprintf(stderr, "[echo-audio-host] ASIOStart completed: %s\n", selectedUtf8);

    outInfo->sampleRate = asio_sample_rate_to_uint32(runtime->sampleRate);
    outInfo->channels = static_cast<uint32_t>(runtime->outputChannelCount);
    outInfo->bufferFrameCount = static_cast<uint32_t>(runtime->bufferSize);
    outInfo->requestedBufferFrameCount = requestedBufferFrames > 0
        ? requestedBufferFrames
        : static_cast<uint32_t>(runtime->bufferSize);
    outInfo->inputChannels = static_cast<uint32_t>(availableInputChannels);
    outInfo->outputChannels = static_cast<uint32_t>(availableOutputChannels);
    outInfo->minBufferFrames = static_cast<uint32_t>(std::max<long>(0, runtime->minBufferSize));
    outInfo->maxBufferFrames = static_cast<uint32_t>(std::max<long>(0, runtime->maxBufferSize));
    outInfo->preferredBufferFrames = static_cast<uint32_t>(std::max<long>(0, runtime->preferredBufferSize));
    outInfo->granularity = static_cast<int32_t>(runtime->granularity);
    outInfo->outputChannelStart = static_cast<uint32_t>(runtime->outputChannelStart);
    snprintf(outInfo->format, sizeof(outInfo->format), "%s", output_format_summary(runtime).c_str());
    snprintf(outInfo->deviceName, sizeof(outInfo->deviceName), "%s", runtime->selectedName);

    *outRuntime = runtime;
    return 0;
}

void asio_stop(asio_runtime* runtime)
{
    if (runtime == nullptr)
        return;

    if (runtime->started)
    {
        ASIOStop();
        runtime->started = false;
    }

    if (runtime->buffersCreated)
    {
        ASIODisposeBuffers();
        runtime->buffersCreated = false;
    }

    if (runtime->initialized)
    {
        ASIOExit();
        runtime->initialized = false;
    }

    if (activeRuntime == runtime)
        activeRuntime = nullptr;

    if (runtime->sysRefWindow != nullptr)
    {
        DestroyWindow(runtime->sysRefWindow);
        runtime->sysRefWindow = nullptr;
    }

    free(runtime->scratch);
    runtime->scratch = nullptr;
    free(runtime);
}

#ifdef ECHO_AUDIO_ENGINE_TESTS
uint32_t asio_build_buffer_candidates_for_tests(
    long minSize,
    long maxSize,
    long preferredSize,
    long granularity,
    uint32_t requestedBufferFrames,
    uint32_t* outCandidates,
    uint32_t maxCandidates)
{
    const auto candidates = build_buffer_candidates(minSize, maxSize, preferredSize, granularity, requestedBufferFrames);
    const auto count = static_cast<uint32_t>(std::min<size_t>(candidates.size(), maxCandidates));

    if (outCandidates != nullptr)
    {
        for (uint32_t i = 0; i < count; ++i)
            outCandidates[i] = static_cast<uint32_t>(candidates[i]);
    }

    return count;
}

const char* asio_error_name_for_tests(long error)
{
    return asio_error_name(static_cast<ASIOError>(error));
}

uint32_t asio_build_sample_rate_pivot_candidates_for_tests(
    double requestedSampleRate,
    uint32_t* outCandidates,
    uint32_t maxCandidates)
{
    const auto candidates = build_asio_sample_rate_pivot_candidates(requestedSampleRate);
    const auto count = static_cast<uint32_t>(std::min<size_t>(candidates.size(), maxCandidates));

    if (outCandidates != nullptr)
    {
        for (uint32_t i = 0; i < count; ++i)
            outCandidates[i] = asio_sample_rate_to_uint32(candidates[i]);
    }

    return count;
}

void asio_write_sample_for_tests(void* buffer, long sampleType, long frameIndex, float sample)
{
    write_asio_sample(buffer, static_cast<ASIOSampleType>(sampleType), frameIndex, sample);
}
#endif

#endif
