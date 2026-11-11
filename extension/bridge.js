// Read-only metadata bridge, only on Educake. No URLs, audio or credentials leave a tab.
window.addEventListener('message',async event=>{
 if(event.source!==window||event.origin!==location.origin||event.data?.type!=='EDUBAKE_MEDIA_REQUEST')return;
 const track=await chrome.runtime.sendMessage({type:'EB_SNAPSHOT'}).catch(()=>null);
 window.postMessage({type:'EDUBAKE_MEDIA_STATUS',track},location.origin);
});
