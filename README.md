# EduBake 3.1

A minimal personal enhancement userscript for `https://my.educake.co.uk/*`.

## Install or update

Install [loader.user.js](https://raw.githubusercontent.com/imkowai/edubake/main/loader.user.js) in Tampermonkey. Existing loader v1.1.0 continues to work: reload Educake to fetch the update. Keep one EduBake installation enabled. GitHub may briefly cache a recent release.

The settings gear opens EduBake; **Alt+E** is the keyboard shortcut. Version notes appear once per release and can be reopened in **Data**.

## Minimal quiz view

- Native course headings, colour/font controls and duplicate score headers are hidden while taking a quiz.
- The actual question sits on a translucent card. Essential answer inputs, choices, extracts, native Submit/Next controls and feedback remain available.
- The compact bottom pill shows the question number. Hover, focus or tap to reveal accuracy and wrong-answer count.
- There is no persistent EduBake quiz toolbar or explanation panel. Notifications disappear after 2.6 seconds.
- Click the question, or focus it and press Enter, to copy a prompt containing its text, extract and choices.
- **Auto+** settings contain retry/pause controls and the last suggested answer when a manual review is needed.

Minimal view and the typing mascot can be disabled individually in Auto+ settings. Quiz layout can also be disabled without removing the rest of EduBake.

## Appearance

The new Alya icon is paired with a Fredoka wordmark and used as the default favicon. An explicit custom favicon URL remains supported. The old “Your study space” subtitle has been removed, and controls use SVG icons.

Font choices are **Sans**, **Computer**, **Comic Sans**, **Fredoka One**, **Serif** and **Verdana**, with a custom installed-font field. Fredoka One is bundled and loaded from font bytes; it does not require Google Fonts at runtime. Comic Sans uses the installed font where available, otherwise the browser's cursive fallback. The included Fredoka font retains its original copyright and SIL Open Font License in `assets/FREDOKA-OFL.txt`.

Theme presets, corner radius, accent colour, dimming, blur, custom title/favicon, custom CSS and Miku/custom GIF cursors remain available.

### Wallpaper layering

The fixed wallpaper now lives directly under the document root, **outside the site's body and app containers**, at layer 0. The body sits transparently above it at layer 1. The quiz's wrapper chain has opaque backgrounds and background images cleared using narrowly tracked inline overrides; previous inline values are restored when the wallpaper is cleared. If the site reapplies an opaque wrapper style, EduBake detects and clears it again. The question card remains translucent.

Use **Appearance → Wallpaper**, paste a URL and select **Apply URL**, or upload an image (up to 25 MB). The sample is `https://images3.alphacoders.com/132/1322308.jpeg`.

Images are verified before replacement and cached as binary Blobs in IndexedDB. There are no third-party image proxies. Blob and data-URL rendering paths are supported. A failed replacement preserves the working wallpaper. A host or enterprise browser policy can still block an external image; local upload is the fallback.

### Alya typing animation

When a quiz text field gains focus, Alya peeks up above it. Each typed key triggers a brief bonk animation, and she hides on blur. She does not receive pointer input or modify the answer. Reduced-motion preferences suppress the bonk animation.

### Draggable clock

Enable the clock under **Clock**. Drag it to move; the position is bounded to the viewport and saved locally. Keyboard users can focus it and use arrow keys. A focus timer remains available.

## Auto+

Save your own Groq key in **Auto+**, then enable Auto+. It uses `openai/gpt-oss-120b` through Groq's chat-completions endpoint with a strict JSON schema. Questions, extracts and choices are sent only when you enable the feature. API keys stay in userscript storage and are excluded from backups.

- Multiple choice must match an available option exactly.
- Free-text fields do **not** require an extract merely because they are free text. The model is prompted to use subject knowledge and return the shortest accepted answer.
- Automatic text filling is limited to **three words**, converted to lowercase and stripped of decorative punctuation. The one-to-three-word limit is also applied to cached answers.
- Longer answers are not entered or submitted automatically. A brief notification shows the suggestion, and **Auto+ → Last answer → Copy answer** provides manual access afterward.
- Decimal, negative, fractional or symbolic number formatting is left for manual entry rather than silently changing the mathematical value to remove punctuation.
- The integration is text-only, so diagrams are skipped. A blank/invalid response remains an error, rather than inventing an answer.
- Submission/advancing is a separate setting. Pending requests and delayed actions are cancelled when paused or the question changes.

Saved exact-answer filling, reviewed-answer caching on result pages, settings/answer backups, diagnostics and the advanced JavaScript console remain available.

## Removed features

Profiles, credential autofill, passkey vault UI, all music-player UI, media bridges and the optional media extension have been removed. Existing encrypted profile data is left untouched in userscript storage; this release does not read it. If you installed the earlier browser media companion, it is no longer used and can be uninstalled.

## Development

Node.js 20 or newer:

```sh
npm ci
npm run check
npm test
```

The regression suite executes production code against DOM fixtures, fake IndexedDB, verified fixture assets and mocked Groq responses. It covers wallpaper layer placement and recovery from opaque wrappers, failed replacements, minimal UI and pill, font/icon branding, short-answer rules, exact choice validation, cancellation, typing reactions, draggable-clock persistence, transient notices and removed features.

These are automated fixture checks, not a claim of a live authenticated Educake or real Groq test. For each release, bump both version declarations, update `NOTES`, run checks and push.
