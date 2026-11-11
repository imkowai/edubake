const status=document.getElementById('status'),origins=['http://*/*','https://*/*'];
document.getElementById('enable').onclick=async()=>{const granted=await chrome.permissions.request({origins});status.textContent=granted?'Media detection enabled. Reload existing music tabs if needed.':'Permission was not granted.';};
document.getElementById('disable').onclick=async()=>{await chrome.permissions.remove({origins});status.textContent='Detection disabled.';};
document.getElementById('toggle').onclick=()=>chrome.runtime.sendMessage({type:'EB_CONTROL'});
chrome.runtime.sendMessage({type:'EB_SNAPSHOT'}).then(t=>{if(t?.title)status.textContent=(t.playing?'Playing: ':'Paused: ')+t.title+(t.artist?' — '+t.artist:'');});
