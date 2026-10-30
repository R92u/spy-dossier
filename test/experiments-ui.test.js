'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {Game}=require('../game');
const source=fs.readFileSync(path.join(__dirname,'../public/experiments-ui.js'),'utf8');

function room(patch={}){
 return {code:'TABLE',hostId:'host',phase:'waiting',players:[],voice:{enabled:false},experiments:{enabled:true,flashWord:false,multiSpy:false,spyCount:1,spiesKnowEachOther:false,cooperative:false,micChaos:false,micChance:10,maxSpies:2},...patch};
}
function harness(initial=room(),me=initial.hostId){
 const handlers={},nodes=new Map(),calls=[],state={room:initial,me};
 const document={activeElement:null,getElementById:id=>nodes.get(id)||null,addEventListener:(name,handler)=>(handlers[name]??=[]).push(handler)};
 const context=vm.createContext({document,state,esc:value=>String(value).replaceAll('<','&lt;'),voiceSettings:()=>'<section class="voice-test">Discord</section>',act:(action,payload)=>calls.push({action,payload:JSON.parse(JSON.stringify(payload))})});
 vm.runInContext(source,context,{filename:'experiments-ui.js'});
 function control(id,tag){return {id,checked:/\schecked(?:\s|>)/.test(tag),disabled:/\sdisabled(?:\s|>)/.test(tag),value:tag.match(/\bvalue="([^"]*)"/)?.[1]||'',setAttribute(name,value){this[name]=value;}};}
 function render(next=state.room){
  state.room=next;const html=context.experimentSettings(next);nodes.clear();
  for(const [tag,id]of [...html.matchAll(/<input\b[^>]*\bid="([^"]+)"[^>]*>/g)].map(match=>[match[0],match[1]]))nodes.set(id,control(id,tag));
  for(const match of html.matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>(.*?)<\/select>/g)){
   const select=control(match[1],match[0].slice(0,match[0].indexOf('>')+1)),options=[...match[2].matchAll(/<option\b[^>]*>/g)].map(option=>option[0]);
   const selected=options.find(option=>/\sselected(?:\s|>)/.test(option))||options[0];select.value=selected?.match(/\bvalue="([^"]*)"/)?.[1]||'';nodes.set(select.id,select);
  }
  if(html.includes('id="experiment-mic-value"'))nodes.set('experiment-mic-value',{textContent:''});
  return html;
 }
 function emit(name,target){for(const handler of handlers[name]||[])handler({target});}
 render();
 return {state,nodes,calls,document,render,change(id,value){const target=nodes.get(id);assert(target,`${id} exists`);if(typeof value==='boolean')target.checked=value;else target.value=String(value);emit('change',target);},input(id,value){const target=nodes.get(id);target.value=String(value);emit('input',target);},blur(id){emit('focusout',nodes.get(id));document.activeElement=null;}};
}

test('master option reveals rules and Discord only for hosts outside cooperative mode',()=>{
 const ui=harness(room({experiments:{enabled:false}}));let html=ui.render();
 assert(ui.nodes.has('experiment-enabled'));assert(!ui.nodes.has('experiment-flash-word'));assert(!html.includes('voice-test'));
 html=ui.render(room());assert(ui.nodes.has('experiment-flash-word'));assert(html.includes('voice-test'));
 html=ui.render(room({experiments:{enabled:true,cooperative:true,maxSpies:2}}));assert(/<fieldset class="experiment-game-options" disabled/.test(html));assert(!html.includes('voice-test'));
 const guest=harness(room({experiments:{enabled:true,multiSpy:true,spyCount:2,spiesKnowEachOther:true,maxSpies:2}}),'guest');
 html=guest.render();assert(!/<(?:input|select|button)\b/.test(html));assert(html.includes('Шпионов: 2'));assert(html.includes('знают друг друга'));
});

test('solo disables several spies and cooperative regardless of apparent capacity',()=>{
 const ui=harness(room({testMode:true,experiments:{enabled:true,maxSpies:5}}));const html=ui.render();
 for(const id of ['experiment-enabled','experiment-multi-spy','experiment-cooperative'])assert.equal(ui.nodes.get(id).disabled,true,id);
 assert(html.includes('Несколько шпионов недоступны в одиночном тесте.'));
 ui.change('experiment-multi-spy',true);assert.equal(ui.calls.length,0);
 const radio=harness(room({abilities:{enabled:true,pool:['silence']}}));assert.equal(radio.nodes.get('experiment-enabled').disabled,true);
});

