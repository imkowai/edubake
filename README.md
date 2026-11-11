# EduBake 3.0

An unofficial personal enhancement userscript for `https://my.educake.co.uk/*`.

## Install / update

Install [loader.user.js](https://raw.githubusercontent.com/imkowai/edubake/main/loader.user.js) in Tampermonkey. Keep one EduBake installation enabled: disable any old standalone copies when using the loader. The loader fetches the current `edubake.user.js` on each page load; GitHub may briefly cache updates. Existing loader v1.1.0 continues to work.

Open settings with the **EduBake** button or **Alt+E**. Release notes appear after each version change and can be reopened in **Data & updates**.

## QuizUI 3.0

- Borderless question container and question text, responsive choices, readable dashboard tables.
- Click the question (or focus it and press Enter) to copy a prompt containing the question, extract and choices. No separate Copy AI Prompt button.
- Font family, installed custom fonts, text size, corner radius, accent colour, light/dark surfaces and motion controls.
- **3.0 Default**, **Hacker**, **Anime**, **Alya**, **Build**, **Midnight** and **Sakura** themes. Hacker uses a monospace terminal presentation with text-style buttons.
- Generated Alisa Kujou mascot logo and Alya study wallpaper. Anime includes the animated Miku cursor; any image/GIF can be used as a sprite cursor.
- Optional recognition: confetti on a correct mark and a single red edge pulse on an incorrect mark. Reduced-motion settings use text feedback instead. Recognition uses native feedback or score changes after a submission; it does not guess from the colour of an unmarked answer.
- Build CSS editor, accent favicon, custom favicon/title, clock, focus timer, music player, diagnostics and settings/answer backups.

## Wallpaper and cursor loading

Use **Appearance → Wallpaper → Apply URL**, **Use sample image**, or upload a local image. The sample is `https://images3.alphacoders.com/132/1322308.jpeg`.

Images are downloaded using the userscript manager, decoded before use, stored as binary Blobs in IndexedDB and placed in a dedicated fixed background layer inside an isolated body stacking context. Blob URLs and a data-URL rendering fallback handle different image policies. There are no third-party image proxies. The previous wallpaper stays in place when a replacement fails. Images are limited to 25 MB.

If an image host blocks your browser or download, upload the file instead. Browser CSP, enterprise rules and image-host availability can still prevent a remote image from rendering; the status area reports errors. Custom GIF cursors use a throttled image follower rather than relying on animated OS cursor support.

## Auto+ / Groq

1. Open **Quiz & Auto+**, paste **your own** Groq key, and select **Save API key**.
2. Enable **Auto+**. Submission/advancing is a separate setting and starts off.
3. The model is `openai/gpt-oss-120b` through Groq's `/openai/v1/chat/completions` endpoint, using a strict JSON schema.

When enabled, question text, extract and choices are sent to Groq. For multiple choice, only an exact option in the submitted choices is accepted. An explanation appears below the question. The model is text-only here: diagram/image questions are skipped. Missing context, API errors, invalid answers or unsupported answer widgets require manual review; use **Retry Auto+** to retry. Delayed actions and in-flight requests are cancelled when paused or the question changes. API keys stay in userscript storage and are excluded from backups.

Saved-answer filling remains available and uses exact context-matched entries rather than fuzzy global guesses. Results pages have a **Save reviewed answers** action. Suggestions may be wrong; review explanations and native feedback.

Docs: [Groq compatibility](https://console.groq.com/docs/openai), [GPT-OSS 120B](https://console.groq.com/docs/model/openai/gpt-oss-120b), [structured outputs](https://console.groq.com/docs/structured-outputs).

## Login profiles and passkeys

Login styling preserves Educake's native student/staff controls and Google/Microsoft sign-in. Browser password-manager autocomplete remains supported.

**Profiles** offers a local vault encrypted with AES-256-GCM and a PBKDF2-SHA-256 passphrase-derived key (310,000 iterations and a random salt). Each write uses a fresh random IV. Unlock with your vault passphrase to choose a profile and fill the native form. Auto-sign-in is optional and happens only after you explicitly choose an unlocked profile. The vault locks after five minutes or leaving the page.

Optional passkey unlock uses WebAuthn PRF to encrypt a copy of the vault key. It requires a compatible browser/authenticator and is configured after passphrase unlock. This unlocks EduBake's **local** vault; it does not add native Educake passkey or TOTP support. Keep your vault passphrase as the fallback. No credentials or vault files are shipped in this repository.

## Music across browser tabs

The userscript can play a local audio file, a direct audio URL or link a media element on the current page. Cross-tab information requires the optional [browser media companion](extension/README.md).

With the companion installed and enabled, EduBake shows the title, artist and playback state of a playing track from supported browser tabs. Play/pause is available in the companion popup or the browser's media controls. Without it, the user interface clearly describes the userscript's tab limitation.

## Performance

The interface is isolated in a Shadow DOM. DOM updates are batched and ignore EduBake widgets; its own synchronous changes are applied with observation paused. Wallpapers and built-in assets are cached, cursor movement uses one animation frame per pointer update, particle counts and lifetimes are bounded, and idle pages do not continuously fetch resources. Clock/media intervals are only active when enabled. System reduced-motion preferences are respected.

## Development

Requires Node.js 20 or newer.

```sh
npm ci
npm run check
npm test
```

Tests run production source against DOM fixtures, fake IndexedDB and mocked image/Groq responses. They cover settings, wallpapers, cursor setup, exact-choice validation, cancellation, encrypted vault round trips, native login autofill, dashboard columns, version notes and media companion access boundaries. They do not call Groq, enroll a real authenticator or prove the live site's layout. API-key, passkey hardware and live Educake checks must be performed in your own browser.

For each release, bump both the userscript `@version` and `VERSION`, update `NOTES` and this document, run the checks, then push. Do not commit API keys, passwords or profile exports.
