'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Game}=require('../game');
const secret='abilities-test-profile-secret-long-enough';
function setup(count=5){
 let now=1000;const g=new Game({now:()=>now,profileSecret:secret});
 const people=Array.from({length:count+1},()=>g.session()),[host,...players]=people;
 people.forEach(s=>g.connection(s,true));g.act(host,'create',{name:'Host'});
 players.forEach((s,i)=>g.act(s,'join',{name:'Player '+i,code:host.room}));
 const r=g.rooms.get(host.room),ids=people.map((_,i)=>String(100000000000000010n+BigInt(i)));
 const configure=(patch={})=>g.act(host,'abilitySettings',{enabled:true,wheel:true,censored:false,pool:['coin'],...patch});
 const advance=ms=>{now+=ms;g.tick();};
 const start=(word='Е\u0308лка')=>g.act(host,'start',{word,theme:'Зима',hint:'Зелёная',spyId:players[0].id});
 const ready=()=>{while(g.dealTo(r))g.act(players.find(s=>s.id===g.dealTo(r)),'ready');advance(4500);};
 const profile=()=>g.profiles.confirm(secret,{code:g.profiles.invite(host),userId:ids[0],name:'HostDiscord'});
 let token;
 const connect=()=>{
  token=g.voice.connect({code:g.voice.invite(r,host),guildId:'200000000000000001',channelId:'200000000000000002',channelName:'Test',userId:ids[0]}).token;
  poll();players.forEach((s,i)=>g.voice.join(token,{code:g.voice.invite(r,s),userId:ids[i+1]}));
 };
 const poll=()=>g.voice.poll(token,{roster:ids});
 const silence=()=>{profile();g.act(host,'voiceSettings',{enabled:true,radius:6});configure({pool:['silence'],wheel:false});connect();start();ready();poll();r.order=players.map(s=>s.id);r.current=players[0].id;};
 return {g,r,host,players,people,ids,configure,advance,start,ready,profile,connect,poll,silence};
}
test('abilities are opt-in, host-only, validated and frozen during a round',()=>{
 const {g,r,host,players,configure,start}=setup();assert.equal(g.view(host).room.abilities.enabled,false);
 assert.throws(()=>g.act(players[0],'abilitySettings',{enabled:true,wheel:true,censored:false,pool:['coin']}));
 assert.throws(()=>configure({pool:[]}));assert.throws(()=>configure({pool:['coin','coin']}));assert.throws(()=>configure({pool:['unknown']}));assert.throws(()=>configure({wheel:1}));
 configure();start();assert.throws(()=>configure({enabled:false}));assert.throws(()=>g.act(host,'abilityUse'));assert.throws(()=>g.act(players[1],'abilityUse'));
 assert.equal(r.phase,'ability-draw');
});
test('ability wheel precedes dossiers and resumes reveal exactly at its deadline',()=>{
 const {g,r,host,players,configure,start,advance}=setup();configure();start();
 assert.equal(g.view(host).room.abilityDraw.result,'coin');assert.equal(g.view(players[1]).room.ability.id,'coin');
 assert.equal(g.view(players[0]).room.dealTo,null);assert.equal(g.view(players[0]).room.current,null);
 assert.throws(()=>g.act(players[0],'ready'));assert.throws(()=>g.act(players[0],'abilityUse'));assert.throws(()=>g.act(host,'next'));
 advance(4999);assert.equal(r.phase,'ability-draw');advance(1);assert.equal(r.phase,'reveal');assert.equal(g.view(host).room.abilityDraw,null);assert.ok(g.view(players[0]).room.dealTo);
});
test('hidden wheel and animation-free assignment never disclose the chosen ability to others',()=>{
 for(const settings of [{wheel:true,censored:true},{wheel:false,censored:false},{wheel:false,censored:true}]){
  const {g,r,host,players,configure,start}=setup();configure(settings);start();
  assert.equal(g.view(players[0]).room.ability.id,'coin');assert.equal(g.view(host).room.ability.id,null);assert.equal(g.view(players[1]).room.ability.id,null);
  if(settings.wheel){assert.equal(g.view(players[0]).room.abilityDraw.result,'coin');assert.equal(g.view(players[1]).room.abilityDraw.result,null);assert.equal(g.view(host).room.abilityDraw.result,null);}
  else{assert.equal(r.phase,'reveal');assert.equal(g.view(host).room.abilityDraw,null);}
 }
});
test('coin uses server randomness once and reveals only the first grapheme to the spy after landing',()=>{
 const {g,r,host,players,configure,start,advance}=setup();configure({wheel:false});g.abilities.random=()=>0;start();
 g.act(players[0],'abilityUse',{outcome:'tails'});assert.throws(()=>g.act(players[0],'abilityUse'));
 for(const s of [host,...players]){const a=g.view(s).room.ability;assert.equal(a.coin.outcome,null);assert.equal(a.letter,null);assert.deepEqual(Object.keys(a.coin).sort(),['id','startedAt','endsAt','outcome'].sort());}
 advance(2399);assert.equal(g.view(players[0]).room.ability.letter,null);advance(1);
 assert.equal(g.view(players[0]).room.ability.letter,'Е\u0308');assert.equal(g.view(players[0]).room.ability.coin.outcome,'heads');
 for(const s of [host,...players.slice(1)]){assert.equal(g.view(s).room.ability.letter,null);assert.equal(g.view(s).room.ability.coin.outcome,'heads');assert.equal(g.view(s).room.ability.id,null);}
 assert.equal(r.abilityState.used,true);
});
test('tails grant nothing and censorship hides both the coin and its usage from all other viewers',()=>{
 const {g,r,host,players,configure,start,advance}=setup();configure({wheel:false,censored:true});g.abilities.random=max=>max-1;start();
 g.act(players[0],'abilityUse',{outcome:'heads'});advance(2400);
 assert.equal(g.view(players[0]).room.ability.coin.outcome,'tails');assert.equal(g.view(players[0]).room.ability.letter,null);
 for(const s of [host,...players.slice(1)]){assert.equal(g.view(s).room.ability.coin,null);assert.equal(g.view(s).room.ability.id,null);assert.equal(g.view(s).room.ability.used,false);assert.equal(g.view(s).room.ability.canUse,false);}
 assert.equal(r.abilityState.used,true);
});
test('coin remains available in selection, discussion and guessing without granting an extra attempt',()=>{
 for(const phase of ['selecting','playing','voting','guessing']){
  const {g,r,players,configure,start,ready}=setup();configure({wheel:false});start();
  if(phase==='selecting'){while(g.dealTo(r))g.act(players.find(s=>s.id===g.dealTo(r)),'ready');}
  else{ready();if(phase==='voting')g.act(players[1],'voteStart');if(phase==='guessing')g.act(players[0],'guessStart');}
  assert.equal(r.phase,phase);g.act(players[0],'abilityUse');assert.throws(()=>g.act(players[0],'abilityUse'));assert.equal(r.phase,phase);
 }
});
test('Discord ability settings require a verified host profile and voice, and start revalidates prerequisites',()=>{
 const {g,r,host,configure,start,profile,connect}=setup();
 assert.throws(()=>configure({pool:['silence']}));g.act(host,'voiceSettings',{enabled:true,radius:0});assert.throws(()=>configure({pool:['silence']}));
 host.discord={name:'aqr1337',credential:'forged'};assert.throws(()=>configure({pool:['silence']}));profile();configure({pool:['silence']});
 assert.equal(g.view(host).room.abilities.discordReady,true);assert.throws(start);assert.equal(r.phase,'waiting');
 assert.throws(()=>g.act(host,'voiceSettings',{enabled:false,radius:0}));connect();g.act(host,'profileForget');assert.throws(start);
 configure({enabled:false,pool:['silence']});g.act(host,'voiceSettings',{enabled:false,radius:0});assert.equal(g.view(host).room.abilities.discordReady,false);
});
test('silence skips the selected future turn, mutes through the following turn, then expires',()=>{
 const {g,r,host,players,ids,poll,silence}=setup();silence();const target=players[2];
 g.act(players[0],'abilityUse',{targetId:target.id});assert.equal(r.silence.pending,true);assert.ok(!poll().allowed.includes(ids[3]));
 g.act(host,'next');assert.equal(r.current,players[1].id);assert.equal(r.silence.pending,true);
 g.act(host,'next');assert.equal(r.current,players[3].id);assert.equal(r.silence.pending,false);assert.equal(r.silence.untilTurn,r.turnSerial);assert.ok(!poll().allowed.includes(ids[3]));
 g.act(host,'next');assert.equal(r.current,players[4].id);assert.equal(r.silence,null);assert.ok(poll().allowed.includes(ids[3]));
 assert.throws(()=>g.act(players[0],'abilityUse',{targetId:target.id}));
});
test('silence can target the current spy himself and immediately pass his turn',()=>{
 const {g,r,host,players,ids,poll,silence}=setup();silence();g.act(players[0],'abilityUse',{targetId:players[0].id});
 assert.equal(r.current,players[1].id);assert.equal(r.silence.pending,false);assert.ok(!poll().allowed.includes(ids[1]));
 assert.equal(g.view(players[1]).room.ability.id,null);assert.deepEqual(g.view(players[1]).room.ability.silence,{targetId:players[0].id,pending:false});
 g.act(host,'next');assert.equal(r.silence,null);assert.ok(poll().allowed.includes(ids[1]));
});
test('silence rejects invalid, dead, observer and disconnected-bridge targets without consuming the ability',()=>{
 const {g,r,host,players,advance,poll,silence}=setup();silence();
 for(const targetId of [host.id,'unknown',null])assert.throws(()=>g.act(players[0],'abilityUse',{targetId}));
 assert.equal(r.abilityState.used,false);r.players.find(p=>p.id===players[3].id).alive=false;assert.throws(()=>g.act(players[0],'abilityUse',{targetId:players[3].id}));
 advance(6001);assert.throws(()=>g.act(players[0],'abilityUse',{targetId:players[2].id}));assert.equal(r.abilityState.used,false);poll();
 g.act(players[1],'voteStart');assert.throws(()=>g.act(players[0],'abilityUse',{targetId:players[2].id}));assert.equal(r.abilityState.used,false);
});
test('discussion overrides silence, departures clear pending skips, and game end releases every effect',()=>{
 const {g,r,host,players,poll,silence}=setup();silence();g.act(players[0],'abilityUse',{targetId:players[2].id});
 g.act(players[1],'voteStart');assert.equal(poll().mode,'all');g.resolve(r);assert.equal(r.silence.pending,true);
 g.act(players[2],'leave');assert.equal(r.silence,null);
 g.act(players[0],'guessStart');assert.equal(poll().mode,'all');g.act(players[0],'guessSubmit',{text:'wrong'});assert.equal(poll().mode,'release');assert.equal(r.silence,null);assert.equal(r.abilityDraw,null);
 g.act(host,'reset');assert.equal(r.abilityState,null);assert.equal(g.view(host).room.ability,null);assert.equal(g.view(host).room.abilities.enabled,true);
});
test('eliminating a silenced player clears the effect without consuming another player turn',()=>{
 const {g,r,players,silence}=setup();silence();g.act(players[0],'abilityUse',{targetId:players[3].id});
 g.act(players[1],'voteStart');players.slice(0,3).forEach(s=>g.act(s,'vote',{targetId:players[3].id}));g.resolve(r);
 assert.equal(r.silence,null);assert.equal(r.current,players[0].id);assert.equal(r.turnSerial,1);
});
test('finishing during a coin toss cancels its private reward and reset grants one fresh ability',()=>{
 const {g,r,host,players,configure,start,ready,advance}=setup();configure({wheel:false});g.abilities.random=()=>0;start();ready();
 g.act(players[0],'abilityUse');g.act(players[0],'guessStart');g.act(players[0],'guessSubmit',{text:'wrong'});advance(2400);
 assert.equal(r.abilityState.coin,null);assert.equal(r.abilityState.letter,null);assert.equal(g.view(players[0]).room.ability.canUse,false);
 g.act(host,'reset');start();assert.equal(r.abilityState.used,false);assert.equal(r.abilityState.letter,null);
});
test('vowel feedback is capped and visible only to the spy in every visibility mode',()=>{
 for(const [word,expected]of [['брр','0'],['снег','1'],['ёлка','2'],['молоко','3+'],['Audio','3+'],['Е\u0308лка','2']]){
  const {g,host,players,configure,start}=setup();configure({pool:['vowels'],wheel:false});start(word);g.act(players[0],'abilityUse');
  assert.deepEqual(g.view(players[0]).room.ability.feedback,{vowels:expected});
  for(const s of [host,...players.slice(1)])assert.equal(g.view(s).room.ability.feedback,null);
  assert.throws(()=>g.act(players[0],'abilityUse'));
 }
});
test('probe validates exactly one alphabetic letter and normalizes case and ё without disclosing positions',()=>{
 for(const [word,letter,present,normalized]of [['Ёлка','Е',true,'е'],['Ель','Ё',true,'е'],['Beacon','A',true,'a'],['Маяк','б',false,'б']]){
  const {g,r,host,players,configure,start}=setup();configure({pool:['probe'],wheel:false,censored:true});start(word);
  for(const invalid of ['',42,'аа','1','💡','а б'])assert.throws(()=>g.act(players[0],'abilityUse',{letter:invalid}));
  assert.equal(r.abilityState.used,false);g.act(players[0],'abilityUse',{letter});
  assert.deepEqual(g.view(players[0]).room.ability.feedback,{probe:{letter:normalized,present}});
  assert.equal(g.view(host).room.ability.feedback,null);assert.equal(g.view(players[1]).room.ability.feedback,null);
  assert.throws(()=>g.act(players[0],'abilityUse',{letter:'я'}));
 }
});
test('reverse changes only remaining turns and restores the canonical order for the next cycle',()=>{
 const {g,r,host,players,configure,start,ready,advance}=setup();configure({pool:['reverse'],wheel:false});start();ready();
 r.order=players.map(s=>s.id);r.current=players[0].id;g.act(host,'next');assert.equal(r.current,players[1].id);
 g.act(players[0],'abilityUse');advance(5700);const seen=[];
 for(let i=0;i<3;i++){g.act(host,'next');seen.push(r.current);}
 assert.deepEqual(seen,[players[4].id,players[3].id,players[2].id]);assert.equal(r.cycle,1);
 g.act(host,'next');assert.equal(r.current,players[0].id);assert.equal(r.cycle,2);
 g.act(host,'next');assert.equal(r.current,players[1].id);assert.throws(()=>g.act(players[0],'abilityUse'));
});
test('shuffle starts a fresh random cycle, keeps original hint eligibility, and blocks actions during animation',()=>{
 const {g,r,host,players,configure,start,ready,advance}=setup();configure({pool:['shuffle'],wheel:false});start();ready();
 r.order=players.map(s=>s.id);r.current=players[0].id;r.first=players[1].id;
 r.players.find(p=>p.id===players[4].id).alive=false;g.abilities.random=()=>0;
 const before=g.view(players[0]).room.hint;g.act(players[0],'abilityUse');
 assert.equal(r.phase,'shuffling');assert.equal(r.cycle,2);assert.equal(r.first,players[1].id);assert.equal(g.view(players[0]).room.hint,before);
 assert.equal(r.order.length,4);assert.equal(new Set(r.order).size,4);assert.ok(!r.order.includes(players[4].id));assert.ok(r.order.includes(r.current));
 const event=g.view(players[1]).room.abilityShuffle;assert.deepEqual(Object.keys(event).sort(),['id','startedAt','blackoutEndsAt','endsAt'].sort());
 assert.equal(event.blackoutEndsAt-event.startedAt,1200);assert.equal(event.endsAt-event.startedAt,5700);
 assert.throws(()=>g.act(host,'next'));assert.throws(()=>g.act(players[0],'voteStart'));assert.throws(()=>g.act(players[0],'guessStart'));assert.throws(()=>g.act(players[0],'abilityUse'));
 advance(5699);assert.equal(r.phase,'shuffling');advance(1);assert.equal(r.phase,'playing');assert.equal(g.view(host).room.abilityShuffle,null);
 const sequence=[r.current];for(let i=0;i<3;i++){g.act(host,'next');sequence.push(r.current);}assert.equal(new Set(sequence).size,4);assert.equal(r.cycle,2);
});
test('shuffle moves every living seat even when random candidates repeatedly return the original order',()=>{
 for(const forceIdentity of [false,true]){
  const {g,r,players,configure,start,ready}=setup();configure({pool:['shuffle'],wheel:false});start();ready();
  r.order=[players[3].id,players[0].id,players[4].id,players[2].id,players[1].id];
  r.players.find(p=>p.id===players[4].id).alive=false;
  const original=r.order.filter(id=>id!==players[4].id),first=r.first;
  let calls=0;g.abilities.random=max=>{calls++;return forceIdentity?max-1:0;};g.act(players[0],'abilityUse');
  assert.deepEqual(new Set(r.order),new Set(original));assert.equal(r.order.length,original.length);
  assert.ok(r.order.every((id,index)=>id!==original[index]));assert.equal(r.first,first);
  assert.ok(calls<=20*(original.length-1)+2,'random retries must remain bounded');
 }
});
test('spotlight grants a true extra turn and resumes the interrupted player without consuming either normal turn',()=>{
 const {g,r,host,players,configure,start,ready,advance}=setup();configure({pool:['spotlight'],wheel:false});start();ready();
 r.order=players.map(s=>s.id);r.current=players[1].id;
 assert.throws(()=>g.act(players[0],'abilityUse',{targetId:r.current}));assert.throws(()=>g.act(players[0],'abilityUse',{targetId:host.id}));
 g.act(players[0],'abilityUse',{targetId:players[0].id});assert.equal(r.current,players[0].id);assert.equal(r.cycle,1);
 assert.deepEqual(g.view(players[2]).room.spotlight,{targetId:players[0].id,returnTo:players[1].id});
 advance(7000);g.act(players[0],'next');assert.equal(r.current,players[1].id);assert.equal(r.spotlight,null);
 const normal=[];for(let i=0;i<4;i++){g.act(host,'next');normal.push(r.current);}
 assert.deepEqual(normal,[players[2].id,players[3].id,players[4].id,players[0].id]);assert.equal(r.cycle,1);
});
test('spotlight handles departure of the extra speaker and death of the interrupted player',()=>{
 for(const leaving of ['target','return']){
  const {g,r,host,players,configure,start,ready,advance}=setup(6);configure({pool:['spotlight'],wheel:false});start();ready();
  r.order=players.map(s=>s.id);r.current=players[1].id;g.act(players[0],'abilityUse',{targetId:players[4].id});
  if(leaving==='target'){g.act(players[4],'leave');assert.equal(r.current,players[1].id);assert.equal(r.spotlight,null);}
  else{g.act(players[1],'leave');assert.equal(r.current,players[4].id);advance(7000);g.act(host,'next');assert.equal(r.current,players[2].id);assert.equal(r.spotlight,null);}
 }
});
test('testAbility is restricted to verified solo ownership and safely refreshes every ability',()=>{
 const normal=setup();normal.configure({pool:['probe'],wheel:false});normal.start();normal.ready();
 assert.throws(()=>normal.g.act(normal.host,'testAbility',{id:'coin'}));assert.throws(()=>normal.g.act(normal.players[0],'testAbility',{id:'coin'}));
 let now=1000;const g=new Game({now:()=>now,profileSecret:secret}),s=g.session();g.connection(s,true);
 const userId='100000000000000001';g.profiles.confirm(secret,{code:g.profiles.invite(s),userId,name:'aqr1337'});g.act(s,'create',{name:'Solo'});g.act(s,'testMode',{enabled:true});const r=g.room(s);
 const token=g.voice.connect({code:g.voice.invite(r,s),guildId:'200000000000000001',channelId:'200000000000000002',userId}).token;
 const poll=()=>g.voice.poll(token,{roster:[userId]});poll();g.act(s,'start',{});assert.throws(()=>g.act(s,'testAbility',{id:'coin'}));g.act(s,'ready');now+=4500;g.tick();poll();
 for(const id of ['coin','silence','vowels','probe','shuffle','reverse','spotlight']){g.act(s,'testAbility',{id});assert.equal(r.abilityState.id,id);assert.equal(r.abilityState.used,false);}
 g.act(s,'abilityUse',{targetId:r.players.find(p=>p.simulated).id});assert.throws(()=>g.act(s,'testAbility',{id:'coin'}));now+=7000;g.tick();poll();g.act(s,'next');
 g.act(s,'testAbility',{id:'silence'});g.act(s,'abilityUse',{targetId:s.id});assert.ok(r.silence);g.act(s,'testAbility',{id:'probe'});assert.equal(r.silence,null);
 g.act(s,'abilityUse',{letter:'м'});g.act(s,'testAbility',{id:'probe'});assert.equal(r.abilityState.used,false);assert.equal(r.abilityState.feedback,null);
 assert.throws(()=>g.act(s,'testAbility',{id:'invented'}));g.act(s,'testAbility',{id:'shuffle'});g.act(s,'abilityUse');assert.throws(()=>g.act(s,'testAbility',{id:'coin'}));
 now+=5700;g.tick();s.discord.credential='forged';assert.throws(()=>g.act(s,'testAbility',{id:'coin'}));
});
