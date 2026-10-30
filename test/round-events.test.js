'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Game}=require('../game');
function setup({ability='cross',common=false,suspicions=false,count=5,oldBot=false}={}){
 let now=1000;const secret='pair-rooms-test-secret-at-least-32-characters',g=new Game({now:()=>now,profileSecret:secret}),people=Array.from({length:count+1},()=>g.session()),[host,...players]=people;
 people.forEach(s=>g.connection(s,true));g.act(host,'create',{name:'Host'});players.forEach((s,i)=>g.act(s,'join',{name:'Player'+i,code:host.room}));const r=g.room(host);
 const ids=people.map((_,i)=>String(100000000000000010n+BigInt(i)));
 g.profiles.confirm(secret,{code:g.profiles.invite(host),userId:ids[0],name:'HostDiscord'});g.act(host,'voiceSettings',{enabled:true,radius:0});
 g.act(host,'experimentSettings',{...g.experiments.settings(r),suspicions,commonGround:common});
 g.act(host,'abilitySettings',{enabled:true,wheel:false,censored:true,pool:[ability]});
 const token=g.voice.connect({code:g.voice.invite(r,host),guildId:ids[0],channelId:ids[1],channelName:'Test',userId:ids[0]}).token;
 const poll=(pairReport,extra={})=>g.voice.poll(token,{roster:ids,pairRooms:oldBot?0:1,pairReport,...extra});poll();players.forEach((s,i)=>g.voice.join(token,{code:g.voice.invite(r,s),userId:ids[i+1]}));
 const start=()=>{g.act(host,'start',{word:'Маяк',theme:'Море',hint:'Свет',spyId:players[0].id});while(g.dealTo(r))g.act(players.find(s=>s.id===g.dealTo(r)),'ready');};
 start();if(!common){now+=4500;g.tick();poll();r.order=players.map(s=>s.id);r.current=players[1].id;}
 return {g,r,host,players,poll,ids,advance:ms=>{now+=ms;g.tick();}};
}
test('cross pairs chosen spy partner, creates one trio and freezes until bot acknowledgements',()=>{
 const {g,r,host,players,poll,advance}=setup(),original=r.current,seats=[...r.order];g.act(players[0],'abilityUse',{targetId:players[2].id});
 assert.equal(r.phase,'pair-rooms');assert.deepEqual(r.order,seats);assert.equal(r.current,original);assert.deepEqual(r.pairEvent.groups.map(g=>g.length).sort(),[2,3]);
 assert(r.pairEvent.groups.some(g=>g.includes(players[0].id)&&g.includes(players[2].id)));const id=r.pairEvent.id;
 assert.equal(poll().pairEvent.stage,'prepare');assert.deepEqual(poll().allowed,[]);assert.equal(r.pairEvent.endsAt,null);
 for(const action of ['next','voteStart','guessStart','abilityUse'])assert.throws(()=>g.act(players[0],action));
 poll({id:'stale',status:'ready'});assert.equal(r.pairEvent.stage,'prepare');advance(3000);poll({id,status:'ready'});const deadline=r.pairEvent.endsAt;
 advance(19999);assert.equal(r.pairEvent.stage,'talk');advance(1);assert.equal(r.pairEvent.stage,'return');assert.equal(poll().pairEvent.stage,'return');assert.equal(r.phase,'pair-rooms');
 poll({id,status:'returned'});assert.equal(r.phase,'playing');assert.equal(r.current,original);assert.deepEqual(r.order,seats);assert.equal(r.pairEvent,null);assert(deadline>0);
});
test('pair preparation failures request rollback and never start the conversation timer',()=>{
 const {g,r,players,poll}=setup();g.act(players[0],'abilityUse',{targetId:players[1].id});const id=r.pairEvent.id;
 poll({id,error:'Permission denied'});assert.equal(r.pairEvent.stage,'return');assert.equal(r.pairEvent.endsAt,null);assert.equal(r.phase,'pair-rooms');
 poll({id,status:'returned'});assert.equal(r.phase,'playing');assert.match(r.notice,/Не удалось/);
});
test('old or stale bots and invalid targets cannot consume the ability',()=>{
 const {g,r,players,poll,advance}=setup({oldBot:true});assert.throws(()=>g.act(players[0],'abilityUse',{targetId:players[1].id}),/Обновите/);assert.equal(r.abilityState.used,false);
 poll(undefined,{pairRooms:1});for(const targetId of [players[0].id,r.hostId,'invalid'])assert.throws(()=>g.act(players[0],'abilityUse',{targetId}));
 advance(7000);assert.throws(()=>g.act(players[0],'abilityUse',{targetId:players[1].id}));assert.equal(r.abilityState.used,false);
});
test('common ground starts once after all dossiers and before first-turn selection',()=>{
 const {g,r,host,poll,advance}=setup({common:true});assert.equal(r.phase,'pair-rooms');assert.equal(r.pairEvent.kind,'common');const id=r.pairEvent.id;
 poll({id,status:'ready'});advance(20000);poll({id,status:'returned'});assert.equal(r.phase,'selecting');advance(4500);assert.equal(r.phase,'playing');
 for(let i=0;i<12;i++)g.act(host,'next');assert.equal(r.phase,'playing');assert.equal(r.pairEvent,null);
});
test('ending and closing a room withdraw pair commands for bot cleanup',()=>{
 const {g,r,players,poll}=setup();g.act(players[0],'abilityUse',{targetId:players[1].id});g.finish(r,'cancelled','Test');assert.equal(poll().mode,'release');assert.equal(poll().pairEvent,undefined);
});
test('variables secretly shuffle only remaining turns, preserve current and reset next circle',()=>{
 const {g,r,host,players}=setup({ability:'variables'});g.abilities.ensureTurns(r);const before=[...r.turnQueue],current=r.current,publicBefore=g.view(players[1]).room;g.abilities.random=()=>0;
 g.act(players[0],'abilityUse');const publicAfter=g.view(players[1]).room;assert.deepEqual(publicAfter,publicBefore);assert.equal(r.current,current);assert.equal(r.phase,'playing');assert.notDeepEqual(r.turnQueue,before);assert.deepEqual([...r.turnQueue].sort(),before.sort());
 const queue=[...r.turnQueue];for(const id of queue){g.act(host,'next');assert.equal(r.current,id);}g.act(host,'next');assert.equal(r.current,r.turnAnchor);assert.equal(r.cycle,2);assert.deepEqual(r.turnQueue,g.abilities.cycleOrder(r,r.turnAnchor).slice(1));
});
test('suspicions remain private, reveal exactly at circle boundary and await every reader',()=>{
 const {g,r,host,players}=setup({ability:'variables',suspicions:true});g.abilities.ensureTurns(r);
 g.act(players[0],'suspect',{targetId:players[1].id});g.act(players[1],'suspect',{targetId:players[0].id});assert.equal(g.view(players[2]).room.suspicions.mine,null);assert.equal(g.view(players[2]).room.suspicions.dossier,null);
 assert.throws(()=>g.act(host,'suspect',{targetId:players[1].id}));assert.throws(()=>g.act(players[0],'suspect',{targetId:players[0].id}));
 for(let i=0;i<players.length;i++)g.act(host,'next');assert.equal(r.phase,'suspicions');const d=g.view(players[2]).room.suspicions.dossier;assert.equal(d.entries.find(e=>e.playerId===players[0].id).targetId,players[1].id);assert.throws(()=>g.act(host,'next'));
 for(const s of [host,...players.slice(0,-1)])g.act(s,'suspicionsRead');assert.equal(r.phase,'suspicions');g.act(players.at(-1),'suspicionsRead');assert.equal(r.phase,'playing');assert.deepEqual(r.suspects,{});
});
test('departure during pair event never advances hidden turn, but resumes at a living player',()=>{
 const {g,r,players,poll,advance}=setup({count:6});const current=players.find(p=>p.id===r.current);g.act(players[0],'abilityUse',{targetId:players[2].id});const id=r.pairEvent.id;g.act(current,'leave');assert.equal(r.phase,'pair-rooms');poll({id,status:'ready'});advance(20000);poll({id,status:'returned'});assert.equal(r.phase,'playing');assert(g.alive(r).some(p=>p.id===r.current));
});

test('return timeout stays frozen until acknowledgement or explicit host cancellation',()=>{
 const {g,r,host,players,poll,advance}=setup();g.act(players[0],'abilityUse',{targetId:players[1].id});const id=r.pairEvent.id;poll({id,status:'ready'});advance(20000);advance(90000);assert.equal(r.phase,'pair-rooms');assert.equal(r.pairEvent.deadline,null);assert.throws(()=>g.act(players[0],'pairAbort'));g.act(host,'pairAbort');assert.equal(r.phase,'ended');assert.equal(r.result.winner,'cancelled');assert.equal(poll().mode,'release');
});
test('temporary disconnection does not silently acknowledge the shared dossier',()=>{
 const {g,r,host,players}=setup({ability:'variables',suspicions:true});for(let i=0;i<players.length;i++)g.act(host,'next');g.connection(players[0],false);g.tick();for(const s of [host,...players.slice(1)])g.act(s,'suspicionsRead');assert.equal(r.phase,'suspicions');g.connection(players[0],true);g.act(players[0],'suspicionsRead');assert.equal(r.phase,'playing');
});
