// ==UserScript==
// @name         EduBake Loader
// @namespace    https://github.com/imkowai/edubake
// @version      1.0.0
// @description  Loads EduBake from your private GitHub repository.
// @match        https://my.educake.co.uk/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-end
// ==/UserScript==

(() => {
    'use strict';
    const tokenKey = 'edubake_github_token';
    GM_registerMenuCommand('EduBake: reset GitHub access', () => {
        GM_setValue(tokenKey, '');
        alert('Access reset. Reload to enter your token.');
    });
    let token = GM_getValue(tokenKey, '');
    if (!token) {
        token = prompt('EduBake: enter your fine-grained GitHub token with read-only Contents access to imkowai/edubake.');
        if (!token || !token.trim()) return;
        token = token.trim();
        GM_setValue(tokenKey, token);
    }
    GM_xmlhttpRequest({
        method: 'GET',
        url: 'https://api.github.com/repos/imkowai/edubake/contents/edubake.user.js?ref=main',
        headers: {
            Accept: 'application/vnd.github.raw+json',
            Authorization: 'Bearer ' + token,
            'X-GitHub-Api-Version': '2022-11-28'
        },
        timeout: 20000,
        onload(response) {
            if (response.status !== 200) {
                alert('EduBake could not load (HTTP ' + response.status + '). Check your token and repository access.');
                return;
            }
            const code = response.responseText;
            if (!code.startsWith('// ==UserScript==')) {
                alert('EduBake received an unexpected response.');
                return;
            }
            try {
                new Function('GM_addStyle', 'GM_getValue', 'GM_setValue', 'GM_xmlhttpRequest', code)(
                    GM_addStyle, GM_getValue, GM_setValue, GM_xmlhttpRequest
                );
            } catch (error) {
                console.error('EduBake failed to start:', error);
            }
        },
        onerror() { alert('EduBake could not reach GitHub.'); },
        ontimeout() { alert('EduBake loading timed out.'); }
    });
})();
