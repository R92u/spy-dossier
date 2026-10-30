'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Game}=require('../game');
function setup(){
 let now=1000;const secret='one-word-test-secret-at-least-32-characters',g=new Game({now:()=>now,profileSecret:secret}),people=Array.from({length:6},()=>g.session()),[host,...players]=people;
 people.forEach(s=>g.connection(s,true));g.act(host,'create',{name:'Host'});players.forEach((s,i)=>g.act(s,'join',{name:'P'+i,code:host.room}));const r=g.room(host);
 const ids=people.map((_,i)=>String(100000000000000010n+BigInt(i)));
 const settings={enabled:true,wheel:false,censored:true,pool:['oneword']};assert.throws(()=>g.act(host,'abilitySettings',settings));
 g.profiles.confirm(secret,{code:g.profiles.invite(host),userId:ids[0],name:'HostDiscord'});g.act(host,'voiceSettings',{enabled:true,radius:6});g.act(host,'abilitySettings',settings);
 const token=g.voice.connect({code:g.voice.invite(r,host),guildId:ids[0],channelId:ids[1],channelName:'Test',userId:ids[0]}).token;
 const poll=()=>g.voice.poll(token,{roster:ids});poll();players.forEach((s,i)=>g.voice.join(token,{code:g.voice.invite(r,s),userId:ids[i+1]}));
 g.act(host,'start',{word:'Маяк',theme:'Море',hint:'Свет',spyId:players[0].id});while(g.dealTo(r))g.act(players.find(s=>s.id===g.dealTo(r)),'ready');now+=4500;g.tick();poll();
 r.order=players.map(s=>s.id);r.current=players[1].id;
 return {g,r,host,players,poll,advance:ms=>{now+=ms;g.tick();}};
}
test('one-word interrupts any speaker anonymously, mutes everyone and completes one full circle',()=>{
 const {g,r,players,poll}=setup(),interrupted=r.current;g.act(players[0],'abilityUse');
 assert.equal(r.phase,'one-word');assert.equal(r.current,players[2].id);assert.equal(r.oneWord.order.at(-1),interrupted);
 assert.equal(new Set(r.oneWord.order).size,players.length);assert.equal(g.view(players[1]).room.ability.id,null);
 const order=[...r.oneWord.order];
 for(const id of order){
  assert.deepEqual(poll().allowed,[]);assert.equal(r.current,id);const speaker=players.find(s=>s.id===id);
  g.act(speaker,'oneWordType',{text:'Мо'});assert.equal(g.view(players.find(s=>s.id!==id)).room.oneWord.draft,'Мо');
  g.act(speaker,'oneWordSubmit',{text:'Море'});
 }
 assert.equal(r.phase,'playing');assert.equal(r.oneWord,null);assert.equal(r.current,order[0]);assert.ok(poll().allowed.length>0);
 assert.equal(r.abilityState.used,true);assert.throws(()=>g.act(players[0],'abilityUse'));
});
test('one-word rejects other writers, multiple words, empty submit and competing phases',()=>{
 const {g,r,host,players}=setup();g.act(players[0],'abilityUse');const speaker=players.find(s=>s.id===r.current);
 assert.throws(()=>g.act(host,'oneWordType',{text:'Word'}));assert.throws(()=>g.act(players[0],'oneWordSubmit',{text:'Word'}));
 for(const text of ['два слова','a\nb','<img>','x'.repeat(33)]){assert.throws(()=>g.act(speaker,'oneWordType',{text}));assert.throws(()=>g.act(speaker,'oneWordSubmit',{text}));}
 g.act(speaker,'oneWordType',{text:''});assert.throws(()=>g.act(speaker,'oneWordSubmit',{text:''}));
 for(const [s,action]of[[speaker,'next'],[host,'next'],[speaker,'voteStart'],[players[0],'guessStart'],[players[0],'abilityUse']])assert.throws(()=>g.act(s,action));
 g.act(speaker,'oneWordSubmit',{text:'северо-восток'});assert.equal(r.oneWord.entries[0].text,'северо-восток');
});
test('departed speakers and later seats do not stall the text circle',()=>{
 const {g,r,players,poll}=setup();g.act(players[0],'abilityUse');const original=[...r.oneWord.order];
 g.act(players.find(s=>s.id===original[0]),'leave');assert.equal(r.current,original[1]);assert.deepEqual(poll().allowed,[]);
 while(r.phase==='one-word')g.act(players.find(s=>s.id===r.current),'oneWordSubmit',{text:'Свет'});
 assert.equal(r.current,original[1]);assert.equal(r.oneWord,null);
});
test('an unavailable bot cannot consume the charge, and finishing releases the text mode',()=>{
 const {g,r,players,poll,advance}=setup();advance(7000);assert.throws(()=>g.act(players[0],'abilityUse'));assert.equal(r.abilityState.used,false);
 poll();g.act(players[0],'abilityUse');g.finish(r,'cancelled','Test');assert.equal(r.oneWord,null);assert.equal(poll().mode,'release');
});
