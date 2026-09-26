/**
 * Device profiles. The network numbers are Lighthouse's, including the
 * adjustments it applies when throttling in DevTools, where latency is added
 * per request rather than per round trip:
 * https://github.com/GoogleChrome/lighthouse/blob/main/core/config/constants.js
 */

/** Lighthouse's DEVTOOLS_RTT_ADJUSTMENT_FACTOR and DEVTOOLS_THROUGHPUT_ADJUSTMENT_FACTOR. */
const RTT_FACTOR = 3.75;
const THROUGHPUT_FACTOR = 0.9;

export const PROFILES = {
    mobile: {
        id: 'mobile',
        label: 'Mobile: slow 4G, 4× CPU slowdown, touch',
        cpuSlowdown: 4,
        // Lighthouse's mobileSlow4G.
        network: { rttMs: 150, downloadKbps: 1.6 * 1024, uploadKbps: 750 },
        // Lighthouse's default mobile screen (Moto G Power).
        context: {
            viewport: { width: 412, height: 823 },
            deviceScaleFactor: 1.75,
            isMobile: true,
            hasTouch: true,
            userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{version} Mobile Safari/537.36',
        },
        // A finger rests on the screen for about 80 ms in a tap.
        input: { kind: 'touch', holdMs: 80, hoverMs: 0 },
    },
    desktop: {
        id: 'desktop',
        label: 'Desktop: fast connection, no CPU slowdown, mouse',
        cpuSlowdown: 1,
        // Lighthouse's desktopDense4G, with the same DevTools adjustments as mobile.
        network: { rttMs: 40, downloadKbps: 10 * 1024, uploadKbps: 10 * 1024 },
        context: {
            viewport: { width: 1350, height: 940 },
            deviceScaleFactor: 1,
            isMobile: false,
            hasTouch: false,
        },
        // The pointer comes to rest on the target 100 ms before the button goes
        // down, which is on the short side of measured hover-to-click times.
        input: { kind: 'mouse', holdMs: 80, hoverMs: 100 },
    },
};

/** Parameters for CDP's Network.emulateNetworkConditions. */
export function networkConditions({ network }) {
    return {
        offline: false,
        latency: network.rttMs * RTT_FACTOR,
        downloadThroughput: Math.floor((network.downloadKbps * THROUGHPUT_FACTOR * 1024) / 8),
        uploadThroughput: Math.floor((network.uploadKbps * THROUGHPUT_FACTOR * 1024) / 8),
    };
}

/** Playwright context options for a profile and browser version. */
export function contextOptions(profile, browserVersion) {
    const { userAgent, ...rest } = profile.context;
    const major = String(browserVersion).split('.')[0];
    return userAgent ? { ...rest, userAgent: userAgent.replace('{version}', `${major}.0.0.0`) } : rest;
}

/**
 * What results record about a profile. `shaping` says how the network was
 * slowed: by DevTools, per request (the default), or by netem, per packet.
 */
export function describe(profile) {
    const { id, label, cpuSlowdown, network, context, input, shaping = 'devtools' } = profile;
    const conditions = networkConditions(profile);
    return {
        id,
        label,
        cpuSlowdown,
        network: shaping === 'netem'
            ? { ...network, shaping }
            : { ...network, shaping, requestLatencyMs: conditions.latency, downloadBytesPerSecond: conditions.downloadThroughput, uploadBytesPerSecond: conditions.uploadThroughput },
        viewport: context.viewport,
        deviceScaleFactor: context.deviceScaleFactor,
        input,
    };
}
