export interface ProxyConfig {
  type: 'none' | 'http' | 'https' | 'socks5';
  host: string;
  port: string;
  username: string;
  password: string;
}

export interface MediaDeviceCounts {
  micros: number;
  webcams: number;
  speakers: number;
}

export interface Fingerprint {
  os: string;
  osVersion: string;
  browserVersion: string;
  screenResolution: string;
  language: string;
  timezone: string;
  webglVendor: string;
  webglRenderer: string;
  hardwareConcurrency: number;
  deviceMemory: number;
  canvasNoise: boolean;
  audioNoise: boolean;
  webrtcMode: 'real' | 'disabled' | 'altered';
  userAgent: string;
  // ── Optional so profiles saved before these existed still load.
  //    Everything that reads them falls back to a sane default.
  /** Spoof WebGL vendor/renderer. Off = report the real GPU. */
  webglSpoof?: boolean;
  /** Report a synthetic enumerateDevices() list instead of the real hardware. */
  mediaSpoof?: boolean;
  mediaDevices?: MediaDeviceCounts;
  /** Report an OS-consistent font list instead of the fonts actually installed. */
  fontSpoof?: boolean;
  /** Sub-pixel jitter applied to text metrics. Same seed = same measurements. */
  fontSpacingSeed?: number;
}

export interface BrowserProfile {
  id: string;
  name: string;
  group: string;
  status: 'ready' | 'running' | 'error';
  createdAt: string;
  lastUsed: string;
  proxy: ProxyConfig;
  fingerprint: Fingerprint;
  notes: string;
  color: string;
  /** Kept for older saved profiles. New profiles always use Google —
   *  the picker was removed from the editor. */
  searchEngine?: 'DuckDuckGo' | 'Google' | 'Bing' | 'Brave';
  locked?: boolean;
  lockPin?: string;
}

export interface ProfileGroup {
  id: string;
  name: string;
  color: string;
  profileIds: string[];
}

export type ModalType = 'editor' | 'import' | 'export' | 'delete' | null;
export type ViewType = 'profiles' | 'groups' | 'proxies' | 'settings';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export interface BrowserDownloadProgress {
  status: 'idle' | 'resolving' | 'downloading' | 'extracting' | 'done' | 'error';
  percent?: number;
  speed?: string;
  downloaded?: string;
  total?: string;
  error?: string;
}

export interface ElectronAPI {
  windowMinimize: () => void;
  windowMaximize: () => void;
  windowClose: () => void;
  auth: {
    setToken: (token: string) => void;
    getToken: () => string | null;
    clearToken: () => void;
  };
  browser: {
    checkInstalled: () => Promise<boolean>;
    launch: (profileId: string, config: any) => Promise<{ success: boolean; error?: string }>;
    /** Kills the browser tree for this profile. Resolves true once it is gone. */
    stop: (profileId: string) => Promise<boolean>;
    stopAll: () => Promise<number>;
    /** IDs of profiles the OS says are running right now. */
    listActive: () => Promise<string[]>;
    isRunning: (profileId: string) => Promise<boolean>;
    download: () => Promise<{ success: boolean; error?: string }>;
    // Each of these returns an unsubscribe function.
    onDownloadProgress: (callback: (data: BrowserDownloadProgress) => void) => (() => void);
    onProfileStarted: (callback: (profileId: string) => void) => (() => void);
    onProfileStopped: (callback: (profileId: string) => void) => (() => void);
    onActiveChanged: (callback: (profileIds: string[]) => void) => (() => void);
  };
  quit: () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
