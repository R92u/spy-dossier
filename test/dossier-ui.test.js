'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/dossier-ui.js'),'utf8');

function room(patch={}){
 return {roundId:'round-a',phase:'reveal',role:'civilian',experiments:{flashWord:true},dossier:{canReveal:true,used:false,expiresAt:null},word:null,players:[],...patch};
}
function harness(initial=room()){
 let now=1000,nextTimer=0,closed=0;
 const timers=new Map(),requests=[],messages=[],classes=new Set();
 const strong={textContent:''},word={querySelector:()=>strong,classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name)}};
 const ready={disabled:false,textContent:''},outside={disabled:false};
 const dialog={open:true,querySelector:selector=>selector==='.dossier-word'?word:selector==='[data-dossier-ready]'?ready:null};
 const context=vm.createContext({
  state:{room:initial,me:'me'},token:'test-session',roleViewed:true,
  gameTime:()=>now,$:id=>id==='dossier'?dialog:null,
  document:{querySelector:()=>outside},
  esc:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  setTimeout:(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,at:now+delay});return id;},
  clearTimeout:id=>timers.delete(id),
  request:async(url,payload)=>{requests.push({url,payload});},toast:message=>messages.push(message),
  closeDossier:()=>{closed++;dialog.open=false;context.resetDossierTimers();}
 });
 vm.runInContext(source,context,{filename:'dossier-ui.js'});
 return {context,dialog,strong,ready,outside,classes,requests,messages,timers,get closed(){return closed;},
  advance:ms=>{now+=ms;for(const [id,timer]of [...timers])if(timer.at<=now){timers.delete(id);timer.callback();}}
 };
}
function cover(){let finish;const finished=new Promise(resolve=>{finish=resolve;});return {finish,folder:{querySelector:()=>({getAnimations:()=>[{finished}]})}};}

test('the one-second request waits for the cover and duplicate opening cannot consume it twice',async()=>{
 const ui=harness(),animation=cover();
 const first=ui.context.revealDossierWord(animation.folder);
 await ui.context.revealDossierWord(animation.folder);
 assert.equal(ui.requests.length,0);
 animation.finish();await first;
 assert.equal(ui.requests.length,1);
 assert.equal(ui.requests[0].url,'/api/action');
 assert.equal(ui.requests[0].payload.action,'dossierReveal');
});

test('closing a native dossier before its animation finishes does not consume the reveal',async()=>{
 const ui=harness(),animation=cover(),pending=ui.context.revealDossierWord(animation.folder);
 ui.dialog.open=false;ui.context.resetDossierTimers();animation.finish();await pending;
 assert.equal(ui.requests.length,0);
 ui.dialog.open=true;const retry=cover(),retried=ui.context.revealDossierWord(retry.folder);
 retry.finish();await retried;assert.equal(ui.requests.length,1);
});

test('an opening from a previous round cannot reveal the next round',async()=>{
 const ui=harness(),animation=cover(),pending=ui.context.revealDossierWord(animation.folder);
 ui.context.state.room=room({roundId:'round-b'});ui.context.resetDossierTimers();animation.finish();await pending;
 assert.equal(ui.requests.length,0);
});

test('the actual DOM word expires at the server-clock deadline without waiting for an SSE update',()=>{
 const r=room({word:'Маяк',dossier:{canReveal:false,used:true,expiresAt:2000}}),ui=harness(r);
 ui.context.syncDossierState(r);assert.equal(ui.strong.textContent,'Маяк');assert.equal(ui.ready.disabled,true);
 ui.advance(999);assert.equal(ui.strong.textContent,'Маяк');
 ui.advance(1);assert.equal(ui.strong.textContent,'Слово скрыто');assert.equal(ui.ready.disabled,false);
 assert.equal(ui.outside.disabled,false);assert.ok(ui.classes.has('word-expired'));assert.equal(ui.timers.size,0);
 ui.context.syncDossierState(r);assert.equal(ui.strong.textContent,'Слово скрыто','stale cached room.word must not reappear');
 assert.ok(!ui.context.dossierWord(r).includes('Маяк'));
});

test('spy and cooperative dossier markup never includes a secret word',()=>{
 const ui=harness();
 for(const role of ['spy','cooperative'])assert.equal(ui.context.dossierWord(room({role,word:'Секрет'})),'');
 assert.ok(ui.context.dossierWord(room({experiments:{flashWord:false},word:'<Маяк>'})).includes('&lt;Маяк&gt;'));
});

test('guess editing and teammate names follow private identity fields, not a shared spy role',()=>{
 const ui=harness(room({role:'spy',guesserId:'other'}));
 assert.equal(vm.runInContext('guessWriter(state.room)',ui.context),false);
 ui.context.state.room.guesserId='me';assert.equal(vm.runInContext('guessWriter(state.room)',ui.context),true);
 const players=[{id:'me',name:'Self'},{id:'other',name:'Ally'}];
 assert.equal(ui.context.dossierAllies(room({role:'spy',players,spyIds:null})), '');
 assert.equal(ui.context.dossierAllies(room({role:'civilian',players,spyIds:['other']})), '');
 assert.ok(ui.context.dossierAllies(room({role:'spy',players,spyIds:['me','other']})).includes('Ally'));
});

test('a rejected reveal closes the dossier and surfaces the failure instead of leaving an unusable card',async()=>{
 const ui=harness(),animation=cover();ui.context.request=async()=>{throw Error('Повторное открытие недоступно');};
 const pending=ui.context.revealDossierWord(animation.folder);animation.finish();await pending;
 assert.equal(ui.closed,1);assert.deepEqual(ui.messages,['Повторное открытие недоступно']);
});
