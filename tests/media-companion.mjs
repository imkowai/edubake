import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const handlers={},data={},messages=[];let permission=true;
const event=name=>({addListener:fn=>handlers[name]=fn});
const chrome={
 permissions:{contains:async()=>permission,onAdded:event('added'),onRemoved:event('removed')},
 runtime:{onInstalled:event('installed'),onStartup:event('startup'),onMessage:event('message')},
 scripting:{unregisterContentScripts:async()=>{},registerContentScripts:async()=>{},executeScript:async()=>{}},
 tabs:{query:async()=>[],sendMessage:async(id,value)=>messages.push({id,value}),onRemoved:event('tabRemoved'),onUpdated:event('tabUpdated')},
 storage:{session:{get:async key=>({[key]:structuredClone(data[key])}),set:async value=>Object.assign(data,structuredClone(value)),remove:async key=>delete data[key]}}
};
vm.runInNewContext(fs.readFileSync(new URL('../extension/background.js',import.meta.url),'utf8'),{chrome,console,Date});
function send(message,sender){return new Promise(resolve=>handlers.message(message,sender,resolve));}
await Promise.all([send({type:'EB_TRACK',track:{title:'One',artist:'Artist',playing:true}},{tab:{id:1},url:'https://music.example/'}),send({type:'EB_TRACK',track:{title:'Two',playing:false}},{tab:{id:2},url:'https://video.example/'})]);
assert.equal(Object.keys(data.tracks).length,2);
const snapshot=await send({type:'EB_SNAPSHOT'},{tab:{id:3},url:'https://my.educake.co.uk/my-educake'});
assert.equal(snapshot.title,'One');assert(!('tabId' in snapshot));
assert.equal((await send({type:'EB_SNAPSHOT'},{tab:{id:4},url:'https://unrelated.example/'})).ok,false);
assert.equal((await send({type:'EB_CONTROL'},{tab:{id:3},url:'https://my.educake.co.uk/'})).ok,false);
await send({type:'EB_CONTROL'},{url:'chrome-extension://fixture/popup.html'});assert.equal(messages[0].id,1);
await send({type:'EB_GONE'},{tab:{id:1}});assert.equal((await send({type:'EB_SNAPSHOT'},{url:'chrome-extension://fixture/popup.html'})).title,'Two');
permission=false;await handlers.removed();await send({type:'EB_TRACK',track:{title:'Blocked',playing:true}},{tab:{id:1}});assert(!data.tracks);
assert.equal(await send({type:'EB_SNAPSHOT'},{url:'chrome-extension://fixture/popup.html'}),null);
console.log('PASS: companion track concurrency, playing-track priority, origin restriction, controls restricted to popup, removed tracks and permission revocation.');
