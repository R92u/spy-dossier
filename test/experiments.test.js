'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Game}=require('../game');

const profileSecret='experimental-rules-test-secret-123456789';
const defaults={enabled:true,flashWord:false,multiSpy:false,spyCount:1,spiesKnowEachOther:false,cooperative:false,micChaos:false,micChance:10};
function setup(count=5,patch={}){
 let now=1000;
 const g=new Game({now:()=>now,profileSecret}),people=Array.from({length:count+1},()=>g.session()),[host,...players]=people;
 people.forEach(s=>g.connection(s,true));g.act(host,'create',{name:'Host'});
 players.forEach((s,i)=>g.act(s,'join',{name:'Player '+i,code:host.room}));
 const r=g.rooms.get(host.room),ids=people.map((_,i)=>String(100000000000000010n+BigInt(i)));
 const configure=(changes={})=>g.act(host,'experimentSettings',{...defaults,...patch,...changes});
 const advance=ms=>{now+=ms;g.tick();};
 const start=()=>g.act(host,'start',{word:'Маяк',theme:'Море',hint:'Свет',spyId:players[0].id});
 const session=id=>people.find(s=>s.id===id);
 const ready=()=>{
  while(g.dealTo(r)){
   const s=session(g.dealTo(r));
   if(g.view(s).room.dossier?.canReveal){g.act(s,'dossierReveal');advance(1000);}
   g.act(s,'ready');
  }
  advance(4500);
 };
 const voteOut=id=>{
  const voters=players.filter(s=>r.players.find(p=>p.id===s.id)?.alive);
  g.act(voters[0],'voteStart');
  voters.forEach(s=>g.act(s,'vote',{targetId:id}));
  advance(g.voteMs);
 };
 let token;
 const connect=(radius=1)=>{
  g.act(host,'voiceSettings',{enabled:true,radius});
  token=g.voice.connect({code:g.voice.invite(r,host),guildId:'200000000000000001',channelId:'200000000000000002',channelName:'Experiments',userId:ids[0]}).token;
  poll();players.forEach((s,i)=>g.voice.join(token,{code:g.voice.invite(r,s),userId:ids[i+1]}));
 };
 const poll=()=>g.voice.poll(token,{roster:ids});
 const profile=()=>g.profiles.confirm(profileSecret,{code:g.profiles.invite(host),userId:ids[0],name:'HostDiscord'});
 return {g,r,host,players,people,ids,configure,advance,start,ready,voteOut,session,connect,poll,profile};
}

test('experiments are host-only, validated, opt-in, and frozen after starting',()=>{
 const x=setup(),{g,r,host,players,configure,start}=x;
 assert.equal(g.view(host).room.experiments.enabled,false);
 assert.throws(()=>g.act(players[0],'experimentSettings',defaults));
 for(const patch of [{enabled:1},{micChance:0},{micChance:101},{micChance:1.5},{spyCount:0},{spyCount:6},{multiSpy:'yes'}])assert.throws(()=>configure(patch));
 configure({flashWord:true,micChaos:true,micChance:37});
 assert.equal(g.view(players[0]).room.experiments.micChance,37);
 assert.equal(g.view(host).room.experiments.maxSpies,2);
 start();assert.throws(()=>configure({enabled:false}));assert.equal(r.phase,'reveal');
});

