# Optional browser media companion

A Chrome/Chromium Manifest V3 extension for displaying browser-wide media metadata in EduBake. The userscript cannot inspect other tabs by itself.

## Install

1. Download this repository using GitHub's **Code → Download ZIP** and extract it.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this `extension` folder.
3. Open the extension popup and choose **Enable browser-wide detection**. Chrome asks for access to HTTP/HTTPS pages so it can inspect media elements in those tabs.
4. Reload existing music tabs if needed. In EduBake, enable **Widgets → Show music player**.

The popup can play/pause the current track. The userscript receives only title, artist and playback state; playback commands are accepted only from the extension popup. The bridge operates only on `https://my.educake.co.uk/*`.

## Scope and privacy

- Detects accessible HTML audio/video elements and uses Media Session metadata when available, otherwise the page title.
- Does not record audio, read passwords, transmit data to a server or expose media URLs.
- Track state is held in extension session storage, cleared as tabs navigate/close or detection is disabled.
- Educake page scripts can observe the metadata shared through the page bridge. Only enable this integration if you want track titles shared with that page.
- Protected browser pages, some nested/cross-origin players and nonstandard streaming apps may not expose a detectable media element. There is no guaranteed view of the browser's internal global media-control list.
- Disable detection in the popup to revoke host permissions and stop reporting. Uninstall the extension to remove it entirely.

Hardware/browser extensions require manual installation; installing this repository's userscript does not install the companion automatically.
