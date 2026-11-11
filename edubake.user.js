// ==UserScript==
// @name         EduBake
// @namespace    http://tampermonkey.net/
// @version      2.3.0
// @description  EduBake: quiz interface, themes, saved backgrounds, study tools and version update notes.
// @author       Henry & Grok
// @match        https://my.educake.co.uk/*
// @icon         https://www.google.com/s2/favicons?domain=educake.co.uk
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 1: SYSTEM DEFINITIONS, METADATA & SCHEMA CONFIGURATION
    // ─────────────────────────────────────────────────────────────────────────

    const SCRIPT_NAME = 'EduBake';
    const SCRIPT_VERSION = '2.3.0';
    const RELEASE_NOTES = [
        'New: update notes appear once per version, with a What’s new button in Settings.',
        'Fixed: background replacement, stale background loads and missing cached images.',
        'Fixed: storage errors are caught and reported instead of appearing to save successfully.',
        'Fixed: settings apply immediately; disabling QuizUI removes its controls.',
        'Improved: keyboard-friendly dialogs, safe text rendering and reduced-motion support.',
        'Fixed: exported database downloads release their temporary resources.'
    ];
    const STORAGE_KEY_CONFIG = 'edubake_v2_system_config';
    const STORAGE_KEY_CACHE = 'edubake_v2_answer_knowledge_base';
    const INDEXEDDB_NAME = 'EduBake_Asset_Storage';
    const INDEXEDDB_STORE_BLOBS = 'background_blobs';
    const INDEXEDDB_VERSION = 1;

    const ACCENT_PRESETS = {
        blue: '#3b82f6',
        purple: '#8b5cf6',
        green: '#10b981',
        pink: '#ec4899',
        orange: '#f59e0b',
        red: '#ef4444'
    };

    const DEFAULT_CONFIG = {
        // Visual Styling & Layout
        realDark: true,
        transparentUI: true,
        accentPreset: 'blue', // 'blue' | 'purple' | 'green' | 'pink' | 'orange' | 'red' | 'custom' | 'rainbow'
        customAccentColor: '#3b82f6',
        rainbowSpeed: 'normal', // 'slow' | 'normal' | 'fast'
        rainbowEffect: 'ambient', // 'ambient' | 'strobe' | 'cycle'

        // Background Engine Settings (Non-Base64 IndexedDB / Direct URL Architecture)
        bgType: 'none', // 'none' | 'url' | 'indexeddb'
        bgSourceUrl: '', // Original URL supplied by user
        bgActiveBlobKey: 'primary_background',

        // Cursor & Particle Engine
        cursorStyle: 'shiny-dot', // 'none' | 'shiny-dot' | 'crosshair' | 'custom'
        customCursorUrl: '',

        // QuizUI 2.0 Interface
        quizUI2: true,

        // Automation (Autopilot & AnswerBot)
        autoAnswer: false,
        autoSubmit: false,
        accuracyPercent: 90,
        minDelaySec: 2,
        maxDelaySec: 4,

        // Scoring, Accuracy & Safeguards
        showWrong: true,
        maxAllowedWrong: 8,

        // Layout Overrides
        hideTopHeader: false,
        hideNavBar: false
    };

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 2: STRUCTURED DIAGNOSTIC TELEMETRY & LOGGER
    // ─────────────────────────────────────────────────────────────────────────

    const Logger = {
        prefix: `[${SCRIPT_NAME}]`,

        info: function (...args) {
            console.log(
                `%c${this.prefix}%c`,
                'background: #2563eb; color: #ffffff; font-weight: bold; padding: 2px 5px; border-radius: 3px;',
                '',
                ...args
            );
        },

        success: function (...args) {
            console.log(
                `%c${this.prefix}%c`,
                'background: #10b981; color: #ffffff; font-weight: bold; padding: 2px 5px; border-radius: 3px;',
                '',
                ...args
            );
        },

        warn: function (...args) {
            console.warn(
                `%c${this.prefix}%c`,
                'background: #f59e0b; color: #000000; font-weight: bold; padding: 2px 5px; border-radius: 3px;',
                '',
                ...args
            );
        },

        error: function (...args) {
            console.error(
                `%c${this.prefix}%c`,
                'background: #ef4444; color: #ffffff; font-weight: bold; padding: 2px 5px; border-radius: 3px;',
                '',
                ...args
            );
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 3: INDEXEDDB HIGH-CAPACITY BINARY BLOB ENGINE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Complete non-Base64 persistent binary storage via native IndexedDB.
     * Stores images as raw Blobs; browser storage quotas still apply.
     */
    const IndexedDBStorage = {
        dbInstance: null,

        open: function () {
            return new Promise((resolve, reject) => {
                if (this.dbInstance) {
                    return resolve(this.dbInstance);
                }

                if (typeof indexedDB === 'undefined') {
                    return reject(new Error('IndexedDB is not supported in this browser.'));
                }

                const request = indexedDB.open(INDEXEDDB_NAME, INDEXEDDB_VERSION);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(INDEXEDDB_STORE_BLOBS)) {
                        db.createObjectStore(INDEXEDDB_STORE_BLOBS);
                    }
                };

                request.onsuccess = (event) => {
                    this.dbInstance = event.target.result;
                    resolve(this.dbInstance);
                };

                request.onerror = (event) => {
                    reject(new Error(`Failed to open IndexedDB: ${event.target.error}`));
                };
            });
        },

        putBlob: async function (key, blob) {
            try {
                const db = await this.open();
                return await new Promise((resolve, reject) => {
                    const transaction = db.transaction([INDEXEDDB_STORE_BLOBS], 'readwrite');
                    const store = transaction.objectStore(INDEXEDDB_STORE_BLOBS);
                    const request = store.put(blob, key);

                    transaction.oncomplete = () => resolve(true);
                    transaction.onabort = () => reject(transaction.error || new Error("Storage transaction aborted"));
                    request.onerror = (e) => reject(e.target.error);
                });
            } catch (err) {
                Logger.error('IndexedDB putBlob error:', err);
                return false;
            }
        },

        getBlob: async function (key) {
            try {
                const db = await this.open();
                return await new Promise((resolve, reject) => {
                    const transaction = db.transaction([INDEXEDDB_STORE_BLOBS], 'readonly');
                    const store = transaction.objectStore(INDEXEDDB_STORE_BLOBS);
                    const request = store.get(key);

                    request.onsuccess = () => resolve(request.result || null);
                    request.onerror = (e) => reject(e.target.error);
                });
            } catch (err) {
                Logger.error('IndexedDB getBlob error:', err);
                return null;
            }
        },

        deleteBlob: async function (key) {
            try {
                const db = await this.open();
                return await new Promise((resolve, reject) => {
                    const transaction = db.transaction([INDEXEDDB_STORE_BLOBS], 'readwrite');
                    const store = transaction.objectStore(INDEXEDDB_STORE_BLOBS);
                    const request = store.delete(key);

                    transaction.oncomplete = () => resolve(true);
                    transaction.onabort = () => reject(transaction.error || new Error("Storage transaction aborted"));
                    request.onerror = (e) => reject(e.target.error);
                });
            } catch (err) {
                Logger.error('IndexedDB deleteBlob error:', err);
                return false;
            }
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 4: SYNCHRONOUS CONFIG & KNOWLEDGE BASE STORAGE
    // ─────────────────────────────────────────────────────────────────────────

    const StorageEngine = {
        getConfig: function () {
            try {
                let raw = null;
                if (typeof GM_getValue !== 'undefined') {
                    raw = GM_getValue(STORAGE_KEY_CONFIG, null);
                }
                if (!raw && typeof localStorage !== 'undefined') {
                    raw = localStorage.getItem(STORAGE_KEY_CONFIG);
                }
                if (raw) {
                    const parsed = JSON.parse(raw);
                    return { ...DEFAULT_CONFIG, ...parsed };
                }
            } catch (err) {
                Logger.warn('Failed to parse config from persistent storage; using defaults.', err);
            }
            return { ...DEFAULT_CONFIG };
        },

        saveConfig: function (cfg) {
            try {
                // Ensure no large blobs are ever serialized into config
                const cleanCfg = { ...cfg };
                delete cleanCfg.bgData; // strictly eradicate Base64 blobs from config

                const serialized = JSON.stringify(cleanCfg);

                if (typeof GM_setValue !== 'undefined') {
                    GM_setValue(STORAGE_KEY_CONFIG, serialized);
                }

                if (typeof localStorage !== 'undefined') {
                    try {
                        localStorage.setItem(STORAGE_KEY_CONFIG, serialized);
                    } catch (quotaErr) {
                        Logger.warn('LocalStorage quota limit reached; config saved securely in GM storage.');
                    }
                }
            } catch (err) {
                Logger.error('Critical failure writing configuration to storage.', err);
            }
            applyTheme();
            syncAllUIControls();
            schedulePass();
        },

        getAnswerDatabase: function () {
            try {
                let raw = null;
                if (typeof GM_getValue !== 'undefined') {
                    raw = GM_getValue(STORAGE_KEY_CACHE, null);
                }
                if (!raw && typeof localStorage !== 'undefined') {
                    raw = localStorage.getItem(STORAGE_KEY_CACHE);
                }
                if (raw) {
                    return JSON.parse(raw);
                }
            } catch (err) {
                Logger.warn('Failed to parse answer database.', err);
            }
            return {};
        },

        saveAnswerDatabase: function (dbObj) {
            try {
                const serialized = JSON.stringify(dbObj);

                if (typeof GM_setValue !== 'undefined') {
                    GM_setValue(STORAGE_KEY_CACHE, serialized);
                }

                if (typeof localStorage !== 'undefined') {
                    try {
                        localStorage.setItem(STORAGE_KEY_CACHE, serialized);
                    } catch (quotaErr) {
                        Logger.warn('Answer database exceeded localStorage 5MB quota. Preserved safely in Tampermonkey storage.');
                    }
                }
            } catch (err) {
                Logger.error('Critical failure writing answer database to storage.', err);
            }
        }
    };

    let config = StorageEngine.getConfig();

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 5: 20-STAGE RESILIENT ASSET RETRIEVAL & PROXY PIPELINE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Executes a 20-stage sequential fallback pipeline to load any image or GIF
     * without CORS blocks, CSP blocks, or data URI length restrictions.
     */
    const AssetPipeline = {
        sanitizeUrl: function (url) {
            if (!url || typeof url !== 'string') return '';
            return url.trim().replace(/^['"]|['"]$/g, '');
        },

        createBlobFromBuffer: function (buffer, contentType) {
            return new Blob([buffer], { type: contentType || 'image/jpeg' });
        },

        createStagePromise: function (stageIndex, description, taskFn) {
            return new Promise(async (resolve, reject) => {
                try {
                    Logger.info(`Testing Asset Loader Stage [${stageIndex}/20]: ${description}`);
                    const result = await taskFn();
                    if (result instanceof Blob) {
                        const url = URL.createObjectURL(result);
                        try { await new Promise((res, rej) => { const img = new Image(); const timer = setTimeout(() => rej(new Error('Image decode timeout')), 10000); img.onload = () => { clearTimeout(timer); res(); }; img.onerror = () => { clearTimeout(timer); rej(new Error('Response is not an image')); }; img.src = url; }); } finally { URL.revokeObjectURL(url); }
                    }
                    if (result && (result instanceof Blob || typeof result === 'string')) {
                        Logger.success(`Asset Loader Stage [${stageIndex}/20] SUCCESS: ${description}`);
                        return resolve({ stage: stageIndex, data: result });
                    }
                    reject(new Error(`Stage ${stageIndex} returned invalid data.`));
                } catch (e) {
                    reject(e);
                }
            });
        },

        executePipeline: async function (targetUrl) {
            const rawUrl = this.sanitizeUrl(targetUrl);
            if (!rawUrl) throw new Error('No target URL provided to AssetPipeline.');

            const encoded = encodeURIComponent(rawUrl);
            const strippedProtocol = rawUrl.replace(/^https?:\/\//i, '');

            // Fallback Stage Handlers (20 Stages)
            const stages = [
                // 1. Direct GM_xmlhttpRequest Blob
                () => new Promise((res, rej) => {
                    GM_xmlhttpRequest({
                        timeout: 10000,
                        ontimeout: () => rej(new Error('Request timed out')),
                        method: 'GET',
                        url: rawUrl,
                        responseType: 'blob',
                        onload: (r) => (r.status >= 200 && r.status < 300) ? res(r.response) : rej(r.status),
                        onerror: rej,
                        ontimeout: rej
                    });
                }),

                // 2. Direct GM_xmlhttpRequest ArrayBuffer -> Blob
                () => new Promise((res, rej) => {
                    GM_xmlhttpRequest({
                        timeout: 10000,
                        ontimeout: () => rej(new Error('Request timed out')),
                        method: 'GET',
                        url: rawUrl,
                        responseType: 'arraybuffer',
                        onload: (r) => {
                            if (r.status >= 200 && r.status < 300) {
                                const type = r.responseHeaders.match(/content-type:\s*(.+)/i)?.[1] || 'image/png';
                                res(new Blob([r.response], { type }));
                            } else rej(r.status);
                        },
                        onerror: rej
                    });
                }),

                // 3. WeServ Image Optimizer & CDN Proxy
                () => new Promise((res, rej) => {
                    GM_xmlhttpRequest({
                        timeout: 10000,
                        ontimeout: () => rej(new Error('Request timed out')),
                        method: 'GET',
                        url: `https://images.weserv.nl/?url=${encoded}&output=png`,
                        responseType: 'blob',
                        onload: (r) => (r.status === 200) ? res(r.response) : rej(r.status),
                        onerror: rej
                    });
                }),

                // 4. WeServ Direct HTTPS Fallback
                () => new Promise((res, rej) => {
                    GM_xmlhttpRequest({
                        timeout: 10000,
                        ontimeout: () => rej(new Error('Request timed out')),
                        method: 'GET',
                        url: `https://images.weserv.nl/?url=ssl:${strippedProtocol}`,
                        responseType: 'blob',
                        onload: (r) => (r.status === 200) ? res(r.response) : rej(r.status),
                        onerror: rej
                    });
                }),

                // 5. CorsProxy.io Endpoint
                () => new Promise((res, rej) => {
                    GM_xmlhttpRequest({
                        timeout: 10000,
                        ontimeout: () => rej(new Error('Request timed out')),
                        method: 'GET',
                        url: `https://corsproxy.io/?${encoded}`,
                        responseType: 'blob',
                        onload: (r) => (r.status === 200) ? res(r.response) : rej(r.status),
                        onerror: rej
                    });
                }),

                // 6. AllOrigins Raw Proxy
                () => new Promise((res, rej) => {
                    GM_xmlhttpRequest({
                        timeout: 10000,
                        ontimeout: () => rej(new Error('Request timed out')),
                        method: 'GET',
                        url: `https://api.allorigins.win/raw?url=${encoded}`,
                        responseType: 'blob',
                        onload: (r) => (r.status === 200) ? res(r.response) : rej(r.status),
                        onerror: rej
                    });
                }),

                // 7. CodeTabs CORS Bypass
                () => new Promise((res, rej) => {
                    GM_xmlhttpRequest({
                        timeout: 10000,
                        ontimeout: () => rej(new Error('Request timed out')),
                        method: 'GET',
                        url: `https://api.codetabs.com/v1/proxy?quest=${encoded}`,
                        responseType: 'blob',
                        onload: (r) => (r.status === 200) ? res(r.response) : rej(r.status),
                        onerror: rej
                    });
                }),

                // 8. ThingProxy Freeboard Fetch
                () => new Promise((res, rej) => {
                    GM_xmlhttpRequest({
                        timeout: 10000,
                        ontimeout: () => rej(new Error('Request timed out')),
                        method: 'GET',
                        url: `https://thingproxy.freeboard.io/fetch/${rawUrl}`,
                        responseType: 'blob',
                        onload: (r) => (r.status === 200) ? res(r.response) : rej(r.status),
                        onerror: rej
                    });
                }),

                // 9. Statically Image CDN Relay
                () => new Promise((res, rej) => {
                    GM_xmlhttpRequest({
                        timeout: 10000,
                        ontimeout: () => rej(new Error('Request timed out')),
                        method: 'GET',
                        url: `https://cdn.statically.io/img/${strippedProtocol}`,
                        responseType: 'blob',
                        onload: (r) => (r.status === 200) ? res(r.response) : rej(r.status),
                        onerror: rej
                    });
                }),

                // 10. Cache-Bust Direct GM_xhr
                () => new Promise((res, rej) => {
                    const cbUrl = rawUrl + (rawUrl.includes('?') ? '&' : '?') + `_eb_ts=${Date.now()}`;
                    GM_xmlhttpRequest({
                        timeout: 10000,
                        ontimeout: () => rej(new Error('Request timed out')),
                        method: 'GET',
                        url: cbUrl,
                        responseType: 'blob',
                        onload: (r) => (r.status === 200) ? res(r.response) : rej(r.status),
                        onerror: rej
                    });
                }),

                // 11. Native fetch() Blob
                () => fetch(rawUrl, { mode: 'cors' }).then(r => {
                    if (!r.ok) throw new Error(`${r.status}`);
                    return r.blob();
                }),

                // 12. Native fetch() with Cache Bypass
                () => fetch(rawUrl, { cache: 'reload', mode: 'cors' }).then(r => {
                    if (!r.ok) throw new Error(`${r.status}`);
                    return r.blob();
                }),

                // 13. HTML5 Canvas Pixel Extraction
                () => new Promise((res, rej) => {
                    const img = new Image();
                    img.crossOrigin = 'Anonymous';
                    img.onload = () => {
                        try {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.naturalWidth || img.width;
                            canvas.height = img.naturalHeight || img.height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0);
                            canvas.toBlob(blob => blob ? res(blob) : rej(new Error('Canvas blob failed')), 'image/png');
                        } catch (err) {
                            rej(err);
                        }
                    };
                    img.onerror = rej;
                    img.src = rawUrl;
                }),

                // 14. AllOrigins JSON Wrapped ArrayBuffer
                () => new Promise((res, rej) => {
                    GM_xmlhttpRequest({
                        timeout: 10000,
                        ontimeout: () => rej(new Error('Request timed out')),
                        method: 'GET',
                        url: `https://api.allorigins.win/get?url=${encoded}`,
                        responseType: 'json',
                        onload: (r) => {
                            if (r.status === 200 && r.response?.contents) {
                                res(r.response.contents); // data URL or text
                            } else rej(r.status);
                        },
                        onerror: rej
                    });
                }),

                // 15. Standard Image Preloader Validation
                () => new Promise((res, rej) => {
                    const img = new Image();
                    img.onload = () => res(rawUrl);
                    img.onerror = rej;
                    img.src = rawUrl;
                }),

                // 16. WeServ Uncompressed GIF Mode
                () => new Promise((res, rej) => {
                    GM_xmlhttpRequest({
                        timeout: 10000,
                        ontimeout: () => rej(new Error('Request timed out')),
                        method: 'GET',
                        url: `https://images.weserv.nl/?url=${encoded}&n=-1`,
                        responseType: 'blob',
                        onload: (r) => (r.status === 200) ? res(r.response) : rej(r.status),
                        onerror: rej
                    });
                }),

                // 17. Statically WEBP Transformation
                () => new Promise((res, rej) => {
                    GM_xmlhttpRequest({
                        timeout: 10000,
                        ontimeout: () => rej(new Error('Request timed out')),
                        method: 'GET',
                        url: `https://cdn.statically.io/img/${strippedProtocol}?f=auto`,
                        responseType: 'blob',
                        onload: (r) => (r.status === 200) ? res(r.response) : rej(r.status),
                        onerror: rej
                    });
                }),

                // 18. JSDelivr Mirror (if GitHub asset)
                () => new Promise((res, rej) => {
                    if (rawUrl.includes('raw.githubusercontent.com')) {
                        const ghPath = rawUrl.replace('https://raw.githubusercontent.com/', '');
                        const parts = ghPath.split('/');
                        const user = parts[0];
                        const repo = parts[1];
                        const branch = parts[2];
                        const file = parts.slice(3).join('/');
                        const cdnUrl = `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${file}`;
                        GM_xmlhttpRequest({
                            timeout: 10000,
                        ontimeout: () => rej(new Error('Request timed out')),
                        method: 'GET',
                            url: cdnUrl,
                            responseType: 'blob',
                            onload: (r) => (r.status === 200) ? res(r.response) : rej(r.status),
                            onerror: rej
                        });
                    } else rej(new Error('Not GitHub'));
                }),

                // 19. Raw URL Direct Pass
                () => new Promise((resolve, reject) => { const image = new Image(); const timer = setTimeout(() => reject(new Error('Image load timed out')), 10000); image.onload = () => { clearTimeout(timer); resolve(rawUrl); }; image.onerror = () => { clearTimeout(timer); reject(new Error('Invalid image')); }; image.src = rawUrl; }),

                // 20. Fail-Safe Verified Direct URL String
                () => Promise.reject(new Error('Image could not be verified'))
            ];

            let lastError = null;
            for (let i = 0; i < stages.length; i++) {
                try {
                    const result = await this.createStagePromise(i + 1, `Pipeline Handler #${i + 1}`, stages[i]);
                    return result;
                } catch (err) {
                    lastError = err;
                    Logger.warn(`Stage ${i + 1} failed, progressing to next fallback...`);
                }
            }

            throw new Error(`All 20 fallback stages failed to resolve asset. Last error: ${lastError}`);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 6: COLOR MATHEMATICS & RAINBOW ENGINE
    // ─────────────────────────────────────────────────────────────────────────

    let currentRainbowHue = 0;

    function getActiveAccentHex() {
        if (config.accentPreset === 'rainbow') {
            return `hsl(${Math.round(currentRainbowHue)}, 95%, 62%)`;
        }
        if (config.accentPreset === 'custom') {
            return config.customAccentColor || '#3b82f6';
        }
        return ACCENT_PRESETS[config.accentPreset] || '#3b82f6';
    }

    function calculateLuminanceContrast(colorString) {
        if (!colorString) return '#ffffff';
        if (colorString.startsWith('hsl')) return '#ffffff';

        let hex = colorString.replace('#', '').trim();
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }

        const r = parseInt(hex.substring(0, 2), 16) || 0;
        const g = parseInt(hex.substring(2, 4), 16) || 0;
        const b = parseInt(hex.substring(4, 6), 16) || 0;

        // ITU-R BT.601 formula for perceived brightness
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
        return luminance >= 148 ? '#000000' : '#ffffff';
    }

    function initRainbowLoop() {
        let lastFrameTime = performance.now();

        function step(now) {
            const dt = (now - lastFrameTime) / 1000;
            lastFrameTime = now;

            if (config.accentPreset === 'rainbow' && !document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                let speedDegPerSec = 45;
                if (config.rainbowSpeed === 'slow') speedDegPerSec = 16;
                if (config.rainbowSpeed === 'fast') speedDegPerSec = 140;

                if (config.rainbowEffect === 'strobe') {
                    currentRainbowHue = (currentRainbowHue + speedDegPerSec * dt * 4) % 360;
                } else {
                    currentRainbowHue = (currentRainbowHue + speedDegPerSec * dt) % 360;
                }

                const accentColor = getActiveAccentHex();
                const textColor = calculateLuminanceContrast(accentColor);

                document.documentElement.style.setProperty('--bake-accent', accentColor);
                document.documentElement.style.setProperty('--bake-accent-text', textColor);
            }

            requestAnimationFrame(step);
        }

        requestAnimationFrame(step);
    }
    initRainbowLoop();

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 7: QUESTION NORMALIZATION & ANSWER PARSING
    // ─────────────────────────────────────────────────────────────────────────

    function normalizeString(str) {
        if (!str || typeof str !== 'string') return '';
        return str
            .replace(/\u00A0/g, ' ')            // Non-breaking space
            .replace(/[\u2018\u2019]/g, "'")    // Curly single quotes
            .replace(/[\u201C\u201D]/g, '"')    // Curly double quotes
            .replace(/–/g, '-')                 // En-dash to hyphen
            .replace(/\s+/g, ' ')               // Collapse consecutive whitespaces
            .trim()
            .toLowerCase();
    }

    function extractQuestionClean(rootEl) {
        if (!rootEl) return '';
        const clone = rootEl.cloneNode(true);

        clone.querySelectorAll('strong').forEach(el => {
            if (/^Q\d+:?/i.test(el.textContent.trim())) {
                el.remove();
            }
        });

        clone.querySelectorAll('fieldset.boxed, .link, figcaption, img').forEach(el => el.remove());
        return normalizeString(clone.textContent);
    }

    function extractRawQuestionWithContext(rootEl) {
        if (!rootEl) return '';
        const clone = rootEl.cloneNode(true);
        clone.querySelectorAll('strong').forEach(el => {
            if (/^Q\d+:?/i.test(el.textContent.trim())) {
                el.remove();
            }
        });
        return clone.textContent.replace(/\s+/g, ' ').trim();
    }

    function isAnswerValid(ans) {
        if (!ans || typeof ans !== 'string') return false;
        const norm = ans.trim().toLowerCase();
        if (norm === '' || norm === 'n/a') return false;
        // REQUIREMENT 6: Never consider "depends on extract" a valid cached answer
        if (norm.includes('depends on extract') || norm.includes('see extract') || norm.includes('refer to extract')) {
            return false;
        }
        return true;
    }

    function parseAcceptedAnswers(rawText) {
        if (!rawText || typeof rawText !== 'string') return [];
        const candidates = [];

        const quoteRegex = /"([^"]+)"/g;
        let match;
        while ((match = quoteRegex.exec(rawText)) !== null) {
            const cleaned = match[1].trim();
            if (isAnswerValid(cleaned) && !candidates.includes(cleaned)) {
                candidates.push(cleaned);
            }
        }

        if (candidates.length === 0) {
            const parts = rawText.split(/\s+or\s+/i);
            parts.forEach(p => {
                const clean = p.replace(/^["']|["']$/g, '').trim();
                if (isAnswerValid(clean) && !candidates.includes(clean)) {
                    candidates.push(clean);
                }
            });
        }

        return candidates.filter(isAnswerValid);
    }

    function pickRandomCandidate(answersArray) {
        if (!answersArray || !Array.isArray(answersArray) || answersArray.length === 0) {
            return null;
        }
        const validList = answersArray.filter(isAnswerValid);
        if (validList.length === 0) return null;
        const index = Math.floor(Math.random() * validList.length);
        return validList[index];
    }

    function findMatchingAnswerCandidate(rawQuestionText, quizId, database) {
        if (!rawQuestionText) return null;

        const normalizedQ = normalizeString(rawQuestionText);
        const scopedDb = database[quizId] || {};
        const globalDb = database['__global__'] || {};

        if (scopedDb[normalizedQ]) {
            const candidate = pickRandomCandidate(scopedDb[normalizedQ]);
            if (candidate) return candidate;
        }

        if (globalDb[normalizedQ]) {
            const candidate = pickRandomCandidate(globalDb[normalizedQ]);
            if (candidate) return candidate;
        }

        for (const [cachedQ, ansList] of Object.entries(scopedDb)) {
            if (cachedQ.includes(normalizedQ) || normalizedQ.includes(cachedQ)) {
                const candidate = pickRandomCandidate(ansList);
                if (candidate) return candidate;
            }
        }

        for (const [cachedQ, ansList] of Object.entries(globalDb)) {
            if (cachedQ.includes(normalizedQ) || normalizedQ.includes(cachedQ)) {
                const candidate = pickRandomCandidate(ansList);
                if (candidate) return candidate;
            }
        }

        return null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 8: COMPLETE STYLESHEET DEFINITION
    // ─────────────────────────────────────────────────────────────────────────

    GM_addStyle(`
        /* =====================================================================
           CORE TOKENS & CANVAS BACKGROUND
           ===================================================================== */
        :root {
            --bake-accent: #3b82f6;
            --bake-accent-text: #ffffff;
            --bake-accent-glow: rgba(59, 130, 246, 0.45);
        }

        /* Dedicated Full-Screen Canvas Layer */
        #edubake-canvas-bg {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            z-index: -999999 !important;
            background-size: cover !important;
            background-position: center center !important;
            background-repeat: no-repeat !important;
            background-attachment: fixed !important;
            pointer-events: none !important;
            display: none;
        }

        body.bake-has-bg #edubake-canvas-bg {
            display: block !important;
        }

        /* Total Background Color Stripping for Full Transparency */
        html.bake-has-bg,
        body.bake-has-bg,
        body.bake-has-bg #top,
        body.bake-has-bg #student-experience-container,
        body.bake-has-bg [id="top"],
        body.bake-has-bg .page-container,
        body.bake-has-bg .section,
        body.bake-has-bg div[data-v-app],
        body.bake-has-bg [class*="bg-page-bg"],
        body.bake-has-bg [class*="black:bg-page-bg"],
        body.bake-has-bg [class*="bg-white"],
        body.bake-has-bg .h-screen,
        body.bake-has-bg .min-h-screen,
        body.bake-has-bg .themed\\:bg-page-bg,
        body.bake-has-bg .not-themed\\:bg-page-bg {
            background-color: transparent !important;
            background: transparent !important;
        }

        /* REQUIREMENT 3: Remove % input group adornment element completely */
        .input-group-text,
        div[data-v-888fc040].input-group-text,
        div.input-group-text.flex.items-center {
            display: none !important;
            visibility: hidden !important;
            width: 0 !important;
            height: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            pointer-events: none !important;
        }

        /* Footer & Revision Wizard Removal */
        footer,
        footer[data-v-1e7b60a7],
        footer.border-t-3,
        .footer,
        #study-assistant-button,
        button#study-assistant-button {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
        }

        /* Scrollbar Styling */
        ::-webkit-scrollbar {
            width: 8px !important;
            height: 8px !important;
        }
        ::-webkit-scrollbar-track {
            background: #090909 !important;
        }
        ::-webkit-scrollbar-thumb {
            background: #242424 !important;
            border-radius: 4px !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: var(--bake-accent) !important;
        }

        body.edubake-no-scroll,
        body.edubake-no-scroll #top,
        body.edubake-no-scroll html {
            overflow: hidden !important;
        }

        /* Real Dark Mode Base */
        body.bake-realdark,
        html.bake-realdark {
            background-color: #050505;
            color: #eeeeee;
        }

        body.bake-realdark .card,
        body.bake-realdark .MuiPaper-root,
        body.bake-realdark .backdrop,
        body.bake-realdark .boxed,
        body.bake-realdark .box-1,
        body.bake-realdark .box-2,
        body.bake-realdark .box-3,
        body.bake-realdark .list-header,
        body.bake-realdark .page-container,
        body.bake-realdark [class*="bg-page-bg"],
        body.bake-realdark [class*="black:bg-page-bg"],
        body.bake-realdark .section {
            background-color: #0d0d0d !important;
            border-color: #242424 !important;
            color: #ffffff !important;
            box-shadow: none !important;
        }

        body.bake-realdark .flex-1.ellipsis,
        body.bake-realdark span,
        body.bake-realdark p,
        body.bake-realdark i.icon-tick,
        body.bake-realdark svg,
        body.bake-realdark svg *,
        body.bake-realdark .themed\\:rounded-full,
        body.bake-realdark .themed\\:bg-white {
            background-color: transparent !important;
        }

        /* Glassmorphic Layering */
        body.bake-transparent-ui .card,
        body.bake-transparent-ui .boxed,
        body.bake-transparent-ui .box-1,
        body.bake-transparent-ui .box-2,
        body.bake-transparent-ui .box-3,
        body.bake-transparent-ui .list-header,
        body.bake-transparent-ui .prose,
        body.bake-transparent-ui .bake-settings-panel,
        body.bake-transparent-ui .section {
            background: rgba(14, 14, 14, 0.74) !important;
            backdrop-filter: blur(14px) saturate(180%) !important;
            -webkit-backdrop-filter: blur(14px) saturate(180%) !important;
            border: 1px solid rgba(255, 255, 255, 0.12) !important;
        }

        body.bake-accent-active .btn.blue,
        body.bake-accent-active button.blue,
        body.bake-accent-active .primary\\:bg-purple,
        body.bake-accent-active .bg-purple {
            background-color: var(--bake-accent) !important;
            color: var(--bake-accent-text) !important;
            border-color: var(--bake-accent) !important;
        }

        body.bake-accent-active a[title="Settings"],
        body.bake-accent-active a[title="My account"],
        body.bake-accent-active .flex-1.ellipsis {
            background: transparent !important;
        }

        /* Loading Screen Logo Mask & Progress Line */
        .edubake-logo-mask {
            width: 290px;
            height: 74px;
            background-color: var(--bake-accent) !important;
            -webkit-mask: url("/assets/img/educake_logo_lengthways_purple.png") no-repeat center / contain;
            mask: url("/assets/img/educake_logo_lengthways_purple.png") no-repeat center / contain;
            display: inline-block !important;
            transition: transform 0.3s ease;
        }

        .edubake-progress-bar {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 4px;
            background: rgba(255, 255, 255, 0.08);
            z-index: 99999999;
            overflow: hidden;
        }
        .edubake-progress-bar::after {
            content: '';
            position: absolute;
            top: 0;
            left: -40%;
            width: 40%;
            height: 100%;
            background: var(--bake-accent);
            box-shadow: 0 0 16px var(--bake-accent);
            animation: edubake-sweep 1.25s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        @keyframes edubake-sweep {
            0% { left: -40%; }
            100% { left: 100%; }
        }

        @keyframes edubake-pulse-highlight {
            0% { outline: 3px solid var(--bake-accent); box-shadow: 0 0 8px 2px var(--bake-accent-glow); }
            50% { outline: 4px solid var(--bake-accent); box-shadow: 0 0 22px 6px var(--bake-accent-glow); }
            100% { outline: 3px solid var(--bake-accent); box-shadow: 0 0 8px 2px var(--bake-accent-glow); }
        }
        .edubake-highlight {
            animation: edubake-pulse-highlight 1.3s ease-in-out infinite !important;
            outline-offset: 3px !important;
            position: relative !important;
            z-index: 20 !important;
        }

        body.edubake-hide-excerpt fieldset.boxed.prose.excerpt {
            display: none !important;
        }

        body.edubake-hide-top-header .flex.flex-col.lg\\:flex-row.lg\\:items-center.justify-between {
            display: none !important;
        }
        body.edubake-hide-navbar div[data-v-4044f45e].flex.items-center.justify-between {
            display: none !important;
        }

        /* Cursor Styles & Particle Emitter */
        body.bake-cursor-shiny,
        body.bake-cursor-shiny * {
            cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='4' fill='%23ffffff' stroke='%233b82f6' stroke-width='1.5'/%3E%3Ccircle cx='8' cy='8' r='1.5' fill='%23ffffff'/%3E%3C/svg%3E") 8 8, auto !important;
        }
        body.bake-cursor-crosshair,
        body.bake-cursor-crosshair * {
            cursor: crosshair !important;
        }
        .edubake-snow-particle {
            position: fixed;
            pointer-events: none;
            width: 5px;
            height: 5px;
            background: #ffffff;
            border-radius: 50%;
            box-shadow: 0 0 8px #ffffff;
            z-index: 999999999;
            animation: edubake-snow-fall 0.75s ease-out forwards;
        }
        @keyframes edubake-snow-fall {
            0% { opacity: 1; transform: translate(0, 0) scale(1); }
            100% { opacity: 0; transform: translate(var(--tx), var(--ty)) scale(0.2); }
        }

        /* =====================================================================
           QUIZUI 2.0 FULL CENTERING ARCHITECTURE (REQUIREMENTS 4, 7 & 8)
           ===================================================================== */
        body.edubake-qui2-active .flex.flex-col.lg\\:flex-row.lg\\:items-center.justify-between.m-0.lg\\:mb-4,
        body.edubake-qui2-active .column.test-name,
        body.edubake-qui2-active .flex.justify-between.items-center:has(h3.text-xl) {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
        }

        /* Centered Quiz Area Flow */
        body.edubake-qui2-active .page-container,
        body.edubake-qui2-active .section {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
        }

        /* Question Centering Box */
        body.edubake-qui2-active fieldset.question-text {
            display: block !important;
            width: 90% !important;
            max-width: 820px !important;
            margin: 36px auto 22px auto !important;
            text-align: center !important;
            background: rgba(14, 14, 14, 0.86) !important;
            border: 1px solid rgba(255, 255, 255, 0.16) !important;
            border-radius: 14px !important;
            padding: 24px 32px !important;
            box-shadow: 0 10px 32px rgba(0,0,0,0.65) !important;
        }
        body.edubake-qui2-active fieldset.question-text .pre-line {
            font-size: 1.25rem !important;
            line-height: 1.6 !important;
            color: #ffffff !important;
            text-align: center !important;
        }

        /* Centered Multiple Choice Answers */
        body.edubake-qui2-active div[data-v-9f7cfe60].flex-wrap {
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            width: 90% !important;
            max-width: 820px !important;
            margin: 0 auto 24px auto !important;
            gap: 12px !important;
        }
        body.edubake-qui2-active label[role="option"] {
            background: rgba(22, 22, 22, 0.78) !important;
            backdrop-filter: blur(10px) !important;
            border: 1px solid rgba(255, 255, 255, 0.14) !important;
            border-radius: 8px !important;
            padding: 12px 24px !important;
            transition: transform 0.15s ease, background 0.15s ease;
        }
        body.edubake-qui2-active label[role="option"]:hover {
            transform: translateY(-2px);
            background: rgba(36, 36, 36, 0.9) !important;
        }

        /* Centered Single Text Input Box */
        body.edubake-qui2-active input.answer-text {
            display: block !important;
            width: 100% !important;
            max-width: 520px !important;
            margin: 0 auto 20px auto !important;
            text-align: center !important;
            border-radius: 8px !important;
            background: rgba(22, 22, 22, 0.85) !important;
            border: 1px solid rgba(255, 255, 255, 0.2) !important;
            color: #ffffff !important;
        }

        /* REQUIREMENTS 4 & 7: PERFECTLY CENTERED FAST SUBMIT BUTTON */
        .edubake-fast-submit-btn {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            margin: 24px auto !important;
            padding: 14px 44px !important;
            font-size: 1.1rem !important;
            font-weight: 700 !important;
            border-radius: 10px !important;
            background: var(--bake-accent) !important;
            color: var(--bake-accent-text) !important;
            border: none !important;
            cursor: pointer !important;
            box-shadow: 0 4px 22px rgba(0,0,0,0.55) !important;
            transition: transform 0.15s ease, filter 0.15s ease !important;
            text-align: center !important;
        }
        .edubake-fast-submit-btn:hover {
            transform: scale(1.03) !important;
            filter: brightness(1.1) !important;
        }

        /* REQUIREMENT 5: CLEAN "Copy AI Prompt" BUTTON */
        .edubake-ai-prompt-btn {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            margin: 12px auto !important;
            padding: 7px 18px !important;
            border-radius: 6px !important;
            background: #1e1e38 !important;
            color: #a78bfa !important;
            border: 1px solid #7c3aed !important;
            font-size: 0.88rem !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            transition: all 0.15s ease !important;
            text-align: center !important;
        }
        .edubake-ai-prompt-btn:hover {
            background: #2e285a !important;
            color: #c4b5fd !important;
            transform: translateY(-1px) !important;
        }

        /* Answer Pill Badge */
        .edubake-answer-pill {
            display: block !important;
            width: fit-content !important;
            margin: 12px auto 6px auto !important;
            padding: 6px 16px !important;
            border-radius: 6px !important;
            background: #111827 !important;
            color: #60a5fa !important;
            border: 1px solid #1e40af !important;
            font-size: 0.95rem !important;
            font-weight: 600 !important;
            text-align: center !important;
        }

        /* Floating Bottom HUD Pill (Live Quizzes Only) */
        #edubake-hud-pill {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            min-width: 68px;
            height: 46px;
            background: rgba(14, 14, 14, 0.88);
            border: 1px solid rgba(255, 255, 255, 0.18);
            backdrop-filter: blur(12px);
            border-radius: 24px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.7);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 16px;
            cursor: pointer;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            user-select: none;
        }
        #edubake-hud-pill:hover {
            min-width: 260px;
            background: rgba(20, 20, 20, 0.98);
            border-color: var(--bake-accent);
        }
        .edubake-hud-num {
            font-size: 1.3rem;
            font-weight: 800;
            color: var(--bake-accent);
            transition: opacity 0.2s ease;
        }
        .edubake-hud-info {
            display: none;
            font-size: 0.9rem;
            font-weight: 600;
            color: #eee;
            gap: 14px;
            align-items: center;
            justify-content: center;
        }
        #edubake-hud-pill:hover .edubake-hud-num { display: none; }
        #edubake-hud-pill:hover .edubake-hud-info { display: flex; }

        .edubake-wrong-badge {
            margin-left: 12px;
            font-weight: 700;
            font-size: 1.05rem;
            padding: 4px 10px;
            border-radius: 6px;
            background: rgba(0, 0, 0, 0.4);
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        /* Settings Panels */
        #edubake-side-drawer {
            position: fixed;
            top: 0;
            right: 0;
            width: 360px;
            height: 100vh;
            background: #111111;
            color: #eeeeee;
            border-left: 2px solid #282828;
            box-shadow: -8px 0 30px rgba(0,0,0,0.85);
            z-index: 9999999;
            display: flex;
            flex-direction: column;
            transform: translateX(100%);
            transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
            font-family: inherit;
        }
        #edubake-side-drawer.peeking { transform: translateX(calc(100% - 24px)); }
        #edubake-side-drawer.opened { transform: translateX(0); }
        #edubake-side-drawer-handle {
            position: absolute;
            left: -32px;
            top: 50%;
            transform: translateY(-50%);
            width: 32px;
            height: 68px;
            background: #1d1d1d;
            border: 1px solid #333;
            border-right: none;
            border-radius: 8px 0 0 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--bake-accent);
            font-size: 1.15rem;
            font-weight: bold;
            user-select: none;
        }
        .edubake-drawer-scrollable {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .bake-settings-panel {
            background: #121212 !important;
            border: 2px solid #292929 !important;
            border-radius: 12px !important;
            padding: 20px !important;
            margin: 20px 0 !important;
        }
        .bake-settings-panel h3 {
            color: var(--bake-accent) !important;
            margin: 0 0 16px 0 !important;
            font-size: 1.4rem !important;
        }

        .eb-group {
            border-bottom: 1px solid #242424;
            padding-bottom: 12px;
        }
        .eb-group h4 {
            color: var(--bake-accent);
            margin: 0 0 10px 0;
            font-size: 0.95rem;
        }
        .eb-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: 8px 0;
            font-size: 0.88rem;
        }
        .eb-row input[type="text"],
        .eb-row input[type="number"],
        .eb-row select {
            background: #1e1e1e;
            color: #eee;
            border: 1px solid #383838;
            padding: 4px 8px;
            border-radius: 4px;
        }

        .edubake-console-box {
            width: 100%;
            height: 85px;
            background: #080808;
            color: #10b981;
            font-family: 'Courier New', Courier, monospace;
            font-size: 0.82rem;
            padding: 8px;
            border: 1px solid #333;
            border-radius: 4px;
            resize: vertical;
            margin-top: 4px;
        }

        .edubake-modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100000000;
        }
        .edubake-modal-frame {
            max-height: 85vh;
            overflow-y: auto;
            background: #141414;
            border: 2px solid var(--bake-accent);
            border-radius: 12px;
            padding: 24px;
            max-width: 520px;
            width: 90vw;
            text-align: center;
            box-shadow: 0 12px 36px rgba(0,0,0,0.9);
        }
        .edubake-modal-frame h3 {
            margin-top: 0;
            color: #fff;
            font-size: 1.25rem;
        }
        .edubake-modal-frame p {
            color: #ccc;
            line-height: 1.5;
            margin: 12px 0 16px 0;
        }
        .edubake-modal-btn-row {
            display: flex;
            justify-content: center;
            gap: 12px;
        }
        @media (prefers-reduced-motion: reduce) {
            .edubake-snow-particle { display: none !important; }
            #edubake-side-drawer, .edubake-modal-frame, .edubake-progress-bar { animation: none !important; transition: none !important; }
        }
    `);

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 9: HARDWARE-ACCELERATED BACKGROUND CANVAS & BLOB RENDERER
    // ─────────────────────────────────────────────────────────────────────────

    let activeObjectUrl = null;
    let backgroundIdentity = '';
    let backgroundLoading = false;

    function getBackgroundIdentity() {
        return JSON.stringify([config.bgType, config.bgSourceUrl, config.bgActiveBlobKey, config.bgRevision]);
    }

    async function ensureBackgroundCanvas() {
        const identity = getBackgroundIdentity();
        if (backgroundLoading || (backgroundIdentity === identity && document.getElementById('edubake-canvas-bg'))) return;
        backgroundLoading = true;
        try {
            let imageUrl = '';
            let candidateObjectUrl = null;
            if (config.bgType === 'indexeddb') {
                const blob = await IndexedDBStorage.getBlob(config.bgActiveBlobKey || 'primary_background');
                // Ignore a previous selection finishing after a newer selection.
                if (identity !== getBackgroundIdentity()) return;
                if (blob) imageUrl = candidateObjectUrl = URL.createObjectURL(blob);
                else Logger.warn('Saved background is unavailable; upload the image again.');
            } else if (config.bgType === 'url') {
                imageUrl = config.bgSourceUrl || '';
            }
            let canvas = document.getElementById('edubake-canvas-bg');
            if (!canvas) {
                canvas = document.createElement('div');
                canvas.id = 'edubake-canvas-bg';
                document.body.prepend(canvas);
            }
            canvas.style.backgroundImage = imageUrl ? `url(${JSON.stringify(imageUrl)})` : '';
            document.documentElement.classList.toggle('bake-has-bg', !!imageUrl);
            document.body.classList.toggle('bake-has-bg', !!imageUrl);
            if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
            activeObjectUrl = candidateObjectUrl;
            backgroundIdentity = identity;
        } catch (error) {
            Logger.error('Background rendering failed:', error);
        } finally {
            backgroundLoading = false;
            if (identity !== getBackgroundIdentity()) schedulePass();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 10: CURSOR DISPATCHER & PARTICLES
    // ─────────────────────────────────────────────────────────────────────────

    function applyCursorConfiguration() {
        const body = document.body;
        if (!body) return;

        body.classList.toggle('bake-cursor-shiny', config.cursorStyle === 'shiny-dot');
        body.classList.toggle('bake-cursor-crosshair', config.cursorStyle === 'crosshair');

        if (config.cursorStyle !== 'custom') body.style.cursor = '';
        if (config.cursorStyle === 'custom' && config.customCursorUrl) {
            body.style.cursor = `url("${config.customCursorUrl}"), auto`;
        } else if (config.cursorStyle !== 'shiny-dot' && config.cursorStyle !== 'crosshair') {
            body.style.cursor = '';
        }
    }

    window.addEventListener('click', (e) => {
        if (config.cursorStyle !== 'shiny-dot' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        for (let i = 0; i < 7; i++) {
            const flake = document.createElement('div');
            flake.className = 'edubake-snow-particle';
            flake.style.left = `${e.clientX}px`;
            flake.style.top = `${e.clientY}px`;

            const angle = Math.random() * Math.PI * 2;
            const distance = 20 + Math.random() * 40;
            flake.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
            flake.style.setProperty('--ty', `${Math.sin(angle) * distance + 26}px`);

            document.body.appendChild(flake);
            setTimeout(() => flake.remove(), 750);
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 11: ROUTE GUARDS & PATH CHECKERS
    // ─────────────────────────────────────────────────────────────────────────

    function isLiveQuizRoute() {
        const href = window.location.href;
        const isResult = href.includes('/quiz-result') || href.includes('/quiz-results') || href.includes('result');
        const isQuiz = href.includes('/quiz/') && !isResult;
        return isQuiz;
    }

    function isQuizResultRoute() {
        const href = window.location.href;
        return href.includes('/quiz-result') || href.includes('/quiz-results');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 12: QUESTION ACCORDION ANSWER HARVESTER
    // ─────────────────────────────────────────────────────────────────────────

    function injectGetAnswersButton() {
        const takeAgainBtn = Array.from(document.querySelectorAll('button')).find(
            b => b.textContent.includes('Take quiz again')
        );

        if (takeAgainBtn && !document.querySelector('.edubake-get-answers-btn')) {
            const btn = document.createElement('button');
            btn.className = 'btn blue black:box-1 edubake-get-answers-btn ml-3 font-semibold';
            btn.textContent = 'Get Answers';

            btn.addEventListener('click', async () => {
                btn.textContent = 'Opening accordion...';

                const accordionBtn = Array.from(document.querySelectorAll('button.toggle-button')).find(
                    b => b.textContent.includes('Questions in this quiz')
                );
                if (accordionBtn && !document.querySelector('.questions-list')) {
                    accordionBtn.click();
                    await new Promise(r => setTimeout(r, 450));
                }

                const showAll = document.querySelector('.show-all');
                if (showAll && (showAll.textContent.includes('Expand all') || showAll.textContent.includes('Show all'))) {
                    showAll.click();
                    await new Promise(r => setTimeout(r, 600));
                }

                const quizIdMatch = window.location.href.match(/(\d{6,})/);
                const quizId = quizIdMatch ? quizIdMatch[1] : 'general';

                const questionRows = document.querySelectorAll('.question-row');
                const answersMap = {};
                let count = 0;
                let missingCount = 0;

                questionRows.forEach(row => {
                    const qTitleEl = row.querySelector('.question-title');
                    if (!qTitleEl) return;

                    const cleanQuestion = extractQuestionClean(qTitleEl);
                    if (!cleanQuestion) return;

                    let foundAnswer = false;
                    row.querySelectorAll('.answer-row .prose').forEach(p => {
                        const lbl = p.querySelector('span.font-bold');
                        if (lbl && (lbl.textContent.includes('Accepted answer') || lbl.textContent.includes('Accepted answers'))) {
                            const valEl = p.querySelector('.pre-line') || p.querySelector('div');
                            if (valEl) {
                                const parsedCandidates = parseAcceptedAnswers(valEl.textContent);
                                if (parsedCandidates.length > 0) {
                                    answersMap[cleanQuestion] = parsedCandidates;
                                    count++;
                                    foundAnswer = true;
                                }
                            }
                        }
                    });

                    if (!foundAnswer) {
                        missingCount++;
                    }
                });

                const db = StorageEngine.getAnswerDatabase();
                db[quizId] = { ...(db[quizId] || {}), ...answersMap };
                db['__global__'] = { ...(db['__global__'] || {}), ...answersMap };
                StorageEngine.saveAnswerDatabase(db);

                if (missingCount > 0 && !document.querySelector('.edubake-missing-ai-btn')) {
                    const aiBtn = document.createElement('button');
                    aiBtn.className = 'btn black:box-1 edubake-missing-ai-btn ml-3 font-semibold';
                    aiBtn.style.background = '#7c3aed';
                    aiBtn.style.color = '#fff';
                    aiBtn.textContent = `Copy AI Prompt (${missingCount} Unanswered)`;
                    aiBtn.addEventListener('click', () => {
                        generateAndCopyAIPromptForQuiz(quizId);
                    });
                    takeAgainBtn.parentNode.insertBefore(aiBtn, btn.nextSibling);
                }

                btn.textContent = `✓ Cached ${count} Answers!`;
                setTimeout(() => { btn.textContent = 'Get Answers'; }, 2500);
            });

            takeAgainBtn.parentNode.insertBefore(btn, takeAgainBtn.nextSibling);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 13: AI PROMPT GENERATOR & JSON IMPORT SUBSYSTEM
    // ─────────────────────────────────────────────────────────────────────────

    function generateAIPromptSingleQuestion(rawQ, extractText, choices) {
        let prompt = `You are an expert academic tutor for GCSE Science on Educake. Please answer the following question accurately.\n\n`;
        if (extractText) {
            prompt += `[Extract/Case Study Context]:\n"${extractText}"\n\n`;
        }
        prompt += `[Question]:\n"${rawQ}"\n\n`;
        if (choices && choices.length > 0) {
            prompt += `[Available Multiple Choice Options]:\n`;
            choices.forEach((c, idx) => {
                prompt += `Option ${idx + 1}: "${c}"\n`;
            });
            prompt += `\n`;
        }
        prompt += `Output your response strictly as a JSON object mapping the exact question string to the exact answer string, matching one of the options or standard numerical/word format. Do not write markdown commentary outside the JSON:\n`;
        prompt += `{\n  "${rawQ.replace(/"/g, '\\"')}": "YOUR_EXACT_ANSWER_HERE"\n}`;
        return prompt;
    }

    function generateAndCopyAIPromptForQuiz(quizId) {
        const questionRows = document.querySelectorAll('.question-row');
        const questionsList = [];

        questionRows.forEach((row, i) => {
            const qTitleEl = row.querySelector('.question-title');
            if (!qTitleEl) return;

            let hasAccepted = false;
            row.querySelectorAll('.answer-row .prose').forEach(p => {
                const lbl = p.querySelector('span.font-bold');
                if (lbl && (lbl.textContent.includes('Accepted answer') || lbl.textContent.includes('Accepted answers'))) {
                    hasAccepted = true;
                }
            });

            if (!hasAccepted) {
                const rawQ = extractRawQuestionWithContext(qTitleEl);
                let extractText = '';
                const extractEl = row.querySelector('fieldset.boxed');
                if (extractEl) extractText = extractEl.textContent.replace(/\s+/g, ' ').trim();

                questionsList.push({
                    number: i + 1,
                    question: rawQ,
                    extract: extractText
                });
            }
        });

        if (questionsList.length === 0) {
            alert('EduBake: All questions in this view already have cached accepted answers!');
            return;
        }

        let prompt = `You are an expert tutor for GCSE Science exams. Below are ${questionsList.length} questions from Educake that need verified answers.\n\n`;
        prompt += `Please solve all questions and output ONLY a clean, valid JSON object mapping each exact question string to its accepted answer. If an answer can have multiple variations, provide the most concise one:\n\n`;
        prompt += `Expected JSON format:\n{\n  "Question text here...": "Answer"\n}\n\nQuestions to solve:\n`;

        questionsList.forEach((q) => {
            prompt += `\n--- Question ${q.number} ---\n`;
            if (q.extract) prompt += `Context: ${q.extract}\n`;
            prompt += `Question: ${q.question}\n`;
        });

        navigator.clipboard.writeText(prompt).then(() => {
            showEduBakeModal(
                "AI Prompt Copied!",
                `Successfully copied prompt for ${questionsList.length} unanswered questions to your clipboard.\nPaste this into your AI (ChatGPT, Claude, Gemini, etc.), copy the resulting JSON, and click 'Import AI JSON' in EduBake!`,
                "Open JSON Importer",
                () => {
                    openJSONImportModal();
                }
            );
        }).catch(err => {
            Logger.error('Clipboard copy failed:', err);
            window.prompt('Copy AI Prompt manually:', prompt);
        });
    }

    function openJSONImportModal() {
        const overlay = document.createElement('div');
        overlay.className = 'edubake-modal-backdrop';
        overlay.innerHTML = `
            <div class="edubake-modal-frame">
                <h3>Import AI Answers JSON</h3>
                <p>Paste the JSON object provided by your AI below:</p>
                <textarea id="edubake-json-import-input" style="width:100%; height:160px; background:#090909; color:#10b981; font-family:monospace; font-size:0.85rem; padding:8px; border:1px solid #333; border-radius:6px; resize:vertical;" placeholder='{\n  "What is the missing word in this sentence?": "bottom"\n}'></textarea>
                <div class="edubake-modal-btn-row" style="margin-top:14px;">
                    <button class="btn blue px-4 py-2 font-semibold" id="eb-json-confirm">Save to EduBake</button>
                    <button class="btn px-4 py-2 bg-gray-700 text-white" id="eb-json-cancel">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#eb-json-confirm').onclick = () => {
            const rawVal = overlay.querySelector('#edubake-json-import-input').value.trim();
            if (!rawVal) {
                alert('Please paste a valid JSON object.');
                return;
            }

            try {
                const cleanedJson = rawVal.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
                const parsed = JSON.parse(cleanedJson);

                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    throw new Error('JSON must be an object with question keys and answer values.');
                }

                const quizIdMatch = window.location.href.match(/(\d{6,})/);
                const quizId = quizIdMatch ? quizIdMatch[1] : 'general';

                const db = StorageEngine.getAnswerDatabase();
                db[quizId] = db[quizId] || {};
                db['__global__'] = db['__global__'] || {};

                let importedCount = 0;
                for (const [k, v] of Object.entries(parsed)) {
                    const normK = normalizeString(k);
                    const ansList = (Array.isArray(v) ? v : [v]).filter(isAnswerValid).map(a => a.trim());
                    if (!normK || !ansList.length || ['__proto__', 'constructor', 'prototype'].includes(normK)) continue;
                    db[quizId][normK] = ansList;
                    db['__global__'][normK] = ansList;
                    importedCount++;
                }

                StorageEngine.saveAnswerDatabase(db);
                overlay.remove();
                alert(`EduBake: Successfully imported ${importedCount} answers into the database!`);
                domObserver.disconnect();
            try { executeCycle(); } finally { domObserver.observe(document.documentElement, {childList:true, subtree:true}); }
            } catch (err) {
                alert(`Failed to parse JSON: ${err.message}`);
            }
        };

        overlay.querySelector('#eb-json-cancel').onclick = () => overlay.remove();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 14: QUIZUI 2.0 HUD & 2-STEP SUBMIT & ADVANCE ENGINE
    // ─────────────────────────────────────────────────────────────────────────

    let quizEpoch = 0;
    let visibleQuestionIdentity = '';
    let isAutoRunning = false;
    let currentProcessedQuestion = '';

    function handleActiveQuizAutomation() {
        if (!isLiveQuizRoute()) {
            const existingPill = document.getElementById('edubake-hud-pill');
            if (existingPill) existingPill.remove();
            return;
        }

        const qEl = document.querySelector('fieldset.question-text .pre-line') ||
                    document.querySelector('.question-title .pre-line') ||
                    document.querySelector('.question-text');

        if (!qEl) return;
        const identity = window.location.pathname + ':' + extractQuestionClean(qEl);
        if (identity !== visibleQuestionIdentity) {
            visibleQuestionIdentity = identity;
            quizEpoch++;
            isAutoRunning = false;
            document.querySelectorAll('.edubake-answer-pill, .edubake-ai-prompt-btn').forEach(e => e.remove());
        }

        const cleanQuestion = extractQuestionClean(qEl);
        const quizIdMatch = window.location.href.match(/(\d{6,})/);
        const quizId = quizIdMatch ? quizIdMatch[1] : 'general';
        const cache = StorageEngine.getAnswerDatabase();
        const correctAnswer = findMatchingAnswerCandidate(cleanQuestion, quizId, cache);

        // Mount HUD pill & Centered Fast Submit Button
        if (!config.quizUI2) {
            document.getElementById('edubake-hud-pill')?.remove();
            document.querySelector('.edubake-fast-submit-btn')?.remove();
        }
        if (config.quizUI2) {
            ensureQuizUIHUD();
            ensureFastSubmitButton();
        }

        // Clean up any stale or invalid answer pills
        document.querySelectorAll('.edubake-answer-pill').forEach(p => {
            if (!isAnswerValid(p.textContent)) p.remove();
        });

        // Display Answer Pill ONLY if answer is genuinely valid
        if (correctAnswer && isAnswerValid(correctAnswer) && !document.querySelector('.edubake-answer-pill')) {
            const pill = document.createElement('div');
            pill.className = 'edubake-answer-pill';
            pill.textContent = 'Answer: ';
            const answerText = document.createElement('strong');
            answerText.textContent = correctAnswer;
            pill.appendChild(answerText);
            const container = qEl.closest('fieldset.question-text, .question-title, div');
            if (container) container.appendChild(pill);
        }

        // REQUIREMENT 5: If no answer is cached, show clean "Copy AI Prompt" button
        if (!correctAnswer && !document.querySelector('.edubake-ai-prompt-btn')) {
            const rawQ = extractRawQuestionWithContext(qEl);
            let extractText = '';
            const extractEl = document.querySelector('fieldset.boxed.excerpt');
            if (extractEl) extractText = extractEl.textContent.replace(/\s+/g, ' ').trim();

            const choices = Array.from(document.querySelectorAll('label[role="option"]')).map(
                l => l.querySelector('.pre-line')?.textContent.trim() || l.textContent.trim()
            );

            const aiBtn = document.createElement('button');
            aiBtn.className = 'edubake-ai-prompt-btn';
            aiBtn.textContent = 'Copy AI Prompt';
            aiBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const singlePrompt = generateAIPromptSingleQuestion(rawQ, extractText, choices);
                navigator.clipboard.writeText(singlePrompt).then(() => {
                    aiBtn.textContent = '✓ Copied to Clipboard!';
                    setTimeout(() => {
                        aiBtn.textContent = 'Copy AI Prompt';
                    }, 2500);
                });
            });

            const container = qEl.closest('fieldset.question-text, .question-title, div');
            if (container) container.appendChild(aiBtn);
        }

        // AutoAnswer execution
        if (config.autoAnswer && correctAnswer && cleanQuestion !== currentProcessedQuestion && !isAutoRunning) {
            isAutoRunning = true;
            currentProcessedQuestion = cleanQuestion;

            const qContainer = qEl.closest('fieldset.question-text') || qEl.closest('.question-row') || qEl.parentElement;
            qContainer.classList.add('edubake-highlight');

            const roll = Math.random() * 100;
            const pickCorrect = roll <= config.accuracyPercent;

            const delayRange = Math.max(0, config.maxDelaySec - config.minDelaySec);
            const chosenDelayMs = (Math.random() * delayRange + config.minDelaySec) * 1000;

            const session = window.location.href;
            const epoch = quizEpoch;
            setTimeout(() => {
                if (epoch !== quizEpoch || !config.autoAnswer || window.location.href !== session || !qEl.isConnected || extractQuestionClean(qEl) !== cleanQuestion) { isAutoRunning = false; return; }
                qContainer.classList.remove('edubake-highlight');

                // 1. Text input handling
                const textInput = document.querySelector('input.answer-text, input[type="text"]');
                if (textInput) {
                    textInput.classList.add('edubake-highlight');
                    textInput.value = pickCorrect ? correctAnswer : 'N/A';
                    textInput.dispatchEvent(new Event('input', { bubbles: true }));
                    textInput.dispatchEvent(new Event('change', { bubbles: true }));
                }

                // 2. Multiple choice radio handling
                const options = Array.from(document.querySelectorAll('label[role="option"]'));
                if (options.length > 0) {
                    const normAns = normalizeString(correctAnswer);
                    let targetOption = options.find(l => {
                        const optText = normalizeString(l.querySelector('.pre-line')?.textContent || l.textContent);
                        return optText === normAns || optText.includes(normAns) || normAns.includes(optText);
                    });

                    if (!pickCorrect || !targetOption) {
                        targetOption = options.find(l => l !== targetOption) || options[0];
                    }

                    if (targetOption) {
                        targetOption.classList.add('edubake-highlight');
                        targetOption.click();
                    }
                }

                // 3. AutoSubmit execution
                if (config.autoSubmit) {
                    setTimeout(() => {
                        if (epoch === quizEpoch && config.autoAnswer && config.autoSubmit && window.location.href === session && qEl.isConnected) executeTwoStepSubmitAndAdvance();
                        else isAutoRunning = false;
                    }, 400);
                } else {
                    isAutoRunning = false;
                }
            }, chosenDelayMs);
        }
    }

    /**
     * REQUIREMENT 4: Guaranteed 2-Step Submit & Advance Orchestrator
     * Clicks the native "Submit" button first, verifies/waits, then clicks "Next question".
     */
    function executeTwoStepSubmitAndAdvance() {
        // Find Native Submit Button
        const session = window.location.href;
        const epoch = quizEpoch;
        const allButtons = Array.from(document.querySelectorAll('button'));
        const nativeSubmitBtn = allButtons.find(b => {
            const t = b.textContent.trim().toLowerCase();
            return (t === 'submit' || t.startsWith('submit')) && !b.classList.contains('edubake-fast-submit-btn');
        });

        if (nativeSubmitBtn) {
            Logger.info('Triggering Step 1: Native Submit click...');
            nativeSubmitBtn.classList.add('edubake-highlight');
            nativeSubmitBtn.click();

            // Wait for Educake to validate and present "Next question" button
            let attempts = 0;
            const checkInterval = setInterval(() => {
                if (session !== window.location.href || epoch !== quizEpoch) { clearInterval(checkInterval); isAutoRunning = false; return; }
                attempts++;
                const nextBtn = Array.from(document.querySelectorAll('button')).find(b => {
                    const t = b.textContent.trim().toLowerCase();
                    return t === 'next question' || t.includes('next question');
                });

                if (nextBtn) {
                    clearInterval(checkInterval);
                    Logger.info('Triggering Step 2: Next question click...');
                    nextBtn.classList.add('edubake-highlight');
                    nextBtn.click();
                    setTimeout(() => { isAutoRunning = false; }, 350);
                } else if (attempts > 15) {
                    clearInterval(checkInterval);
                    Logger.warn('Timed out waiting for "Next question" button.');
                    isAutoRunning = false;
                }
            }, 100);
        } else {
            // If already on the answered state, click Next Question directly
            const nextBtn = allButtons.find(b => {
                const t = b.textContent.trim().toLowerCase();
                return t === 'next question' || t.includes('next question');
            });
            if (nextBtn) {
                Logger.info('Submit already processed; clicking Next question directly.');
                nextBtn.click();
            }
            isAutoRunning = false;
        }
    }

    function ensureQuizUIHUD() {
        if (!isLiveQuizRoute()) return;
        if (document.getElementById('edubake-hud-pill')) return;

        const pill = document.createElement('div');
        pill.id = 'edubake-hud-pill';
        pill.innerHTML = `
            <div class="edubake-hud-num">--</div>
            <div class="edubake-hud-info">
                <span id="eb-hud-score">0%</span>
                <span id="eb-hud-wrong" style="color:#ef4444;">W: 0</span>
            </div>
        `;
        document.body.appendChild(pill);
    }

    function ensureFastSubmitButton() {
        if (!isLiveQuizRoute()) return;
        if (document.querySelector('.edubake-fast-submit-btn')) return;

        const answerBox = document.querySelector('div[data-v-9f7cfe60].flex-wrap') ||
                          document.querySelector('input.answer-text')?.parentElement;

        if (answerBox) {
            const btn = document.createElement('button');
            btn.className = 'edubake-fast-submit-btn';
            btn.textContent = 'Submit & Advance ➔';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                executeTwoStepSubmitAndAdvance();
            });
            answerBox.after(btn);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 15: METRICS ENGINE: WRONG COUNT & PERCENTAGE ACCURACY
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * REQUIREMENT 2: Computes mathematically sound wrong count and current percentage.
     */
    function computeQuizScoreMetrics() {
        let currentQ = 1;
        let totalQ = 1;
        let correctCount = 0;
        let currentPct = 0;

        // Parse Question X of Y
        const allH3 = Array.from(document.querySelectorAll('h3'));
        const qHeader = allH3.find(h => /(\d+)\s+of\s+(\d+)/i.test(h.textContent));
        if (qHeader) {
            const m = qHeader.textContent.match(/(\d+)\s+of\s+(\d+)/i);
            if (m) {
                currentQ = parseInt(m[1], 10) || 1;
                totalQ = parseInt(m[2], 10) || 1;
            }
        }

        // Parse Native Score Button e.g. "37 [tick] 74%"
        const scoreBtn = document.querySelector('.btn.blue.text-xl') ||
                         document.querySelector('.justify-end.flex .btn') ||
                         document.querySelector('.cursor-default.btn.blue');

        if (scoreBtn) {
            const text = scoreBtn.textContent.trim();
            const pctMatch = text.match(/(\d+)\s*%/);
            if (pctMatch) {
                currentPct = parseInt(pctMatch[1], 10);
            }
            const numMatch = text.match(/^(\d+)/);
            if (numMatch) {
                correctCount = parseInt(numMatch[1], 10);
            }
        }

        const marked = Array.from(document.querySelectorAll('button')).some(b => /next question/i.test(b.textContent));
        const answeredSoFar = Math.max(0, currentQ - (marked ? 0 : 1));
        const wrongCount = Math.max(0, answeredSoFar - correctCount);

        // If Educake doesn't provide % directly, calculate accurately
        if (!currentPct && answeredSoFar > 0) {
            currentPct = Math.round((correctCount / answeredSoFar) * 100);
        }

        return {
            currentQ,
            totalQ,
            correctCount,
            answeredSoFar,
            wrongCount,
            currentPct
        };
    }

    function updateQuizHUDMetrics() {
        if (!isLiveQuizRoute()) return;

        const pill = document.getElementById('edubake-hud-pill');
        if (!pill) return;

        const metrics = computeQuizScoreMetrics();

        // 1. Display current question number by default
        setText(pill.querySelector('.edubake-hud-num'), metrics.currentQ);

        // 2. On hover, display exact % and exact wrong count
        const scoreEl = pill.querySelector('#eb-hud-score');
        const wrongEl = pill.querySelector('#eb-hud-wrong');

        setText(scoreEl, `${metrics.currentPct}% (${metrics.correctCount}/${metrics.answeredSoFar})`);
        setText(wrongEl, `Wrong: ${metrics.wrongCount} / ${config.maxAllowedWrong}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 16: SCORE MONITOR & SAFEGUARD MODALS
    // ─────────────────────────────────────────────────────────────────────────

    let alert50Shown = false;
    let alert95Shown = false;

    function monitorScoreAndSafeguards() {
        if (!config.showWrong || !isLiveQuizRoute()) {
            document.querySelector('.edubake-wrong-badge')?.remove();
            return;
        }

        const scoreBar = document.querySelector('.justify-end.flex .btn.blue.text-xl') ||
                         document.querySelector('.justify-end.flex .btn');
        if (!scoreBar) return;

        const metrics = computeQuizScoreMetrics();
        const pctUsed = Math.min(100, (metrics.wrongCount / config.maxAllowedWrong) * 100);

        // Dynamic Green-to-Red Interpolation
        const r = Math.round(34 + (239 - 34) * (pctUsed / 100));
        const g = Math.round(197 + (68 - 197) * (pctUsed / 100));
        const b = Math.round(94 + (68 - 94) * (pctUsed / 100));

        let indicator = document.querySelector('.edubake-wrong-badge');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'edubake-wrong-badge';
            scoreBar.parentNode.appendChild(indicator);
        }
        indicator.style.color = `rgb(${r}, ${g}, ${b})`;
        setText(indicator, `Wrong: ${metrics.wrongCount} / ${config.maxAllowedWrong} (${metrics.currentPct}%)`);

        // 50% Threshold Modal Alert: Autopilot
        if (pctUsed >= 50 && pctUsed < 95 && !alert50Shown) {
            alert50Shown = true;
            showEduBakeModal(
                "Autopilot Recommendation",
                `You have accumulated ${metrics.wrongCount} wrong answers (${Math.round(pctUsed)}% of your allowed threshold). Try using Autopilot to secure your score!`,
                "Enable Autopilot",
                () => {
                    config.autoAnswer = true;
                    config.autoSubmit = true;
                    StorageEngine.saveConfig(config);
                    location.reload();
                }
            );
        }

        // 95% Threshold Modal Alert: AnswerBot
        const isRetake = document.title.includes('Retake') || document.body.textContent.includes('(Retake)');
        if (pctUsed >= 95 && isRetake && !alert95Shown) {
            alert95Shown = true;
            showEduBakeModal(
                "Critical Score Warning",
                `Warning! You have used ${metrics.wrongCount} of ${config.maxAllowedWrong} allowed wrong answers. Activate AnswerBot to prevent failing this retake!`,
                "Enable AnswerBot",
                () => {
                    config.autoAnswer = true;
                    config.accuracyPercent = 100;
                    config.autoSubmit = true;
                    StorageEngine.saveConfig(config);
                    location.reload();
                }
            );
        }
    }

    function createEduBakeDialog(title) {
        const previousFocus = document.activeElement;
        const overlay = document.createElement('div');
        overlay.className = 'edubake-modal-backdrop';
        const frame = document.createElement('div');
        frame.className = 'edubake-modal-frame';
        frame.setAttribute('role', 'dialog');
        frame.setAttribute('aria-modal', 'true');
        frame.setAttribute('aria-label', title);
        const heading = document.createElement('h3');
        heading.textContent = title;
        frame.appendChild(heading);
        overlay.appendChild(frame);
        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            document.removeEventListener('keydown', onKey, true);
            overlay.remove();
            if (previousFocus?.isConnected) previousFocus.focus();
            overlay.dispatchEvent(new Event('edubake-close'));
        };
        function onKey(event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopImmediatePropagation();
                close();
            } else if (event.key === 'Tab') {
                const items = Array.from(frame.querySelectorAll('button, input, textarea, select, a[href]')).filter(el => !el.disabled);
                if (!items.length) return;
                const first = items[0], last = items[items.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        }
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(overlay);
        return {overlay, frame, close};
    }

    function showEduBakeModal(title, text, confirmText, onConfirm) {
        const {frame, close} = createEduBakeDialog(title);
        const content = document.createElement('p');
        content.textContent = text;
        frame.appendChild(content);
        const row = document.createElement('div');
        row.className = 'edubake-modal-btn-row';
        const confirmButton = document.createElement('button');
        confirmButton.type = 'button';
        confirmButton.className = 'btn blue px-4 py-2 font-semibold';
        confirmButton.textContent = confirmText;
        confirmButton.onclick = () => { close(); onConfirm?.(); };
        const dismissButton = document.createElement('button');
        dismissButton.type = 'button';
        dismissButton.className = 'btn px-4 py-2 bg-gray-700 text-white';
        dismissButton.textContent = 'Close';
        dismissButton.onclick = close;
        row.append(confirmButton, dismissButton);
        frame.appendChild(row);
        confirmButton.focus();
    }

    let updateModalShown = false;
    function showUpdateNotes(manual = false) {
        if (document.getElementById('edubake-update-modal')) return;
        if (!manual) {
            if (updateModalShown || document.querySelector('.edubake-modal-backdrop')) return;
            try {
                const seen = typeof GM_getValue === 'function'
                    ? GM_getValue('edubake_last_seen_version', '')
                    : localStorage.getItem('edubake_last_seen_version');
                if (seen === SCRIPT_VERSION) { updateModalShown = true; return; }
            } catch (error) { Logger.warn('Could not read update history.', error); }
        }
        const {overlay, frame, close} = createEduBakeDialog(`What’s new in EduBake ${SCRIPT_VERSION}`);
        overlay.id = 'edubake-update-modal';
        updateModalShown = true;
        // Mark as seen only after dismissal, so an unread update returns after reload.
        overlay.addEventListener('edubake-close', () => {
            try {
                if (typeof GM_setValue === 'function') GM_setValue('edubake_last_seen_version', SCRIPT_VERSION);
                else localStorage.setItem('edubake_last_seen_version', SCRIPT_VERSION);
            } catch (error) { Logger.warn('Could not save update history.', error); }
        }, {once: true});
        const list = document.createElement('ul');
        list.style.cssText = 'text-align:left;color:#ddd;line-height:1.6;padding-left:22px';
        RELEASE_NOTES.forEach(note => {
            const item = document.createElement('li');
            item.textContent = note;
            list.appendChild(item);
        });
        frame.appendChild(list);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn blue px-4 py-2 font-semibold';
        button.textContent = 'Got it';
        button.onclick = close;
        frame.appendChild(button);
        button.focus();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 17: COMPLETE DASHBOARD & TABLE REBUILDER (ALL ROWS GET RESULTS)
    // ─────────────────────────────────────────────────────────────────────────

    function patchQuizTables() {
        const grids = document.querySelectorAll('div[role="grid"].grid');
        grids.forEach(grid => {
            // Apply 6-column grid template
            grid.classList.remove('md:grid-cols-[20%_1fr_20%_17%]', 'grid-cols-[1fr_20%_17%]');
            grid.style.gridTemplateColumns = '14% 1fr 100px 14% 14% 90px';

            // Upgrade Header Row
            const headerRow = grid.querySelector('.box-3.font-bold');
            if (headerRow && !headerRow.dataset.edubakeHeadDone) {
                headerRow.dataset.edubakeHeadDone = 'true';
                headerRow.classList.remove('col-span-3', 'md:col-span-4');
                headerRow.style.gridColumn = 'span 6';

                const headers = headerRow.querySelectorAll(':scope > div');
                if (headers.length >= 4 && !Array.from(headers).some(h => h.textContent.trim() === 'Questions')) {
                    const qHead = document.createElement('div');
                    qHead.textContent = 'Questions';
                    headers[1].after(qHead);

                    const addOnHead = document.createElement('div');
                    addOnHead.textContent = 'Add-Ons';
                    headerRow.appendChild(addOnHead);
                }
            }

            // CRITICAL FIX: Ensure EVERY body row in the table receives Questions & Results
            const rows = grid.querySelectorAll('div.quiz[role="button"]');
            rows.forEach(row => {
                row.classList.remove('col-span-3', 'md:col-span-4');
                row.style.gridColumn = 'span 6';

                if (row.dataset.edubakeRowDone === 'true') {
                    return;
                }

                const cols = row.querySelectorAll(':scope > div');
                if (cols.length >= 4) {
                    const nameCol = cols[1];
                    const fullText = nameCol.textContent.trim();

                    // Parse out question count (e.g. "29 Qs", "26 Qs", "100 Qs")
                    const match = fullText.match(/\(([^)]*Qs?[^)]*)\)/i);

                    let qCount = '-';
                    if (match) {
                        qCount = match[1];
                        nameCol.textContent = fullText.replace(match[0], '').trim();
                    }

                    // Insert Questions column
                    const qDiv = document.createElement('div');
                    qDiv.className = 'text-sm font-semibold opacity-90';
                    qDiv.textContent = qCount;
                    nameCol.after(qDiv);

                    // Insert Add-Ons Results column
                    const addOnDiv = document.createElement('div');
                    const resultsBtn = document.createElement('button');
                    resultsBtn.className = 'btn blue text-xs py-1 px-2.5 rounded font-semibold';
                    resultsBtn.textContent = 'Results';

                    resultsBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();

                        const matchId = window.location.href.match(/\/(\d{5,})/);
                        if (matchId) {
                            window.location.href = `https://my.educake.co.uk/my-educake/quiz-result/${matchId[1]}`;
                        } else {
                            const origPush = history.pushState;
                            history.pushState = function (_, __, url) {
                                origPush.apply(history, arguments);
                                if (url && url.includes('/quiz/')) {
                                    window.location.href = url.replace('/quiz/', '/quiz-result/');
                                }
                            };
                            row.click();
                        }
                    });

                    addOnDiv.appendChild(resultsBtn);
                    row.appendChild(addOnDiv);

                    row.dataset.edubakeRowDone = 'true';
                }
            });
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 18: SETTINGS PANELS (DRAWER & INLINE)
    // ─────────────────────────────────────────────────────────────────────────

    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
    }

    function generateSettingsHTML(prefix) {
        return `
            <div class="eb-group"><button type="button" class="btn blue" id="${prefix}-updates">What’s new · ${SCRIPT_VERSION}</button></div>
            <div class="eb-group">
                <h4>Appearance</h4>
                <div class="eb-row">
                    <span>Real Dark Mode</span>
                    <input type="checkbox" id="${prefix}-dark" ${config.realDark ? 'checked' : ''}>
                </div>
                <div class="eb-row">
                    <span>Transparent Glass UI</span>
                    <input type="checkbox" id="${prefix}-trans" ${config.transparentUI ? 'checked' : ''}>
                </div>
                <div class="eb-row">
                    <span>EduBake QuizUI 2.0 (Centered)</span>
                    <input type="checkbox" id="${prefix}-qui2" ${config.quizUI2 ? 'checked' : ''}>
                </div>
                <div class="eb-row">
                    <span>Cursor Style</span>
                    <select id="${prefix}-cursor-style">
                        <option value="none" ${config.cursorStyle === 'none' ? 'selected' : ''}>Default</option>
                        <option value="shiny-dot" ${config.cursorStyle === 'shiny-dot' ? 'selected' : ''}>Shiny Dot + Snow</option>
                        <option value="crosshair" ${config.cursorStyle === 'crosshair' ? 'selected' : ''}>Crosshair</option>
                        <option value="custom" ${config.cursorStyle === 'custom' ? 'selected' : ''}>Custom GIF/Image</option>
                    </select>
                </div>
                <div class="eb-row" id="${prefix}-custom-cursor-row" style="display:${config.cursorStyle === 'custom' ? 'flex' : 'none'};">
                    <span>Cursor URL/GIF</span>
                    <input type="text" id="${prefix}-cursor-url" placeholder="Paste GIF link..." value="${escapeHTML(config.customCursorUrl || '')}">
                </div>
            </div>

            <div class="eb-group">
                <h4>Accent Colour</h4>
                <div class="eb-row">
                    <span>Preset</span>
                    <select id="${prefix}-accent-sel">
                        <option value="blue" ${config.accentPreset === 'blue' ? 'selected' : ''}>Blue</option>
                        <option value="purple" ${config.accentPreset === 'purple' ? 'selected' : ''}>Purple</option>
                        <option value="green" ${config.accentPreset === 'green' ? 'selected' : ''}>Green</option>
                        <option value="pink" ${config.accentPreset === 'pink' ? 'selected' : ''}>Pink</option>
                        <option value="orange" ${config.accentPreset === 'orange' ? 'selected' : ''}>Orange</option>
                        <option value="red" ${config.accentPreset === 'red' ? 'selected' : ''}>Red</option>
                        <option value="custom" ${config.accentPreset === 'custom' ? 'selected' : ''}>Custom Picker</option>
                        <option value="rainbow" ${config.accentPreset === 'rainbow' ? 'selected' : ''}>Rainbow Dynamic</option>
                    </select>
                </div>
                <div class="eb-row" id="${prefix}-custom-row" style="display:${config.accentPreset === 'custom' ? 'flex' : 'none'};">
                    <span>Pick Accent</span>
                    <input type="color" id="${prefix}-custom-col" value="${escapeHTML(config.customAccentColor)}">
                </div>
                <div id="${prefix}-rainbow-box" style="display:${config.accentPreset === 'rainbow' ? 'block' : 'none'};">
                    <div class="eb-row">
                        <span>Rainbow Speed</span>
                        <select id="${prefix}-rain-speed">
                            <option value="slow" ${config.rainbowSpeed === 'slow' ? 'selected' : ''}>Slow Ambient</option>
                            <option value="normal" ${config.rainbowSpeed === 'normal' ? 'selected' : ''}>Normal</option>
                            <option value="fast" ${config.rainbowSpeed === 'fast' ? 'selected' : ''}>Fast Strobe</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="eb-group">
                <h4>Custom Background (20-Stage Fallback Pipeline)</h4>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <input type="text" id="${prefix}-bg-url" placeholder="Paste image or GIF URL..." value="${escapeHTML(config.bgSourceUrl || '')}">
                    <div style="display:flex; gap:6px;">
                        <label class="btn blue text-xs py-1 px-2.5 rounded cursor-pointer" style="flex:1; text-align:center;">
                            Upload File/GIF <input type="file" id="${prefix}-bg-file" accept="image/*" style="display:none;">
                        </label>
                        <button id="${prefix}-bg-clear" class="btn text-xs py-1 px-2 bg-gray-700 text-white rounded">Clear</button>
                    </div>
                    <small id="${prefix}-bg-status" style="color:#aaa; font-size:0.78rem;">Status: Non-Base64 IndexedDB Storage Active</small>
                </div>
            </div>

            <div class="eb-group">
                <h4>Automation & Limits</h4>
                <div class="eb-row">
                    <span>Auto-Answer</span>
                    <input type="checkbox" id="${prefix}-auto-ans" ${config.autoAnswer ? 'checked' : ''}>
                </div>
                <div class="eb-row">
                    <span>Auto-Submit</span>
                    <input type="checkbox" id="${prefix}-auto-sub" ${config.autoSubmit ? 'checked' : ''}>
                </div>
                <div class="eb-row">
                    <span>Target Accuracy (%)</span>
                    <input type="number" id="${prefix}-accuracy" min="10" max="100" style="width:58px;" value="${config.accuracyPercent}">
                </div>
                <div class="eb-row">
                    <span>Delay Min / Max (s)</span>
                    <div style="display:flex; gap:4px;">
                        <input type="number" id="${prefix}-mindelay" min="0" max="30" style="width:46px;" value="${config.minDelaySec}">
                        <input type="number" id="${prefix}-maxdelay" min="1" max="60" style="width:46px;" value="${config.maxDelaySec}">
                    </div>
                </div>
            </div>

            <div class="eb-group">
                <h4>Safeguards & Wrong Limits</h4>
                <div class="eb-row">
                    <span>Show Wrong Counter</span>
                    <input type="checkbox" id="${prefix}-show-wrong" ${config.showWrong ? 'checked' : ''}>
                </div>
                <div class="eb-row">
                    <span>Max Allowed Wrong</span>
                    <input type="number" id="${prefix}-max-wrong" min="1" max="100" style="width:58px;" value="${config.maxAllowedWrong}">
                </div>
            </div>

            <div class="eb-group">
                <h4>AI Answer Database & Importer</h4>
                <div style="display:flex; flex-direction:column; gap:6px; margin-top:4px;">
                    <button class="btn text-xs py-1.5 px-2 rounded font-semibold" style="background:#7c3aed; color:#fff;" id="${prefix}-ai-import-btn">✨ Import AI JSON Answers</button>
                    <div style="display:flex; gap:6px;">
                        <button class="btn blue text-xs py-1 px-2 rounded font-semibold" style="flex:1;" id="${prefix}-db-export">Export DB</button>
                        <button class="btn text-xs py-1 px-2 bg-red-700 text-white rounded" id="${prefix}-db-clear">Wipe DB</button>
                    </div>
                </div>
            </div>

            <div class="eb-group" style="border-bottom:none;">
                <h4>JavaScript Payload Console</h4>
                <textarea class="edubake-console-box" id="${prefix}-js-code" placeholder="// Run JavaScript payloads live&#10;console.log('EduBake ready');"></textarea>
                <button class="btn blue text-xs w-full py-1 mt-1 rounded font-semibold" id="${prefix}-js-exec">Execute JS</button>
            </div>
        `;
    }

    function bindSettingsEvents(root, prefix) {
        root.querySelector(`#${prefix}-updates`)?.addEventListener('click', () => showUpdateNotes(true));
        root.querySelectorAll('button').forEach(button => { button.type = 'button'; });
        const bindCheckbox = (id, key) => {
            root.querySelector(`#${prefix}-${id}`)?.addEventListener('change', e => {
                config[key] = e.target.checked;
                if (key === 'autoAnswer' || key === 'autoSubmit') { quizEpoch++; isAutoRunning = false; currentProcessedQuestion = ''; }
                StorageEngine.saveConfig(config);
            });
        };

        bindCheckbox('dark', 'realDark');
        bindCheckbox('trans', 'transparentUI');
        bindCheckbox('qui2', 'quizUI2');
        bindCheckbox('auto-ans', 'autoAnswer');
        bindCheckbox('auto-sub', 'autoSubmit');
        bindCheckbox('show-wrong', 'showWrong');

        // Cursor style selector
        root.querySelector(`#${prefix}-cursor-style`)?.addEventListener('change', e => {
            config.cursorStyle = e.target.value;
            const customRow = root.querySelector(`#${prefix}-custom-cursor-row`);
            if (customRow) customRow.style.display = e.target.value === 'custom' ? 'flex' : 'none';
            StorageEngine.saveConfig(config);
        });

        // GIF / Custom Cursor URL
        root.querySelector(`#${prefix}-cursor-url`)?.addEventListener('change', async e => {
            const rawUrl = e.target.value.trim();
            config.customCursorUrl = rawUrl;
            StorageEngine.saveConfig(config);
        });

        // Numerical input bindings
        root.querySelector(`#${prefix}-accuracy`)?.addEventListener('input', e => {
            config.accuracyPercent = boundedNumber(e.target.value, 10, 100, 90);
            StorageEngine.saveConfig(config);
        });
        root.querySelector(`#${prefix}-mindelay`)?.addEventListener('input', e => {
            config.minDelaySec = boundedNumber(e.target.value, 0, 30, 2);
            config.maxDelaySec = Math.max(config.minDelaySec, config.maxDelaySec);
            StorageEngine.saveConfig(config);
        });
        root.querySelector(`#${prefix}-maxdelay`)?.addEventListener('input', e => {
            config.maxDelaySec = boundedNumber(e.target.value, config.minDelaySec, 60, 4);
            StorageEngine.saveConfig(config);
        });
        root.querySelector(`#${prefix}-max-wrong`)?.addEventListener('input', e => {
            config.maxAllowedWrong = boundedNumber(e.target.value, 1, 100, 8);
            StorageEngine.saveConfig(config);
        });

        // Accent Presets & Custom Color
        const sel = root.querySelector(`#${prefix}-accent-sel`);
        const cRow = root.querySelector(`#${prefix}-custom-row`);
        const rBox = root.querySelector(`#${prefix}-rainbow-box`);

        sel?.addEventListener('change', e => {
            config.accentPreset = e.target.value;
            if (cRow) cRow.style.display = e.target.value === 'custom' ? 'flex' : 'none';
            if (rBox) rBox.style.display = e.target.value === 'rainbow' ? 'block' : 'none';
            StorageEngine.saveConfig(config);
        });

        root.querySelector(`#${prefix}-custom-col`)?.addEventListener('input', e => {
            config.customAccentColor = e.target.value;
            StorageEngine.saveConfig(config);
        });

        root.querySelector(`#${prefix}-rain-speed`)?.addEventListener('change', e => {
            config.rainbowSpeed = e.target.value;
            StorageEngine.saveConfig(config);
        });

        // REQUIREMENT 9 & 10: NON-BASE64 BACKGROUND LOADER WITH 20 FALLBACKS
        const bgInput = root.querySelector(`#${prefix}-bg-url`);
        const bgStatus = root.querySelector(`#${prefix}-bg-status`);

        bgInput?.addEventListener('change', async (e) => {
            const rawUrl = e.target.value.trim();
            if (!rawUrl) {
                config.bgType = 'none';
                config.bgSourceUrl = '';
                await IndexedDBStorage.deleteBlob('primary_background');
                StorageEngine.saveConfig(config);
                if (bgStatus) bgStatus.textContent = 'Status: Background Cleared';
                return;
            }

            if (bgStatus) bgStatus.textContent = 'Status: Testing 20 Fallbacks...';

            try {
                const resolution = await AssetPipeline.executePipeline(rawUrl);
                if (resolution.data instanceof Blob) {
                    if (!await IndexedDBStorage.putBlob('primary_background', resolution.data)) throw new Error('Background storage failed');
                    config.bgRevision = (Number(config.bgRevision) || 0) + 1;
                    config.bgType = 'indexeddb';
                    config.bgSourceUrl = rawUrl;
                    config.bgActiveBlobKey = 'primary_background';
                    StorageEngine.saveConfig(config);
                    if (bgStatus) bgStatus.textContent = `Status: Loaded via Fallback Stage #${resolution.stage} (Cached in IndexedDB)`;
                } else if (typeof resolution.data === 'string') {
                    config.bgType = 'url';
                    config.bgSourceUrl = resolution.data;
                    StorageEngine.saveConfig(config);
                    if (bgStatus) bgStatus.textContent = `Status: Direct URL verified via Stage #${resolution.stage}`;
                }
            } catch (err) {
                Logger.error('20-Stage pipeline failed:', err);
                if (bgStatus) bgStatus.textContent = 'Status: Image failed to load; previous background kept';
            }
        });

        // Local File Upload -> Direct IndexedDB Blob (Zero Base64 string storage!)
        const fileInput = root.querySelector(`#${prefix}-bg-file`);
        fileInput?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                if (bgStatus) bgStatus.textContent = `Status: Saving ${file.name} to IndexedDB...`;
                if (!await IndexedDBStorage.putBlob('primary_background', file)) { if (bgStatus) bgStatus.textContent = 'Status: Storage failed; previous background kept'; return; }
                config.bgType = 'indexeddb';
                config.bgRevision = (Number(config.bgRevision) || 0) + 1;
                config.bgSourceUrl = file.name;
                config.bgActiveBlobKey = 'primary_background';
                StorageEngine.saveConfig(config);
                if (bgStatus) bgStatus.textContent = `Status: File Stored in IndexedDB (${Math.round(file.size / 1024)} KB)`;
                if (bgInput) bgInput.value = file.name;
            }
        });

        // Clear Background Button
        root.querySelector(`#${prefix}-bg-clear`)?.addEventListener('click', async () => {
            config.bgType = 'none';
            config.bgSourceUrl = '';
            await IndexedDBStorage.deleteBlob('primary_background');
            StorageEngine.saveConfig(config);
            if (bgInput) bgInput.value = '';
            if (bgStatus) bgStatus.textContent = 'Status: Background Cleared';
        });

        root.querySelector(`#${prefix}-ai-import-btn`)?.addEventListener('click', () => {
            openJSONImportModal();
        });

        root.querySelector(`#${prefix}-db-export`)?.addEventListener('click', () => {
            const db = StorageEngine.getAnswerDatabase();
            const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `EduBake_Database_${Date.now()}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        });

        root.querySelector(`#${prefix}-db-clear`)?.addEventListener('click', () => {
            if (confirm('Are you sure you want to wipe the answer database?')) {
                StorageEngine.saveAnswerDatabase({});
                alert('EduBake: Answer database wiped.');
            }
        });

        root.querySelector(`#${prefix}-js-exec`)?.addEventListener('click', () => {
            const code = root.querySelector(`#${prefix}-js-code`)?.value;
            if (code) {
                try {
                    const runner = new Function(code);
                    runner();
                } catch (err) {
                    alert(`EduBake JS Execution Error: ${err.message}`);
                }
            }
        });
    }

    function syncAllUIControls() {
        ['eb-panel', 'eb-drawer'].forEach(p => {
            const setCheckbox = (id, val) => {
                const el = document.querySelector(`#${p}-${id}`);
                if (el) el.checked = !!val;
            };
            const setValue = (id, val) => {
                const el = document.querySelector(`#${p}-${id}`);
                if (el) el.value = val;
            };

            setCheckbox('dark', config.realDark);
            setCheckbox('trans', config.transparentUI);
            setCheckbox('qui2', config.quizUI2);
            setCheckbox('auto-ans', config.autoAnswer);
            setCheckbox('auto-sub', config.autoSubmit);
            setCheckbox('show-wrong', config.showWrong);

            setValue('cursor-style', config.cursorStyle);
            setValue('cursor-url', config.customCursorUrl);
            setValue('accuracy', config.accuracyPercent);
            setValue('mindelay', config.minDelaySec);
            setValue('maxdelay', config.maxDelaySec);
            setValue('max-wrong', config.maxAllowedWrong);
            setValue('accent-sel', config.accentPreset);
            setValue('custom-col', config.customAccentColor);
            setValue('rain-speed', config.rainbowSpeed);
            setValue('bg-url', config.bgSourceUrl || '');

            const cRow = document.querySelector(`#${p}-custom-row`);
            const rBox = document.querySelector(`#${p}-rainbow-box`);
            if (cRow) cRow.style.display = config.accentPreset === 'custom' ? 'flex' : 'none';
            if (rBox) rBox.style.display = config.accentPreset === 'rainbow' ? 'block' : 'none';
            const cursorRow = document.querySelector(`#${p}-custom-cursor-row`);
            if (cursorRow) cursorRow.style.display = config.cursorStyle === 'custom' ? 'flex' : 'none';
        });
    }

    function mountInlinePanel() {
        const nativeFs = document.querySelector('fieldset.grid.grid-cols-1.md\\:grid-cols-2.gap-6') ||
                         document.querySelector('fieldset.grid');
        if (!nativeFs || document.querySelector('.bake-settings-panel')) return;

        const panel = document.createElement('div');
        panel.className = 'bake-settings-panel';
        panel.innerHTML = `
            <h3>EduBake Settings:</h3>
            <div style="display:flex; flex-direction:column; gap:12px;">
                ${generateSettingsHTML('eb-panel')}
            </div>
        `;
        nativeFs.parentNode.insertBefore(panel, nativeFs);
        bindSettingsEvents(panel, 'eb-panel');
    }

    function mountSideDrawer() {
        if (document.getElementById('edubake-side-drawer')) return;

        const drawer = document.createElement('div');
        drawer.id = 'edubake-side-drawer';
        drawer.innerHTML = `
            <div id="edubake-side-drawer-handle">‹</div>
            <div class="edubake-drawer-scrollable">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid var(--bake-accent); padding-bottom:8px;">
                    <h2 style="margin:0; font-size:1.35rem; color:var(--bake-accent);">${SCRIPT_NAME} ${SCRIPT_VERSION}</h2>
                    <button id="edubake-side-drawer-close" style="background:none; border:none; color:#aaa; font-size:1.4rem; cursor:pointer;">✕</button>
                </div>
                ${generateSettingsHTML('eb-drawer')}
            </div>
        `;
        document.body.appendChild(drawer);
        bindSettingsEvents(drawer, 'eb-drawer');

        const handle = drawer.querySelector('#edubake-side-drawer-handle');
        const closeBtn = drawer.querySelector('#edubake-side-drawer-close');

        // Mouse peek detection on screen edge
        document.addEventListener('mousemove', e => {
            const dist = window.innerWidth - e.clientX;
            if (dist < 40 && !drawer.classList.contains('opened')) drawer.classList.add('peeking');
            else if (dist > 80 && !drawer.classList.contains('opened')) drawer.classList.remove('peeking');
        });

        handle.addEventListener('click', () => {
            drawer.classList.toggle('opened');
            drawer.classList.remove('peeking');
            handle.textContent = drawer.classList.contains('opened') ? '›' : '‹';
        });

        closeBtn.addEventListener('click', () => {
            drawer.classList.remove('opened');
            handle.textContent = '‹';
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 19: HEADINGS, IDENTITIES & DYNAMIC GREETINGS
    // ─────────────────────────────────────────────────────────────────────────

    function updateHeadingsAndIdentity() {
        document.querySelectorAll('a[title="My account"], a.whitespace-nowrap').forEach(el => {
            if (el.textContent.trim().toLowerCase() === 'my account') {
                el.textContent = 'Settings';
                el.setAttribute('title', 'Settings');
            }
        });
        document.querySelectorAll('h3.text-purple').forEach(el => {
            if (el.textContent.trim().toLowerCase() === 'my account') {
                el.textContent = 'Settings';
            }
        });

        const educakeH3 = Array.from(document.querySelectorAll('h3.text-purple')).find(
            el => el.textContent.trim() === 'My Educake' || el.textContent.includes('Good ')
        );

        if (educakeH3 && !educakeH3.dataset.edubakeGreetingSet) {
            let firstName = 'Student';
            const nameEl = document.querySelector('span.hidden.lg\\:inline.ellipsis');
            if (nameEl) {
                const raw = nameEl.textContent.split('–')[0].trim();
                firstName = raw.split(' ')[0] || 'Student';
            }

            const currentHour = new Date().getHours();
            let timeGreeting = 'Morning';
            if (currentHour >= 12 && currentHour < 17) timeGreeting = 'Afternoon';
            else if (currentHour >= 17) timeGreeting = 'Evening';

            educakeH3.textContent = `Good ${timeGreeting}, ${firstName}`;
            educakeH3.dataset.edubakeGreetingSet = 'true';
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 20: DYNAMIC THEME APPLIER
    // ─────────────────────────────────────────────────────────────────────────

    function applyTheme() {
        const body = document.body;
        const root = document.documentElement;
        if (!body || !root) return;

        try {
            const accent = getActiveAccentHex();
            const contrast = calculateLuminanceContrast(accent);

            root.style.setProperty('--bake-accent', accent);
            root.style.setProperty('--bake-accent-text', contrast);
            root.style.setProperty(
                '--bake-accent-glow',
                accent.startsWith('hsl')
                    ? accent.replace(')', ', 0.45)').replace('hsl', 'hsla')
                    : 'rgba(59, 130, 246, 0.45)'
            );

            body.classList.toggle('bake-realdark', !!config.realDark);
            body.classList.toggle('bake-accent-active', true);
            body.classList.toggle('bake-transparent-ui', !!config.transparentUI);
            body.classList.toggle('edubake-qui2-active', !!config.quizUI2);
            body.classList.toggle('edubake-hide-top-header', !!config.hideTopHeader);
            body.classList.toggle('edubake-hide-navbar', !!config.hideNavBar);
            body.classList.remove('edubake-hide-excerpt');

            const onQuiz = isLiveQuizRoute();
            body.classList.remove('edubake-no-scroll');

            // Loading Screen Polish & Logo Masking
            const loadBox = document.querySelector('#student-experience-container #top.h-screen');
            if (loadBox) {
                loadBox.style.backgroundColor = config.realDark ? '#000000' : '#ffffff';

                const imgLogo = loadBox.querySelector('img[alt="Educake Logo"]');
                if (imgLogo && !imgLogo.classList.contains('edubake-masked-done')) {
                    imgLogo.classList.add('edubake-masked-done');
                    imgLogo.style.display = 'none';

                    const maskDiv = document.createElement('div');
                    maskDiv.className = 'edubake-logo-mask';
                    imgLogo.parentNode.insertBefore(maskDiv, imgLogo);
                }

                const loadingText = loadBox.querySelector('h4.font-normal');
                if (loadingText) loadingText.style.display = 'none';

                if (!document.querySelector('.edubake-progress-bar')) {
                    const bar = document.createElement('div');
                    bar.className = 'edubake-progress-bar';
                    loadBox.appendChild(bar);
                }
            }
        } catch (err) {
            Logger.error('applyTheme execution error:', err);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 21: LIFECYCLE SUPERVISOR & MUTATION OBSERVER
    // ─────────────────────────────────────────────────────────────────────────

    let isScheduled = false;

    function setText(el, value) { if (el && el.textContent !== String(value)) el.textContent = String(value); }
    function boundedNumber(value, min, max, fallback) { const n = value === '' ? NaN : Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; }
    function executeCycle() {
        if (!config.quizUI2 || !isLiveQuizRoute()) {
            document.getElementById('edubake-hud-pill')?.remove();
            document.querySelector('.edubake-fast-submit-btn')?.remove();
        }
        applyTheme();
        ensureBackgroundCanvas();
        applyCursorConfiguration();
        updateHeadingsAndIdentity();
        patchQuizTables();
        injectGetAnswersButton();
        handleActiveQuizAutomation();
        updateQuizHUDMetrics();
        monitorScoreAndSafeguards();
        mountInlinePanel();
        mountSideDrawer();
        showUpdateNotes();
    }

    document.addEventListener('keydown', e => { if (e.key === 'Escape') { document.querySelectorAll('.edubake-modal-backdrop').forEach(el => el.remove()); document.getElementById('edubake-side-drawer')?.classList.remove('opened'); } });
    function schedulePass() {
        if (isScheduled) return;
        isScheduled = true;
        setTimeout(() => {
            isScheduled = false;
            domObserver.disconnect();
            try { executeCycle(); } finally { domObserver.observe(document.documentElement, {childList:true, subtree:true}); }
        }, 120);
    }

    const domObserver = new MutationObserver(() => {
        schedulePass();
    });

    domObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    // Run first pass immediately
    schedulePass();
})();
