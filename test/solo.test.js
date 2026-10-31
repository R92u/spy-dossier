'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Game}=require('../game');
const secret='test-only-solo-profile-secret-123456789';
const userId='100000000000000001';
function setup(name='aqr1337'){
 let now=1000;const g=new Game({now:()=>now,profileSecret:secret}),s=g.session();g.connection(s,true);
 const code=g.profiles.invite(s);g.profiles.confirm(secret,{code,userId,name});g.act(s,'create',{name:'Тестировщик'});const r=g.rooms.get(s.room);
 const enable=()=>g.act(s,'testMode',{enabled:true});
 let token;
 const connect=()=>{token=g.voice.connect({code:g.voice.invite(r,s),guildId:'100000000000000002',channelId:'100000000000000003',channelName:'Test',userId}).token;return poll();};
 const poll=(roster=[userId])=>g.voice.poll(token,{roster});
 const advance=ms=>{now+=ms;g.tick();};
 const start=()=>g.act(s,'start',{});
 const playing=()=>{start();g.act(s,'ready');advance(5001);};
 return {g,s,r,enable,connect,poll,advance,start,playing};
}
test('solo switch requires signed aqr1337 profile and room ownership',()=>{
 const {g,s,r}=setup('other');assert.equal(g.view(s).room.canTest,false);
 g.act(s,'leave');g.act(s,'create',{name:'aqr1337'});assert.throws(()=>g.act(s,'testMode',{enabled:true}));
 s.discord.name='aqr1337';assert.throws(()=>g.act(s,'testMode',{enabled:true}));
 const [payload,signature]=s.discord.credential.split('.'),forged=JSON.parse(Buffer.from(payload,'base64url'));forged.name='aqr1337';
 g.profiles.restore(s,Buffer.from(JSON.stringify(forged)).toString('base64url')+'.'+signature);
 assert.throws(()=>g.act(s,'testMode',{enabled:true}));
 const valid=setup();assert.equal(valid.g.view(valid.s).room.canTest,true);
 const guest=valid.g.session();valid.g.connection(guest,true);valid.g.act(guest,'join',{code:valid.r.code,name:'Guest'});
 valid.g.profiles.confirm(secret,{code:valid.g.profiles.invite(guest),userId:'100000000000000099',name:'aqr1337'});
 assert.equal(valid.g.view(guest).room.canTest,false);assert.throws(()=>valid.g.act(guest,'testMode',{enabled:true}));assert.throws(valid.enable);
});
test('solo rooms are private, cannot gain real guests, and return to normal when disabled',()=>{
 const {g,s,r,enable}=setup();enable();assert.equal(r.players[0].host,false);assert.deepEqual(g.list(),[]);
 assert.throws(()=>g.act(g.session(),'join',{name:'Guest',code:r.code}));
 g.act(s,'testMode',{enabled:false});assert.equal(g.list().length,1);assert.equal(r.players[0].host,true);assert.throws(()=>g.act(s,'start',{}));
});
test('solo start still requires a fresh bot and the linked user in voice',()=>{
 const {g,s,r,enable,connect,poll,advance,start}=setup();enable();assert.throws(start);assert.equal(r.players.length,1);
 assert.throws(()=>g.act(s,'voiceSettings',{enabled:false,radius:0}));connect();poll([]);assert.throws(start);
 poll();advance(6001);assert.throws(start);poll();start();assert.equal(r.players.length,4);assert.equal(r.players.filter(p=>p.simulated).length,3);
 assert.equal(g.view(s).room.role,'spy');assert.equal(g.view(s).room.dealTo,s.id);assert.equal(g.sessions.size,1);
});
test('solo follows real dossier, selection, own turn and virtual turn mute policies',()=>{
 const {g,s,r,enable,connect,poll,advance,start}=setup();enable();connect();start();
 assert.deepEqual(poll().allowed,[]);assert.equal(g.view(s).room.voice.expected,'muted');
 g.act(s,'ready');assert.equal(r.phase,'selecting');assert.deepEqual(poll().allowed,[]);
 advance(5001);assert.equal(r.current,s.id);assert.deepEqual(poll().allowed,[userId]);assert.equal(g.view(s).room.voice.expected,'open');
 g.act(s,'next');assert.notEqual(r.current,s.id);assert.deepEqual(poll().allowed,[]);
 for(let i=0;i<3;i++)g.act(s,'next');assert.equal(r.current,s.id);assert.deepEqual(poll().allowed,[userId]);
});
test('solo whisper radius includes the real microphone next to virtual seats',()=>{
 const {g,s,r,enable,connect,poll,playing}=setup();enable();g.act(s,'voiceSettings',{enabled:true,radius:1});connect();playing();
 g.act(s,'next');assert.deepEqual(poll().allowed,[userId]);g.act(s,'next');assert.deepEqual(poll().allowed,[]);
});
test('solo voting unmutes, accepts one human vote, and resumes the actual table',()=>{
 const {g,s,r,enable,connect,poll,playing}=setup();enable();connect();playing();g.act(s,'next');g.act(s,'voteStart');
 assert.equal(poll().mode,'all');assert.equal(g.view(s).room.vote.total,1);assert.equal(g.view(s).room.vote.required,1);
 const target=r.players.find(p=>p.simulated);g.act(s,'vote',{targetId:target.id});
 assert.equal(r.phase,'playing');assert.equal(target.alive,false);assert.equal(poll().mode,'turn');
 g.act(s,'voteStart');g.act(s,'vote',{targetId:s.id});assert.equal(r.phase,'ended');assert.equal(poll().mode,'release');
});
test('solo guessing unmutes, ends normally, resets without duplicate virtual players',()=>{
 const {g,s,r,enable,connect,poll,playing,start}=setup();enable();connect();playing();g.act(s,'guessStart');assert.equal(poll().mode,'all');
 g.act(s,'guessType',{text:'ма'});assert.equal(g.view(s).room.guess,'ма');g.act(s,'guessSubmit',{text:'МАЯК'});
 assert.equal(r.result.winner,'spy');assert.equal(poll().mode,'release');g.act(s,'reset');assert.equal(r.players.length,1);start();assert.equal(r.players.length,4);
 g.act(s,'testStop');assert.equal(poll().mode,'release');g.act(s,'reset');g.act(s,'profileForget');assert.equal(r.testMode,false);assert.equal(r.players[0].host,true);assert.equal(g.view(s).room.canTest,false);
});
test('test actions are rejected in normal games and losing entitlement blocks solo restart',()=>{
 const {g,s,r,enable,connect,playing}=setup();assert.throws(()=>g.act(s,'testStop'));assert.throws(()=>g.act(s,'testVoteEnd'));
 enable();connect();playing();assert.throws(()=>g.act(s,'testMode',{enabled:false}));assert.throws(()=>g.act(s,'testVoteEnd'));
 g.act(s,'testStop');g.act(s,'reset');g.profiles.restore(s,'invalid');assert.throws(()=>g.act(s,'start',{}));assert.equal(r.testMode,false);
});