test('spy count follows capacity without concealing the previous server selection',()=>{
 const low=harness(room({experiments:{enabled:true,multiSpy:false,maxSpies:1}}));assert.equal(low.nodes.get('experiment-multi-spy').disabled,true);
 low.render(room({experiments:{enabled:true,multiSpy:true,spyCount:2,maxSpies:1}}));assert.equal(low.nodes.get('experiment-multi-spy').disabled,false,'host can turn it off after players leave');assert.equal(low.nodes.get('experiment-spy-count').disabled,true);
 const ui=harness(room({experiments:{enabled:true,multiSpy:true,spyCount:3,maxSpies:3}}));let html=ui.render();assert(html.includes('<option value="2"'));assert(html.includes('<option value="3"'));assert(!html.includes('<option value="4"'));
 html=ui.render(room({experiments:{enabled:true,multiSpy:true,spyCount:3,maxSpies:2}}));assert.equal(ui.nodes.get('experiment-spy-count').value,'3');assert(html.includes('3 — мало игроков'));assert(html.includes('минимум 7 игроков'));
});

test('microphone slider previews locally and submits exactly the eight mutable fields on change',()=>{
 const ui=harness(room({experiments:{enabled:true,flashWord:true,multiSpy:true,spyCount:2,spiesKnowEachOther:true,cooperative:false,micChaos:true,micChance:10,maxSpies:3}}));
 ui.document.activeElement=ui.nodes.get('experiment-mic-chance');ui.input('experiment-mic-chance',37);
 assert.equal(ui.calls.length,0);assert.equal(ui.nodes.get('experiment-mic-value').textContent,'37%');assert.equal(ui.nodes.get('experiment-mic-chance')['aria-valuetext'],'37%');
 assert(ui.render().includes('value="37"'),'a heartbeat render preserves a focused slider preview');
 ui.change('experiment-mic-chance',37);const {action,payload}=ui.calls[0];assert.equal(action,'experimentSettings');assert.equal(payload.micChance,37);
 assert.deepEqual(Object.keys(payload).sort(),['enabled','flashWord','multiSpy','spyCount','spiesKnowEachOther','cooperative','micChaos','micChance','suspicions','commonGround'].sort());
 assert.equal(payload.flashWord,true);assert.equal(payload.spiesKnowEachOther,true);assert(!('maxSpies'in payload));
 ui.blur('experiment-mic-chance');assert(ui.render().includes('value="10"'),'unfocused UI uses authoritative server data');
});

test('guest and started-round changes are ignored by the event handler',()=>{
 const ui=harness();ui.state.me='guest';ui.change('experiment-flash-word',true);assert.equal(ui.calls.length,0);
 ui.state.me='host';ui.state.room.phase='playing';ui.change('experiment-flash-word',true);assert.equal(ui.calls.length,0);
 assert(/<fieldset class="experiment-game-options" disabled/.test(ui.render()));
});

test('full UI payload enabling cooperative mode is normalized by the real backend',()=>{
 const game=new Game(),sessions=Array.from({length:6},()=>game.session()),[host,...players]=sessions;
 sessions.forEach(session=>game.connection(session,true));game.act(host,'create',{name:'Host'});players.forEach((session,index)=>game.act(session,'join',{name:'Player '+index,code:host.room}));
 game.act(host,'experimentSettings',{enabled:true,flashWord:true,multiSpy:true,spyCount:2,spiesKnowEachOther:true,cooperative:false,micChaos:true,micChance:37});
 game.act(host,'abilitySettings',{enabled:true,wheel:true,censored:false,pool:['coin']});game.act(host,'voiceSettings',{enabled:true,radius:1});
 const ui=harness(game.view(host).room,host.id);ui.change('experiment-cooperative',true);const {action,payload}=ui.calls[0];
 assert.equal(payload.flashWord,true);assert.equal(payload.multiSpy,true);assert.equal(payload.micChaos,true);
 game.act(host,action,payload);const result=game.view(host).room;
 assert.equal(result.experiments.cooperative,true);for(const key of ['flashWord','multiSpy','spiesKnowEachOther','micChaos'])assert.equal(result.experiments[key],false,key);
 assert.equal(result.experiments.spyCount,1);assert.equal(result.voice.enabled,false);assert.equal(result.abilities.enabled,false);
 const html=ui.render(result);assert(!html.includes('voice-test'));assert.equal(ui.nodes.get('experiment-flash-word').checked,false);
});