test('one-second dossier keeps the word private before opening and after its exact deadline',()=>{
 const x=setup(4,{flashWord:true}),{g,r,host,players,configure,start,advance}=x;
 configure();start();
 const reader=players[1],other=players[2];r.order=[reader.id,...r.order.filter(id=>id!==reader.id)];
 assert.equal(g.view(reader).room.word,null);
 assert.equal(g.view(reader).room.dossier.canReveal,true);
 assert.equal(g.view(reader).room.dossier.used,false);
 assert.equal(g.view(host).room.word,'Маяк');
 assert.throws(()=>g.act(other,'dossierReveal'));
 assert.throws(()=>g.act(host,'dossierReveal'));
 assert.throws(()=>g.act(players[0],'dossierReveal'));
 assert.throws(()=>g.act(reader,'ready'));
 g.act(reader,'dossierReveal');
 const dossier=g.view(reader).room.dossier;
 assert.equal(dossier.used,true);assert.equal(dossier.expiresAt,2000);
 assert.equal(g.view(reader).room.word,'Маяк');
 assert.equal(g.view(other).room.word,null);
 assert.equal(g.view(players[0]).room.word,null);
 assert.throws(()=>g.act(reader,'dossierReveal'));
 advance(999);assert.equal(g.view(reader).room.word,'Маяк');assert.throws(()=>g.act(reader,'ready'));
 advance(1);assert.equal(g.view(reader).room.word,null);g.act(reader,'ready');
 assert.throws(()=>g.act(reader,'dossierReveal'));
 x.ready();assert.equal(g.view(reader).room.word,null);
 g.act(players[0],'guessStart');g.act(players[0],'guessSubmit',{text:'Маяк'});
 assert.equal(r.phase,'ended');assert.equal(g.view(reader).room.word,'Маяк');
 g.act(host,'reset');start();r.order=[reader.id,...r.order.filter(id=>id!==reader.id)];
 assert.equal(g.view(reader).room.word,null);
 assert.equal(g.view(reader).room.dossier.used,false);
 g.act(reader,'dossierReveal');assert.equal(g.view(reader).room.word,'Маяк');
});

test('ordinary dossiers keep legacy visibility and do not require flash acknowledgement',()=>{
 const x=setup(3),{g,players,start,ready}=x;start();
 assert.equal(g.view(players[1]).room.word,'Маяк');
 assert.throws(()=>g.act(players[1],'dossierReveal'));
 ready();assert.equal(x.r.phase,'playing');assert.equal(g.view(players[1]).room.word,'Маяк');
});

test('multiple-spy identities are visible only to host, opted-in spy teammates, or after the round',()=>{
 for(const know of [false,true]){
  const x=setup(7,{multiSpy:true,spyCount:3,spiesKnowEachOther:know}),{g,r,host,players,configure,start}=x;
  configure();start();
  const spies=players.filter(s=>g.view(s).room.role==='spy'),civilians=players.filter(s=>g.view(s).room.role==='civilian');
  assert.equal(spies.length,3);assert.equal(civilians.length,4);
  assert.equal(r.spyId,players[0].id);assert.ok(spies.includes(players[0]));
  assert.deepEqual(new Set(g.view(host).room.spyIds),new Set(spies.map(s=>s.id)));
  for(const spy of spies){assert.equal(g.view(spy).room.word,null);assert.equal(g.view(spy).room.spyId,null);if(know)assert.deepEqual(new Set(g.view(spy).room.spyIds),new Set(spies.map(s=>s.id)));else assert.ok(!g.view(spy).room.spyIds);}
  for(const civilian of civilians){assert.ok(!g.view(civilian).room.spyIds);assert.equal(g.view(civilian).room.spyId,null);}
  x.ready();g.act(spies[0],'guessStart');g.act(spies[0],'guessSubmit',{text:'Маяк'});
  for(const s of players)assert.deepEqual(new Set(g.view(s).room.spyIds),new Set(spies.map(p=>p.id)));
 }
});

test('start revalidates multiple-spy parity after players leave the waiting room',()=>{
 const {g,r,host,players,configure,start}=setup(5,{multiSpy:true,spyCount:2});
 configure();g.act(players[4],'leave');
 assert.equal(g.view(host).room.experiments.maxSpies,1);
 assert.throws(start);assert.equal(r.phase,'waiting');
});

test('voting out one spy continues; all spies out wins for civilians',()=>{
 const x=setup(5,{multiSpy:true,spyCount:2}),{g,r,players}=x;x.configure();x.start();x.ready();
 const spies=players.filter(s=>g.view(s).room.role==='spy');
 x.voteOut(spies[0].id);assert.equal(r.phase,'playing');assert.equal(r.players.find(p=>p.id===spies[0].id).alive,false);
 x.voteOut(spies[1].id);assert.equal(r.result.winner,'civilians');
});

