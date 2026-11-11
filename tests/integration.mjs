import {Window} from 'happy-dom';
import {IDBFactory} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../edubake.user.js',import.meta.url),'utf8');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const w=new Window({url:'https://my.educake.co.uk/my-educake/quiz/123456',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableComputedStyleRendering:true}});
const store=new Map(),requests=[],errors=[];let aiDelay=2,aiAnswer='soliloquy';
w.addEventListener('error',e=>errors.push(e.message));w.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
w.GM_getValue=(k,f)=>store.has(k)?store.get(k):f;w.GM_setValue=(k,v)=>store.set(k,v);
w.GM_addStyle=css=>{const s=w.document.createElement('style');s.textContent=css;w.document.head.appendChild(s);};
w.Blob=Blob;w.File=File;w.indexedDB=new IDBFactory();Object.defineProperty(w,'crypto',{value:webcrypto});
let objectId=0;const objects=new Map();w.URL.createObjectURL=b=>{const u='blob:test-'+(++objectId);objects.set(u,b);return u;};w.URL.revokeObjectURL=u=>objects.delete(u);
w.Image=class {naturalWidth=1600;set src(v){this._src=v;if(v)setTimeout(()=>{if(v.includes('invalid'))this.onerror?.();else this.onload?.();},1);}get src(){return this._src;}};
let clipboard='';Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>{clipboard=text;}}});
w.GM_xmlhttpRequest=options=>{
 requests.push(options);let aborted=false;
 const timer=setTimeout(()=>{
  if(aborted)return;
  if(options.url.includes('api.groq.com')){
   options.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify({answer:aiAnswer,explanation:'A character speaks thoughts aloud while alone.',needs_context:false})}}]})});return;
  }
  const name=options.url.includes('/logo.webp')?'logo':'alya-wallpaper';const bytes=fs.readFileSync(new URL('../assets/'+name+'.webp',import.meta.url));
  options.onload({status:200,response:options.responseType==='blob'?new Blob([bytes],{type:'image/webp'}):bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),responseHeaders:'content-type: image/webp'});
 },options.url.includes('api.groq.com')?aiDelay:1);
 return {abort(){aborted=true;clearTimeout(timer);options.onabort?.();}};
};
function fixture(question='Many of the characters speak their thoughts aloud to the audience while they are alone on stage. What is this dramatic device called?',index=27){
 w.document.body.innerHTML=`<main id="top"><fieldset class="boxed question-container"><div class="flex justify-between items-center"><h3>Question ${index} of 63</h3><div class="justify-end"><div class="cursor-default btn blue">20 <i class="icon-tick"></i>77%</div></div></div><fieldset class="boxed question-text"><div class="pre-line">${question}<button class="edubake-ai-prompt-btn">Copy AI Prompt</button></div></fieldset><div class="answer"><div class="flex flex-wrap">${['chorus','dialogue','soliloquy'].map((v,i)=>`<label id="choice${i}" role="option" aria-label="${v}" aria-pressed="false"><input type="radio" name="answer" value="${v}"><div class="pre-line">${v}</div></label>`).join('')}</div></div><button id="submit">Submit</button></fieldset></main>`;
}
fixture();
const exportCode=`window.__test={get cfg(){return cfg},get profiles(){return profiles},get vault(){return vault},save,setWallpaper,applyWallpaper,selectTheme,openSettings,renderTab,showUpdates,questionContext,makePrompt,copyQuestion,cancelQuizWork,schedule,fillAnswer,unlockVault,lockVault,persistVault,seal,unseal,passwordKey,fillProfile,recognitionEffect,linkPageMedia};`;
w.eval(source.replace('    if(document.body)boot();',exportCode+'\n    if(document.body)boot();'));
const api=w.__test,shadow=()=>w.document.getElementById('edubake-ui').shadowRoot;
await wait(250);
assert(w.document.getElementById('edubake-ui'));
assert.equal(w.document.querySelectorAll('.edubake-ai-prompt-btn').length,0);
assert.equal(w.document.querySelectorAll('.eb-quiz-toolbar').length,1);
await api.copyQuestion();assert.match(clipboard,/soliloquy/);assert.match(clipboard,/Available choices/);assert(!clipboard.includes('Copy AI Prompt'));
// Wallpaper download, persistence and replacement use the supplied URL and a fresh cached blob.
await api.setWallpaper('https://images3.alphacoders.com/132/1322308.jpeg');await wait(200);
assert(requests.some(r=>r.url==='https://images3.alphacoders.com/132/1322308.jpeg'));
const first=w.document.getElementById('edubake-canvas-bg').style.backgroundImage;assert.match(first,/blob:test/);assert(w.document.body.classList.contains('eb-wallpaper'));
await api.setWallpaper(new File(['png'],'same.png',{type:'image/png'}),true);await wait(200);
const second=w.document.getElementById('edubake-canvas-bg').style.backgroundImage;assert.notEqual(first,second);
await api.setWallpaper(new File(['png'],'same.png',{type:'image/png'}),true);await wait(200);assert.notEqual(second,w.document.getElementById('edubake-canvas-bg').style.backgroundImage);
// Theme / font / radius / custom CSS via real settings controls.
api.openSettings('appearance');assert.equal(shadow().querySelectorAll('.theme').length,7);
api.selectTheme('hacker');assert.equal(w.document.body.dataset.ebTheme,'hacker');assert.equal(w.document.documentElement.style.getPropertyValue('--eb-radius'),'0px');
api.selectTheme('anime');await wait(200);assert.equal(w.document.body.dataset.ebCursor,'sprite');assert.match(w.document.getElementById('eb-cursor')?.src||shadow().querySelector('#eb-cursor')?.src,/blob:test/);
api.cfg.radius=29;api.cfg.fontFamily='mono';api.save();assert.equal(w.document.documentElement.style.getPropertyValue('--eb-radius'),'29px');
api.openSettings('build');const css=shadow().querySelector('textarea');css.value='body.eb-v3 { letter-spacing: .02em; }';[...shadow().querySelectorAll('button')].find(b=>b.textContent==='Apply CSS').click();await wait(100);assert.match(w.document.getElementById('edubake-custom-css').textContent,/letter-spacing/);
// Recognition obeys off/reduced-motion and creates only one bounded effect.
api.cfg.recognition=false;api.recognitionEffect(true);assert.equal(w.document.querySelectorAll('.eb-recognition').length,0);
api.cfg.recognition=true;api.recognitionEffect(true);assert.equal(w.document.querySelectorAll('.eb-confetti').length,36);await wait(1700);assert.equal(w.document.querySelectorAll('.eb-recognition').length,0);
// Explicit-choice Groq JSON, explanation, no key leakage to wallpaper requests.
store.set('edubake_groq_key',JSON.stringify('test-key-not-real'));api.cfg.autoPlus=true;api.cfg.minDelaySec=0;api.cfg.maxDelaySec=0;api.cfg.autoSubmit=false;api.cancelQuizWork();api.save();await wait(300);
const groq=requests.find(r=>r.url.includes('api.groq.com'));assert(groq);const body=JSON.parse(groq.data);assert.equal(body.model,'openai/gpt-oss-120b');assert.deepEqual(JSON.parse(body.messages[1].content).choices,['chorus','dialogue','soliloquy']);assert.equal(w.document.querySelector('input[value=soliloquy]').checked,true);assert.match(w.document.querySelector('.eb-explanation').textContent,/speaks thoughts/);
assert(requests.filter(r=>!r.url.includes('api.groq.com')).every(r=>!r.headers?.Authorization));
// Reject answers outside the supplied choices.
aiAnswer='invented option';w.document.querySelectorAll('input[type=radio]').forEach(i=>i.checked=false);api.cancelQuizWork();api.schedule();await wait(250);assert.equal(w.document.querySelector('input:checked'),null);assert.match(w.document.querySelector('.eb-explanation').textContent,/available options/);
// Pause cancels in-flight work.
aiAnswer='soliloquy';aiDelay=500;api.cancelQuizWork();api.schedule();await wait(150);api.cfg.autoPlus=false;api.cancelQuizWork();await wait(600);assert.equal(w.document.querySelector('input:checked'),null);
// Native marking triggers recognition from a score increase.
api.cfg.autoPlus=false;api.cfg.autoAnswer=false;api.cfg.recognition=true;api.cfg.reducedMotion=false;api.cfg.animations=true;
w.document.getElementById('submit').addEventListener('click',()=>{w.document.querySelector('.cursor-default').textContent='21 78%';const next=w.document.createElement('button');next.textContent='Next question';w.document.querySelector('.question-container').appendChild(next);});
w.document.getElementById('submit').click();await wait(450);assert.equal(w.document.querySelectorAll('.eb-recognition').length,1);w.document.querySelector('.eb-recognition').remove();
// Vault uses real WebCrypto, stored content never includes username/password.
await api.unlockVault('correct horse battery staple');api.profiles.push({name:'Test',username:'fixture-user',password:'secret-123'});await api.persistVault();const encrypted=store.get('edubake_profile_vault');assert(!encrypted.includes('secret-123'));assert(!encrypted.includes('fixture-user'));api.lockVault();assert.equal(api.profiles.length,0);await assert.rejects(api.unlockVault('wrong passphrase'));await api.unlockVault('correct horse battery staple');assert.equal(api.profiles[0].password,'secret-123');api.lockVault();
// Every version is acknowledged once and can be reopened.
for(const d of shadow().querySelectorAll('dialog[open]'))d.close();api.showUpdates(true);const update=[...shadow().querySelectorAll('dialog')].find(d=>d.getAttribute('aria-label')?.includes('3.0.0')&&d.classList.contains('modal'));assert(update);update.close();await wait(10);assert.equal(JSON.parse(store.get('edubake_last_seen_version')),'3.0.0');
// Login styling and encrypted-profile fill preserve the native form.
api.cfg.autoPlus=false;api.cfg.autoAnswer=false;api.cancelQuizWork();
w.happyDOM.setURL('https://my.educake.co.uk/login/student');
w.document.querySelector('#top').innerHTML='<form id="login"><label>Username<input type="text" name="username"></label><label>Password<input type="password"></label><button type="submit">Log in</button></form>';
let submitted=0;w.document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();submitted++;});api.schedule();await wait(150);
assert(w.document.querySelector('.eb-login-card'));assert(w.document.querySelector('.eb-profile-signin'));
api.cfg.autoSignin=false;await api.unlockVault('correct horse battery staple');await api.fillProfile(api.profiles[0]);assert.equal(w.document.querySelector('input[name=username]').value,'fixture-user');assert.equal(w.document.querySelector('input[type=password]').value,'secret-123');assert.equal(submitted,0);
api.cfg.autoSignin=true;await api.fillProfile(api.profiles[0]);await wait(150);assert.equal(submitted,1);api.lockVault();
// Dashboard layouts align both four- and five-column native tables, without duplication.
w.happyDOM.setURL('https://my.educake.co.uk/my-educake');
w.document.querySelector('#top').innerHTML='<h3>My Educake</h3>'+[4,5].map(n=>'<div role="grid" class="grid"><div class="box-3 font-bold">'+['Subject','Quiz name','Set by','Due','Score'].slice(0,n).map(t=>'<div>'+t+'</div>').join('')+'</div><div class="quiz" role="button">'+['English','A quiz (29 Qs)','Teacher','Tomorrow','90%'].slice(0,n).map(t=>'<div>'+t+'</div>').join('')+'</div></div>').join('');api.schedule();await wait(150);
for(const grid of w.document.querySelectorAll('.eb-table')){assert.equal(grid.querySelector('.font-bold').children.length,grid.querySelector('.quiz').children.length);assert.equal(grid.querySelector('.eb-count').textContent,'29 Qs');}
assert(w.document.querySelector('.eb-welcome'));api.schedule();await wait(150);assert.equal(w.document.querySelectorAll('.eb-count-header').length,2);assert.equal(w.document.querySelectorAll('.eb-result-cell').length,2);
// A title and accent favicon apply through settings.
api.cfg.customTitle='My study space';api.cfg.customAccentColor='#abcdef';api.save();assert.equal(w.document.title,'My study space');assert.match(decodeURIComponent(w.document.querySelector('#edubake-favicon').href),/#abcdef/);
// Observer settles: no repeated network/storage work on an idle page.
const count=requests.length;await wait(400);assert.equal(requests.length,count);assert.deepEqual(errors,[]);
console.log('PASS: boot, prompts, wallpaper URL/caching/replacement, seven themes, Miku, radius/CSS, recognition, Auto+ choice schema/fill/explanation/rejection/cancellation, encrypted vault, version notes, native login autofill/sign-in, dashboard alignment, branding and idle request stability.');
await w.happyDOM.close();
