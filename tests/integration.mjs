import {Window} from 'happy-dom';
import {IDBFactory} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../edubake.user.js',import.meta.url),'utf8');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const w=new Window({url:'https://my.educake.co.uk/my-educake/quiz/123456',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableComputedStyleRendering:true}});
const store=new Map([['edubake_profile_vault','{"old":"untouched"}']]),requests=[],errors=[];
let aiDelay=2,aiAnswer='soliloquy',needsContext=false,clipboard='',fontLoads=0;
w.addEventListener('error',e=>errors.push(e.message));w.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
w.GM_getValue=(k,f)=>store.has(k)?store.get(k):f;w.GM_setValue=(k,v)=>store.set(k,v);
w.GM_addStyle=css=>{const el=w.document.createElement('style');el.textContent=css;w.document.head.appendChild(el);};
w.Blob=Blob;w.File=File;w.indexedDB=new IDBFactory();Object.defineProperty(w,'crypto',{value:webcrypto});
w.FontFace=class{constructor(name,data){assert.equal(name,'EduBake Fredoka');assert(data.byteLength>0);}async load(){fontLoads++;return this;}};
Object.defineProperty(w.document,'fonts',{value:{add(){}}});
let objectId=0;const objects=new Map();w.URL.createObjectURL=blob=>{const value='blob:test-'+(++objectId);objects.set(value,blob);return value;};w.URL.revokeObjectURL=value=>objects.delete(value);
w.Image=class{naturalWidth=1600;set src(value){this._src=value;if(value)setTimeout(()=>value.includes('invalid')?this.onerror?.():this.onload?.(),1);}get src(){return this._src;}};
Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async value=>{clipboard=value;}}});
w.GM_xmlhttpRequest=options=>{
 requests.push(options);let aborted=false;
 const timer=setTimeout(()=>{
  if(aborted)return;
  if(options.url.includes('api.groq.com')){options.onload({status:200,responseText:JSON.stringify({choices:[{message:{content:JSON.stringify({answer:aiAnswer,explanation:'A concise explanation.',needs_context:needsContext})}}]})});return;}
  if(options.url.includes('invalid')){options.onload({status:404});return;}
  const name=options.url.endsWith('.ttf')?'fredoka-one.ttf':options.url.includes('alya-head-v31')?'alya-head-v31.webp':'alya-wallpaper.webp';
  const bytes=fs.readFileSync(new URL('../assets/'+name,import.meta.url));
  options.onload({status:200,response:options.responseType==='blob'?new Blob([bytes],{type:'image/webp'}):bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),responseHeaders:'content-type: image/webp'});
 },options.url.includes('api.groq.com')?aiDelay:1);
 return {abort(){aborted=true;clearTimeout(timer);options.onabort?.();}};
};
function fixture(choices=true,index=27){return `<div class="course-bar"><h2>GCSE English - Edexcel</h2><button>Hide score</button><button>Colours and fonts</button></div><div id="opaque-wrapper" style="background:rgb(64,64,64)"><fieldset class="boxed question-container"><div class="flex justify-between items-center"><h3>Question ${index} of 63</h3><div class="justify-end"><div class="cursor-default btn blue">20 <i class="icon-tick"></i>77%</div></div></div><fieldset class="boxed question-text"><div class="pre-line">What is this dramatic device called?<button class="edubake-ai-prompt-btn">Copy AI Prompt</button></div></fieldset><div class="answer">${choices?'<div class="flex flex-wrap">'+['chorus','dialogue','soliloquy'].map((value,i)=>`<label id="choice${i}" role="option"><input type="radio" name="answer" value="${value}"><div class="pre-line">${value}</div></label>`).join('')+'</div>':'<input class="answer-text" type="text" placeholder="Enter your answer">'}</div><button id="submit">Submit</button></fieldset></div>`;}
w.document.body.innerHTML='<main id="top">'+fixture()+'</main>';
const testAPI=`window.__test={get cfg(){return cfg},get lastSuggestion(){return lastSuggestion},save,setWallpaper,applyWallpaper,selectTheme,openSettings,renderTab,showUpdates,questionContext,copyQuestion,cancelQuizWork,schedule,prepareShortAnswer,recognitionEffect,positionClock,toast};`;
w.eval(source.replace('    if(document.body)boot();',testAPI+'\n    if(document.body)boot();'));
const api=w.__test,shadow=()=>w.document.getElementById('edubake-ui').shadowRoot;
await wait(250);
assert.equal(fontLoads,1);assert.equal(w.document.querySelectorAll('.eb-quiz-toolbar,.eb-explanation,.edubake-ai-prompt-btn').length,0);
const pill=shadow().querySelector('#edubake-hud-pill');assert(!pill.hidden);assert.equal(pill.querySelector('.pill-number').textContent,'27');assert.match(pill.querySelector('.pill-details').textContent,/77%/);
assert(w.document.querySelector('[data-eb-native-chrome]'));assert(w.document.body.classList.contains('eb-minimal'));
await api.copyQuestion();assert.match(clipboard,/soliloquy/);assert(!clipboard.includes('Copy AI Prompt'));
// Wallpaper is outside body and its opaque ancestors are explicitly cleared.
await api.setWallpaper('https://images3.alphacoders.com/132/1322308.jpeg');await wait(200);
const backdrop=w.document.getElementById('edubake-canvas-bg');assert.equal(backdrop.parentElement,w.document.documentElement);assert(!w.document.body.contains(backdrop));assert(w.document.documentElement.classList.contains('eb-wallpaper-layer'));assert(w.document.getElementById('opaque-wrapper').classList.contains('eb-wallpaper-pass-through'));
const opaque=w.document.getElementById('opaque-wrapper');assert.equal(opaque.style.getPropertyValue('background-color'),'transparent');assert.equal(opaque.style.getPropertyPriority('background-color'),'important');opaque.style.setProperty('background-color','rgb(64,64,64)','important');await wait(180);assert.equal(opaque.style.getPropertyValue('background-color'),'transparent');
const first=backdrop.style.backgroundImage;assert.match(first,/blob:test/);
await api.setWallpaper(new File(['png'],'same.png',{type:'image/png'}),true);await wait(200);const second=backdrop.style.backgroundImage;assert.notEqual(first,second);
await api.setWallpaper(new File(['png'],'same.png',{type:'image/png'}),true);await wait(200);assert.notEqual(second,backdrop.style.backgroundImage);
const lastGood=backdrop.style.backgroundImage;await assert.rejects(api.setWallpaper('https://example.test/invalid.png'));assert.equal(backdrop.style.backgroundImage,lastGood);
api.openSettings('appearance');
assert.deepEqual([...shadow().querySelector('#eb-field-fontFamily').options].map(o=>o.textContent),['Sans','Computer','Comic Sans','Fredoka One','Serif','Verdana']);
assert(!shadow().textContent.includes('Your study space'));assert(!shadow().querySelector('[data-tab=profiles]'));assert(!shadow().querySelector('.music'));
assert.equal(shadow().querySelectorAll('.nav svg').length,5);assert(shadow().querySelector('.brand img'));assert.equal(shadow().querySelector('.brand span').textContent,'EduBake');
assert.match(w.document.getElementById('edubake-favicon').href,/blob:test/);
api.selectTheme('hacker');assert.equal(w.document.body.dataset.ebTheme,'hacker');api.selectTheme('anime');await wait(150);assert.equal(w.document.body.dataset.ebCursor,'sprite');
// Only exact MC options are accepted. No permanent explanation widget is created.
store.set('edubake_groq_key',JSON.stringify('test-key-not-real'));api.cfg.autoPlus=true;api.cfg.minDelaySec=0;api.cfg.maxDelaySec=0;api.cfg.autoSubmit=false;api.cancelQuizWork();api.save();await wait(300);
assert(w.document.querySelector('input[value=soliloquy]').checked);assert.equal(w.document.querySelector('.eb-explanation'),null);
const groq=requests.find(r=>r.url.includes('api.groq.com'));assert.equal(JSON.parse(groq.data).model,'openai/gpt-oss-120b');assert.deepEqual(JSON.parse(JSON.parse(groq.data).messages[1].content).choices,['chorus','dialogue','soliloquy']);
aiAnswer='not an option';w.document.querySelectorAll('input[type=radio]').forEach(el=>el.checked=false);api.cancelQuizWork();api.schedule();await wait(250);assert.equal(w.document.querySelector('input:checked'),null);
// Free text can fill without an extract, and normalization is bounded to 3 words.
api.cancelQuizWork();w.document.querySelector('#top').innerHTML=fixture(false,28);aiAnswer='The FLOWERS!';needsContext=true;api.schedule();await wait(300);assert.equal(w.document.querySelector('.answer-text').value,'the flowers');
assert.equal(api.prepareShortAnswer('One two three').manual,false);assert.equal(api.prepareShortAnswer('One two three four').manual,true);assert.equal(api.prepareShortAnswer('0.5').manual,true);assert.equal(api.prepareShortAnswer('-4').manual,true);
aiAnswer='one two three four';let automaticSubmits=0;w.document.getElementById('submit').addEventListener('click',()=>automaticSubmits++);api.cfg.autoSubmit=true;w.document.querySelector('.answer-text').value='';api.cancelQuizWork();api.schedule();await wait(900);assert.equal(automaticSubmits,0);api.cfg.autoSubmit=false;assert.equal(w.document.querySelector('.answer-text').value,'');assert.equal(api.lastSuggestion.answer,aiAnswer);assert.match(shadow().querySelector('.toast').textContent,/Manual answer/);
// Pause prevents a late response from filling another question.
aiAnswer='flowers';aiDelay=500;api.cancelQuizWork();api.schedule();await wait(150);api.cfg.autoPlus=false;api.cancelQuizWork();await wait(600);assert.equal(w.document.querySelector('.answer-text').value,'');
// Alya appears on input focus, reacts per key, and hides on blur.
for(const d of shadow().querySelectorAll('dialog[open]'))d.close();const input=w.document.querySelector('.answer-text');input.getBoundingClientRect=()=>({left:100,top:300,width:500,height:50,bottom:350});input.focus();await wait(80);const peek=shadow().querySelector('.alya-peek');assert(!peek.hidden);assert(peek.classList.contains('visible'));
let bonks=0;peek.querySelector('img').animate=()=>{bonks++;return {cancel(){}};};input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'a',bubbles:true}));input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'b',bubbles:true}));assert.equal(bonks,2);input.blur();await wait(250);assert(peek.hidden);
// Clock dragging persists and clamps to the viewport; arrow keys also work.
api.cfg.clock=true;api.save();const clock=shadow().querySelector('.clock');clock.getBoundingClientRect=()=>({left:18,top:18,width:160,height:90});clock.setPointerCapture=()=>{};
clock.dispatchEvent(new w.PointerEvent('pointerdown',{button:0,pointerId:1,clientX:30,clientY:30,bubbles:true}));clock.dispatchEvent(new w.PointerEvent('pointermove',{pointerId:1,clientX:260,clientY:190,bubbles:true}));clock.dispatchEvent(new w.PointerEvent('pointerup',{pointerId:1,bubbles:true}));await wait(40);assert.equal(api.cfg.clockX,248);assert.equal(api.cfg.clockY,178);assert.equal(JSON.parse(store.get('edubake_v2_system_config')).clockX,248);clock.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(api.cfg.clockX,256);
// Notifications disappear; old profile data is not read, modified or deleted.
api.toast('Temporary notice');assert(!shadow().querySelector('.toast').hidden);await wait(2700);assert(shadow().querySelector('.toast').hidden);assert.equal(store.get('edubake_profile_vault'),'{"old":"untouched"}');
// Version notes acknowledge the new release once.
api.showUpdates(true);const update=[...shadow().querySelectorAll('.modal')].find(d=>d.open);assert(update);update.close();await wait(10);assert.equal(JSON.parse(store.get('edubake_last_seen_version')),'3.1.0');
assert(requests.filter(r=>!r.url.includes('api.groq.com')).every(r=>!r.headers?.Authorization));assert.deepEqual(errors,[]);
console.log('PASS: root wallpaper and opaque wrappers, replacement/failure preservation, clean quiz/pill, fonts/SVG icons/Alya branding, short text limits, exact MC validation, cancellation, peeking/bonking, draggable clock, transient notices and removed features.');
await w.happyDOM.close();
