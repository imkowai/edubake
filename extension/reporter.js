(() => {
 if(window.__edubakeMediaReporter)return;window.__edubakeMediaReporter=true;
 let last='',timer,enabled=true;
 const events=['play','pause','ended','loadedmetadata','emptied'];
 function selected(){const media=[...document.querySelectorAll('audio,video')];return media.find(m=>!m.paused&&!m.ended)||media[0];}
 function report(){
  if(!enabled)return;
  const media=selected();if(!media){if(last!=='empty'){last='empty';chrome.runtime.sendMessage({type:'EB_GONE'}).catch(()=>{});}clearInterval(timer);timer=null;return;}
  const metadata=navigator.mediaSession?.metadata;
  const track={title:metadata?.title||document.title||'Browser media',artist:metadata?.artist||'',playing:!media.paused&&!media.ended};
  const signature=JSON.stringify(track);if(signature!==last){last=signature;chrome.runtime.sendMessage({type:'EB_TRACK',track}).catch(()=>{});}
  if(track.playing&&!timer)timer=setInterval(report,5000);if(!track.playing&&timer){clearInterval(timer);timer=null;}
 }
 for(const event of events)document.addEventListener(event,report,true);
 chrome.runtime.onMessage.addListener(message=>{if(message.type==='EB_STOP'){enabled=false;clearInterval(timer);for(const event of events)document.removeEventListener(event,report,true);window.__edubakeMediaReporter=false;}if(message.type==='EB_TOGGLE'&&enabled){const m=selected();if(m){if(m.paused)m.play().catch(()=>{});else m.pause();}}});
 report();
})();