test('multiple-spy team wins at parity, including a civilian departure',()=>{
 for(const leave of [false,true]){
  const x=setup(5,{multiSpy:true,spyCount:2});x.configure();x.start();x.ready();
  const civilian=x.players.find(s=>x.g.view(s).room.role==='civilian');
  if(leave)x.g.act(civilian,'leave');else x.voteOut(civilian.id);
  assert.equal(x.r.result.winner,'spy');
 }
});

test('one departing spy does not prematurely defeat surviving teammates',()=>{
 const x=setup(5,{multiSpy:true,spyCount:2});x.configure();x.start();x.ready();
 const spies=x.players.filter(s=>x.g.view(s).room.role==='spy');
 x.g.act(spies[0],'leave');assert.equal(x.r.phase,'playing');
 x.g.act(spies[1],'leave');assert.equal(x.r.result.winner,'civilians');
});

test('only the initiating spy may edit or submit the shared guess; one wrong answer defeats the team',()=>{
 const x=setup(5,{multiSpy:true,spyCount:2});x.configure();x.start();x.ready();
 const spies=x.players.filter(s=>x.g.view(s).room.role==='spy'),initiator=spies[1];
 x.g.act(initiator,'guessStart');
 assert.equal(x.g.view(spies[0]).room.guesserId,initiator.id);
 assert.throws(()=>x.g.act(spies[0],'guessType',{text:'Маяк'}));
 assert.throws(()=>x.g.act(spies[0],'guessSubmit',{text:'Маяк'}));
 x.g.act(initiator,'guessType',{text:'Океан'});
 assert.equal(x.g.view(x.host).room.guess,'Океан');
 x.g.act(initiator,'guessSubmit',{text:'Океан'});
 assert.equal(x.r.result.winner,'civilians');
});

test('a departing shared guesser cannot strand a surviving spy team or cooperative room',()=>{
 for(const cooperative of [false,true]){
  const x=setup(5,cooperative?{cooperative:true}:{multiSpy:true,spyCount:2});x.configure();x.start();x.ready();
  const guesser=cooperative?x.session(x.r.current):x.players.find(s=>x.g.view(s).room.role==='spy');
  const interrupted=x.r.current;x.g.act(guesser,'guessStart');x.g.act(guesser,'guessType',{text:'Черновик'});
  x.g.act(guesser,'leave');
  assert.equal(x.r.phase,'playing');assert.equal(x.g.view(x.host).room.guesserId,null);
  assert.equal(x.g.view(x.host).room.guess,null);
  if(interrupted===guesser.id)assert.notEqual(x.r.current,guesser.id);else assert.equal(x.r.current,interrupted);
 }
});

test('each spy has an independent ability charge and private feedback',()=>{
 const x=setup(5,{multiSpy:true,spyCount:2});x.configure();
 x.g.act(x.host,'abilitySettings',{enabled:true,wheel:false,censored:true,pool:['vowels']});
 x.start();x.ready();const spies=x.players.filter(s=>x.g.view(s).room.role==='spy');
 x.g.act(spies[0],'abilityUse');
 assert.equal(x.g.view(spies[0]).room.ability.used,true);
 assert.equal(x.g.view(spies[0]).room.ability.feedback.vowels,'2');
 assert.equal(x.g.view(spies[1]).room.ability.used,false);
 assert.equal(x.g.view(spies[1]).room.ability.feedback,null);
 assert.throws(()=>x.g.act(spies[0],'abilityUse'));
 x.g.act(spies[1],'abilityUse');assert.equal(x.g.view(spies[1]).room.ability.used,true);
 assert.equal(x.g.view(x.host).room.ability.feedback,null);
});

