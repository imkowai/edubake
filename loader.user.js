// ==UserScript==
// @name         EduBake Loader
// @namespace    https://github.com/imkowai/edubake
// @version      1.1.0
// @description  Loads the latest EduBake version from GitHub.
// @match        https://my.educake.co.uk/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-end
// ==/UserScript==

(() => {
    'use strict';

    // Clear credentials saved by the previous private-repository loader.
    GM_setValue('edubake_github_token', '');

    GM_xmlhttpRequest({
        method: 'GET',
        url: 'https://raw.githubusercontent.com/imkowai/edubake/main/edubake.user.js',
        anonymous: true,
        timeout: 20000,

        onload(response) {
            if (response.status !== 200) {
                alert('EduBake could not load (HTTP ' + response.status + ').');
                return;
            }

            const code = response.responseText;
            if (!code || !code.trimStart().startsWith('// ==UserScript==')) {
                alert('EduBake received an unexpected response.');
                return;
            }

            try {
                new Function(
                    'GM_addStyle', 'GM_getValue',
                    'GM_setValue', 'GM_xmlhttpRequest', code
                )(
                    GM_addStyle, GM_getValue,
                    GM_setValue, GM_xmlhttpRequest
                );
            } catch (error) {
                console.error('EduBake failed to start:', error);
                alert('EduBake failed to start. See the browser console.');
            }
        },

        onerror() { alert('EduBake could not reach GitHub.'); },
        ontimeout() { alert('EduBake loading timed out.'); }
    });
})();
