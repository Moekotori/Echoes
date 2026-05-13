export const getEchoBridge = (): Window['echo'] | null => window.echo ?? null;

export const getAppBridge = (): Window['echo']['app'] | null => getEchoBridge()?.app ?? null;

export const getAudioBridge = (): Window['echo']['audio'] | null => getEchoBridge()?.audio ?? null;

export const getDiagnosticsBridge = (): Window['echo']['diagnostics'] | null => getEchoBridge()?.diagnostics ?? null;

export const getEqBridge = (): Window['echo']['eq'] | null => getEchoBridge()?.eq ?? null;

export const getLibraryBridge = (): Window['echo']['library'] | null => getEchoBridge()?.library ?? null;

export const getPlaybackBridge = (): Window['echo']['playback'] | null => getEchoBridge()?.playback ?? null;