test('multi-spy roulette assigns each spy separately and sends each only their own result',()=>{
 const x=setup(5,{multiSpy:true,spyCount:2,spiesKnowEachOther:true});x.configure();
 x.g.act(x.host,'abilitySettings',{enabled:true,wheel:true,censored:true,pool:['vowels','probe']});
 let draw=0;x.g.abilities.random=max=>draw++%max;
 x.start();
 const spies=x.players.filter(s=>x.g.view(s).room.role==='spy');
 assert.deepEqual(new Set(spies.map(s=>x.g.view(s).room.ability.id)),new Set(['vowels','probe']));
 for(const s of spies){const view=x.g.view(s).room;assert.equal(view.abilityDraw.result,view.ability.id);}
 const civilian=x.players.find(s=>x.g.view(s).room.role==='civilian');
 assert.equal(x.g.view(civilian).room.abilityDraw.result,null);
 assert.equal(x.g.view(x.host).room.abilityDraw.result,null);
 x.advance(5000);x.ready();
 const probe=spies.find(s=>x.g.view(s).room.ability.id==='probe'),other=spies.find(s=>s!==probe);
 x.g.act(probe,'abilityUse',{letter:'м'});
 assert.equal(x.g.view(probe).room.ability.feedback.probe.present,true);
 assert.equal(x.g.view(other).room.ability.feedback,null);
 assert.equal(x.g.view(other).room.ability.used,false);
});

test('overlapping censored coin throws settle independently without sharing letters or outcomes',()=>{
 const x=setup(5,{multiSpy:true,spyCount:2});x.configure();
 x.g.act(x.host,'abilitySettings',{enabled:true,wheel:false,censored:true,pool:['coin']});
 x.g.abilities.random=()=>0;x.start();x.ready();
 const spies=x.players.filter(s=>x.g.view(s).room.role==='spy');
 x.g.act(spies[0],'abilityUse');
 assert.equal(x.g.view(spies[1]).room.ability.coin,null);
 x.advance(1200);x.g.act(spies[1],'abilityUse');x.advance(1200);
 assert.equal(x.g.view(spies[0]).room.ability.letter,'М');
 assert.equal(x.g.view(spies[1]).room.ability.letter,null);
 assert.equal(x.g.view(spies[1]).room.ability.coin.outcome,null);
 x.advance(1200);assert.equal(x.g.view(spies[1]).room.ability.letter,'М');
 assert.equal(x.g.view(x.host).room.ability.coin,null);
});

test('a second spy cannot overwrite an active silence or lose their unused charge',()=>{
 const x=setup(5,{multiSpy:true,spyCount:2});x.configure();x.profile();x.connect(1);
 x.g.act(x.host,'abilitySettings',{enabled:true,wheel:false,censored:true,pool:['silence']});
 x.start();x.ready();x.poll();
 const spies=x.players.filter(s=>x.g.view(s).room.role==='spy');
 const targets=x.players.filter(s=>x.g.view(s).room.role==='civilian'&&s.id!==x.r.current);
 x.g.act(spies[0],'abilityUse',{targetId:targets[0].id});
 assert.equal(x.g.view(spies[1]).room.ability.canUse,false);
 assert.throws(()=>x.g.act(spies[1],'abilityUse',{targetId:targets[1].id}));
 assert.equal(x.r.silence.targetId,targets[0].id);
 assert.equal(x.g.view(spies[1]).room.ability.used,false);
 for(let turn=0;x.r.silence&&turn<10;turn++)x.g.act(x.host,'next');
 assert.equal(x.r.silence,null);
 assert.equal(x.g.view(spies[1]).room.ability.canUse,true);
 x.g.act(spies[1],'abilityUse',{targetId:targets[1].id});
 assert.equal(x.g.view(spies[1]).room.ability.used,true);
});

test('cooperative mode removes incompatible options and prevents their re-enabling',()=>{
 const x=setup(4),{g,r,host,configure}=x;
 configure({flashWord:true,multiSpy:true,spyCount:1,micChaos:true});
 g.act(host,'voiceSettings',{enabled:true,radius:2});
 g.act(host,'abilitySettings',{enabled:true,wheel:true,censored:false,pool:['coin']});
 configure({cooperative:true,flashWord:true,multiSpy:true,spyCount:1,micChaos:true});
 const view=g.view(host).room;
 assert.equal(view.experiments.cooperative,true);
 for(const option of ['flashWord','multiSpy','micChaos'])assert.equal(view.experiments[option],false);
 assert.equal(view.voice.enabled,false);assert.equal(view.abilities.enabled,false);
 assert.throws(()=>g.act(host,'voiceSettings',{enabled:true,radius:1}));
 assert.throws(()=>g.act(host,'abilitySettings',{enabled:true,wheel:false,censored:false,pool:['coin']}));
 x.start();x.ready();assert.equal(r.phase,'playing');
});

