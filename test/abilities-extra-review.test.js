'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Game}=require('../game');
const secret='independent-ability-review-secret-123456';

function normal(id,count=6){
 let now=1000;const g=new Game({now:()=>now,profileSecret:secret});
 const host=g.session(),players=Array.from({length:count},()=>g.session());
 [host,...players].forEach(s=>g.connection(s,true));
 g.act(host,'create',{name:'Host'});
 players.forEach((s,i)=>g.act(s,'join',{name:'Player '+i,code:host.room}));
 const r=g.rooms.get(host.room),spy=players[0];
 g.act(host,'abilitySettings',{enabled:true,wheel:false,censored:true,pool:[id]});
 g.act(host,'start',{word:'Маяк',theme:'Море',hint:'Свет',spyId:spy.id});
 while(g.dealTo(r))g.act(players.find(s=>s.id===g.dealTo(r)),'ready');
 now+=4500;g.tick();
 const next=()=>{g.act(host,'next');return r.current;};
 return {g,r,host,players,spy,next};
}
function clockwise(r){const start=r.order.indexOf(r.current);return [...r.order.slice(start),...r.order.slice(0,start)];}

test('reverse preserves a complete remaining cycle regardless of random starting seat',()=>{
 // Repeated randomly seated games exercise both sides of the array boundary.
 for(let attempt=0;attempt<12;attempt++){
  const {g,r,spy,next}=normal('reverse'),ring=clockwise(r),cycle=r.cycle;
  assert.equal(next(),ring[1]);
  g.act(spy,'abilityUse');
  const remaining=ring.slice(2).reverse(),actual=[];
  for(const id of remaining){actual.push(next());assert.equal(r.current,id);assert.equal(r.cycle,cycle);}
  assert.equal(new Set([ring[0],ring[1],...actual]).size,ring.length);
  assert.equal(next(),ring[0]);assert.equal(r.cycle,cycle+1);
  for(const id of ring.slice(1))assert.equal(next(),id,'the following cycle returns to seating order');
 }
});

test('a departed player in the reversed remainder does not repeat or skip another living turn',()=>{
 const {g,r,players,spy,next}=normal('reverse'),ring=clockwise(r),cycle=r.cycle;
 assert.equal(next(),ring[1]);g.act(spy,'abilityUse');
 const departing=ring.slice(2).find(id=>id!==spy.id);
 g.act(players.find(s=>s.id===departing),'leave');
 for(const id of ring.slice(2).reverse().filter(id=>id!==departing)){assert.equal(next(),id);assert.equal(r.cycle,cycle);}
 assert.equal(next(),ring[0]);assert.equal(r.cycle,cycle+1);
 assert.equal(next(),ring[1]);
});

test('a voted-out extra speaker returns to the interrupted turn without consuming the normal queue',()=>{
 const {g,r,host,players,spy,next}=normal('spotlight');
 const ring=clockwise(r);next();next();
 const interrupted=r.current,cycle=r.cycle,target=ring.slice(0,2).find(id=>id!==spy.id);
 g.act(spy,'abilityUse',{targetId:target});assert.equal(r.current,target);
 g.act(players.find(s=>s.id!==target),'voteStart');
 players.slice(0,4).forEach(s=>g.act(s,'vote',{targetId:target}));g.resolve(r);
 assert.equal(r.phase,'playing');assert.equal(r.current,interrupted);assert.equal(r.spotlight,null);
 assert.equal(r.cycle,cycle);
 for(const id of ring.slice(3)){assert.equal(next(),id);assert.equal(r.cycle,cycle);}
 const aliveRing=ring.filter(id=>id!==target);
 assert.equal(next(),aliveRing[0]);assert.equal(r.cycle,cycle+1);
 assert.equal(g.view(host).room.voice.enabled,false,'the extra-turn ability works without Discord');
});

test('solo ability switching keeps a reversed queue intact across a temporary extra turn',()=>{
 let now=1000;const g=new Game({now:()=>now,profileSecret:secret}),s=g.session();g.connection(s,true);
 const userId='100000000000000001';g.profiles.confirm(secret,{code:g.profiles.invite(s),userId,name:'aqr1337'});
 g.act(s,'create',{name:'Tester'});g.act(s,'testMode',{enabled:true});const r=g.rooms.get(s.room);
 const token=g.voice.connect({code:g.voice.invite(r,s),guildId:'100000000000000002',channelId:'100000000000000003',channelName:'Review',userId}).token;
 const poll=()=>g.voice.poll(token,{roster:[userId]});poll();g.act(s,'start',{});g.act(s,'ready');now+=4500;g.tick();poll();
 const ring=clockwise(r),next=()=>{g.act(s,'next');return r.current;};
 assert.equal(next(),ring[1]);g.act(s,'testAbility',{id:'reverse'});g.act(s,'abilityUse');
 const remaining=ring.slice(2).reverse(),cycle=r.cycle;
 g.act(s,'testAbility',{id:'spotlight'});g.act(s,'abilityUse',{targetId:ring[0]});
 assert.equal(r.current,ring[0]);assert.throws(()=>g.act(s,'testAbility',{id:'coin'}));
 assert.equal(next(),ring[1]);assert.equal(r.cycle,cycle);
 for(const id of remaining)assert.equal(next(),id);
 assert.equal(next(),ring[0]);assert.equal(r.cycle,cycle+1);
});
