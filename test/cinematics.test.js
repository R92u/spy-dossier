'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Game}=require('../game');
function setup(kind){
 let now=1000;const g=new Game({now:()=>now}),host=g.session(),players=Array.from({length:5},()=>g.session());
 [host,...players].forEach(s=>g.connection(s,true));g.act(host,'create',{name:'Host'});
 players.forEach((s,i)=>g.act(s,'join',{name:'Player'+i,code:host.room}));const r=g.room(host);
 g.act(host,'abilitySettings',{enabled:true,wheel:false,censored:true,pool:[kind]});
 g.act(host,'start',{word:'Маяк',theme:'Море',hint:'Свет',spyId:players[0].id});
 while(g.dealTo(r))g.act(players.find(p=>p.id===g.dealTo(r)),'ready');now+=5000;g.tick();
 r.order=players.map(p=>p.id);r.current=players[0].id;
 r.voiceSettings={enabled:true,radius:0};const link={members:new Map(players.map(p=>[p.id,p.id]))};
 return {g,r,host,players,advance:ms=>{now+=ms;g.tick();},policy:()=>g.voice.policy(r,link)};
}
for(const [kind,duration] of [['reverse',5700],['spotlight',7000]])test(kind+' locks actions and microphones for its synchronized cinematic',()=>{
 const {g,r,host,players,advance,policy}=setup(kind);
 g.act(players[0],'abilityUse',{targetId:players[2].id});
 assert.equal(r.phase,'ability-effect');assert.equal(r.abilityEffect.endsAt-r.abilityEffect.startedAt,duration);
 assert.deepEqual(g.view(players[1]).room.abilityEffect,g.view(host).room.abilityEffect);
 assert.ok(!JSON.stringify(r.abilityEffect).includes(players[0].id),'event must not identify the spy');
 assert.deepEqual(policy(),{mode:'turn',allowed:[]});
 for(const [s,action] of [[host,'next'],[players[0],'guessStart'],[players[1],'voteStart'],[players[0],'abilityUse']])assert.throws(()=>g.act(s,action));
 advance(duration-1);assert.equal(r.phase,'ability-effect');assert.deepEqual(policy().allowed,[]);
 advance(1);assert.equal(r.phase,'playing');assert.equal(r.abilityEffect,null);
 assert.deepEqual(policy().allowed,[kind==='spotlight'?players[2].id:players[0].id]);
 if(kind==='spotlight'){g.act(players[2],'next');assert.equal(r.current,players[0].id);}
});
test('speaker departure cancels cinematic and resumes interrupted turn safely',()=>{
 const {g,r,players,policy}=setup('spotlight');g.act(players[0],'abilityUse',{targetId:players[2].id});
 g.act(players[2],'leave');assert.equal(r.abilityEffect,null);assert.equal(r.phase,'playing');assert.equal(r.current,players[0].id);assert.deepEqual(policy().allowed,[players[0].id]);
});
test('ending a cinematic clears its event and releases Discord',()=>{
 const {g,r,players,policy}=setup('reverse');g.act(players[0],'abilityUse');g.finish(r,'civilians','test');
 assert.equal(r.abilityEffect,null);assert.deepEqual(policy(),{mode:'release',allowed:[]});
});