test('cooperative players never get the word, take unlimited turnwise guesses, and win together',()=>{
 const x=setup(3,{cooperative:true}),{g,r,host,players}=x;x.configure();x.start();
 for(const s of players){const view=g.view(s).room;assert.equal(view.role,'cooperative');assert.equal(view.word,null);assert.equal(view.theme,'Море');assert.ok(!view.spyIds);}
 assert.equal(g.view(host).room.word,'Маяк');x.ready();
 for(let attempt=0;attempt<5;attempt++){
  const current=x.session(r.current),other=players.find(s=>s.id!==r.current);
  assert.throws(()=>g.act(other,'guessStart'));
  assert.throws(()=>g.act(current,'voteStart'));
  g.act(current,'guessStart');assert.equal(g.view(other).room.guesserId,current.id);
  assert.throws(()=>g.act(other,'guessType',{text:'Маяк'}));
  g.act(current,'guessType',{text:'Догадка '+attempt});assert.equal(g.view(other).room.guess,'Догадка '+attempt);
  g.act(current,'guessSubmit',{text:'Неверно'});
  assert.equal(r.phase,'playing');assert.notEqual(r.current,current.id);assert.equal(r.result,null);
  for(const s of players)assert.equal(g.view(s).room.word,null);
 }
 const current=x.session(r.current);g.act(current,'guessStart');g.act(current,'guessSubmit',{text:'  маяк  '});
 assert.equal(r.result.winner,'team');assert.equal(r.phase,'ended');
});

test('microphone chaos first rolls at second two, then once per second with the configured probability',()=>{
 const x=setup(5,{micChaos:true,micChance:10});x.configure();x.start();x.ready();
 const initial=x.r.current;let rolls=0;
 x.g.experiments.random=max=>{assert.equal(max,100);rolls++;return rolls===1?10:9;};
 x.advance(1999);assert.equal(rolls,0);assert.equal(x.r.current,initial);
 x.advance(1);assert.equal(rolls,1);assert.equal(x.r.current,initial,'10 is outside a 10% success bucket');
 x.advance(999);assert.equal(rolls,1);
 x.advance(1);assert.equal(rolls,2);assert.notEqual(x.r.current,initial);
 const next=x.r.current;x.advance(1999);assert.equal(rolls,2);assert.equal(x.r.current,next);
 x.advance(1);assert.equal(rolls,3);assert.notEqual(x.r.current,next);
});

test('microphone chaos pauses for discussion and resets its deadline when the turn resumes',()=>{
 const x=setup(5,{micChaos:true,micChance:100});x.configure();x.start();x.ready();
 let rolls=0;x.g.experiments.random=()=>{rolls++;return 0;};
 x.advance(1999);const current=x.r.current;x.g.act(x.players[1],'voteStart');
 x.advance(1000);assert.equal(rolls,0);
 x.advance(x.g.voteMs);assert.equal(x.r.phase,'playing');assert.equal(rolls,0);assert.equal(x.r.current,current);
 x.advance(1999);assert.equal(rolls,0);x.advance(1);assert.equal(rolls,1);
});

test('a delayed server tick performs at most one chaos skip and gives the new speaker a fresh grace period',()=>{
 const x=setup(5,{micChaos:true,micChance:100});x.configure();x.start();x.ready();
 let rolls=0;x.g.experiments.random=()=>{rolls++;return 0;};
 const serial=x.r.turnSerial;x.advance(60000);
 assert.equal(rolls,1);assert.equal(x.r.turnSerial,serial+1);
 x.g.tick();assert.equal(rolls,1);x.advance(1999);assert.equal(rolls,1);x.advance(1);assert.equal(rolls,2);
});

