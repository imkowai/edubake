'use strict';
const origins=['http://*/*','https://*/*'];
let updates=Promise.resolve();
function changeTracks(action){const next=updates.then(async()=>{const {tracks={}}=await chrome.storage.session.get('tracks');await action(tracks);await chrome.storage.session.set({tracks});});updates=next.catch(()=>{});return next;}
async function enabled(){return chrome.permissions.contains({origins});}
async function setup(){
 const granted=await enabled();
 await chrome.scripting.unregisterContentScripts({ids:['edubake-media']}).catch(()=>{});
 if(!granted)return;
 await chrome.scripting.registerContentScripts([{id:'edubake-media',matches:origins,js:['reporter.js'],runAt:'document_idle',persistAcrossSessions:true}]);
 const tabs=await chrome.tabs.query({});
 await Promise.allSettled(tabs.filter(t=>/^https?:/.test(t.url||'')).map(tab=>chrome.scripting.executeScript({target:{tabId:tab.id},files:['reporter.js']})));
}
chrome.runtime.onInstalled.addListener(setup);chrome.runtime.onStartup.addListener(setup);
chrome.permissions.onAdded.addListener(setup);
chrome.permissions.onRemoved.addListener(async()=>{
 await chrome.scripting.unregisterContentScripts({ids:['edubake-media']}).catch(()=>{});
 const tabs=await chrome.tabs.query({});await Promise.allSettled(tabs.map(tab=>chrome.tabs.sendMessage(tab.id,{type:'EB_STOP'})));
 await updates;await chrome.storage.session.remove('tracks');
});
async function latest(){await updates;if(!await enabled())return null;const {tracks={}}=await chrome.storage.session.get('tracks');return Object.values(tracks).sort((a,b)=>Number(b.playing)-Number(a.playing)||b.updated-a.updated)[0]||null;}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 (async()=>{
  if(message.type==='EB_GONE'&&sender.tab){await changeTracks(tracks=>{delete tracks[sender.tab.id];});return {ok:true};}
  if(message.type==='EB_TRACK'&&sender.tab){
   if(!await enabled())return {ok:false};const t=message.track;if(!t||typeof t.title!=='string')return {ok:false};
   await changeTracks(tracks=>{tracks[sender.tab.id]={title:t.title.slice(0,180),artist:String(t.artist||'').slice(0,120),playing:!!t.playing,tabId:sender.tab.id,updated:Date.now()};});return {ok:true};
  }
  if(message.type==='EB_SNAPSHOT'&&(sender.url?.startsWith('https://my.educake.co.uk/')||!sender.tab)){
   const track=await latest();return track?{title:track.title,artist:track.artist,playing:track.playing}:null;
  }
  if(message.type==='EB_CONTROL'&&!sender.tab){const track=await latest();if(track)await chrome.tabs.sendMessage(track.tabId,{type:'EB_TOGGLE'});return {ok:true};}
  return {ok:false};
 })().then(respond,e=>respond({error:e.message}));
 return true;
});
chrome.tabs.onRemoved.addListener(id=>changeTracks(tracks=>{delete tracks[id];}));
chrome.tabs.onUpdated.addListener((id,change)=>{if(change.status==='loading')changeTracks(tracks=>{delete tracks[id];});});