test('chaos does not roll during guessing or a shuffle and restarts after shuffle selection',()=>{
 const x=setup(5,{micChaos:true,micChance:100});x.configure();
 x.g.act(x.host,'abilitySettings',{enabled:true,wheel:false,censored:true,pool:['shuffle']});
 x.start();x.ready();let rolls=0;x.g.experiments.random=()=>{rolls++;return 0;};
 x.advance(1900);x.g.act(x.players[0],'abilityUse');assert.equal(x.r.phase,'shuffling');
 x.advance(5700);assert.equal(x.r.phase,'playing');assert.equal(rolls,0);
 x.advance(1999);assert.equal(rolls,0);x.advance(1);assert.equal(rolls,1);
 x.g.act(x.players[0],'guessStart');x.advance(10000);assert.equal(rolls,1);
 x.g.act(x.players[0],'guessSubmit',{text:'Маяк'});x.advance(10000);assert.equal(rolls,1);
});

test('chaos switches the voice speaker and excludes the interrupted neighbour for exactly the next turn',()=>{
 const x=setup(5,{micChaos:true,micChance:100});x.configure();x.connect(1);x.start();x.ready();x.poll();
 x.g.experiments.random=()=>0;
 const interrupted=x.r.current,index=x.players.findIndex(s=>s.id===interrupted),discord=x.ids[index+1];
 assert.ok(x.poll().allowed.includes(discord));
 x.advance(2000);
 const next=x.r.current,nextDiscord=x.ids[x.players.findIndex(s=>s.id===next)+1];
 assert.notEqual(next,interrupted);const policy=x.poll();
 assert.ok(policy.allowed.includes(nextDiscord));assert.ok(!policy.allowed.includes(discord));
 x.g.act(x.session(next),'voteStart');assert.equal(x.poll().mode,'all');
 x.advance(x.g.voteMs);assert.equal(x.r.phase,'playing');assert.ok(!x.poll().allowed.includes(discord));
 x.g.act(x.host,'next');
 x.r.voiceSettings.radius=6;
 assert.ok(x.poll().allowed.includes(discord),'the mute expires when the protected turn ends');
});

test('turning experiments off clears its switches and voice, but guards a Discord-dependent ability',()=>{
 const x=setup(5),{g,host,configure}=x;
 configure({flashWord:true,micChaos:true});g.act(host,'voiceSettings',{enabled:true,radius:1});
 configure({enabled:false});let view=g.view(host).room;
 for(const key of ['enabled','flashWord','multiSpy','cooperative','micChaos'])assert.equal(view.experiments[key],false);
 assert.equal(view.voice.enabled,false);
 x.profile();g.act(host,'voiceSettings',{enabled:true,radius:1});
 assert.equal(g.view(host).room.experiments.enabled,true);
 g.act(host,'abilitySettings',{enabled:true,wheel:false,censored:false,pool:['silence']});
 assert.throws(()=>configure({enabled:false}));view=g.view(host).room;
 assert.equal(view.voice.enabled,true);assert.equal(view.abilities.enabled,true);
});

test('solo testing keeps its required Discord mode and rejects cooperative mode',()=>{
 let now=1000;const g=new Game({now:()=>now,profileSecret}),s=g.session();g.connection(s,true);
 const userId='100000000000000001';
 g.profiles.confirm(profileSecret,{code:g.profiles.invite(s),userId,name:'aqr1337'});
 g.act(s,'create',{name:'Solo'});g.act(s,'testMode',{enabled:true});
 const r=g.rooms.get(s.room);
 assert.throws(()=>g.act(s,'experimentSettings',{...defaults,cooperative:true}));
 assert.throws(()=>g.act(s,'experimentSettings',{...defaults,enabled:false}));
 assert.equal(g.view(s).room.voice.enabled,true);
 const token=g.voice.connect({code:g.voice.invite(r,s),guildId:'200000000000000001',channelId:'200000000000000002',channelName:'Solo',userId}).token;
 g.voice.poll(token,{roster:[userId]});g.act(s,'start',{});g.act(s,'ready');now+=4500;g.tick();
 assert.equal(r.phase,'playing');assert.equal(g.view(s).room.role,'spy');assert.equal(r.players.length,4);
});
