'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {Game}=require('../game');

const clockSource=fs.readFileSync(path.join(__dirname,'../public/clock.js'),'utf8');
function clockHarness(wallTime=0){
 let monotonic=75;
 const context=vm.createContext({Date:{now:()=>wallTime},performance:{now:()=>monotonic}});
 vm.runInContext(clockSource,context,{filename:'clock.js'});
 return {
  sync:time=>context.syncGameClock(time),now:()=>context.gameTime(),
  advance:ms=>{monotonic+=ms;},setWall:time=>{wallTime=time;}
 };
}

test('shared game time ignores a device clock hours ahead or behind the server',()=>{
 const serverTime=1730000000000;
 for(const offset of [-12*3600000,2000,12*3600000]){
  const clock=clockHarness(serverTime+offset);
  assert.equal(clock.sync(serverTime),true);
  assert.equal(clock.now(),serverTime);
  clock.advance(275.5);
  assert.equal(clock.now(),serverTime+275.5);
 }
});

test('wall-clock jumps cannot skip or reverse an in-progress animation',()=>{
 const clock=clockHarness(1730000000000);clock.sync(5000);
 clock.advance(400);assert.equal(clock.now(),5400);
 clock.setWall(0);clock.advance(150);assert.equal(clock.now(),5550);
 clock.setWall(9999999999999);clock.advance(250);assert.equal(clock.now(),5800);
 assert.equal(clock.now(),5800,'reading the clock does not advance it');
});

test('each valid server update renews the monotonic elapsed-time anchor',()=>{
 const clock=clockHarness();clock.sync(10000);
 clock.advance(900);assert.equal(clock.now(),10900);
 clock.sync(11200);assert.equal(clock.now(),11200);
 clock.advance(225);assert.equal(clock.now(),11425);
 clock.sync(12200);clock.advance(600);assert.equal(clock.now(),12800);
});

test('missing, nonnumeric, or nonfinite server samples leave the running clock intact',()=>{
 const clock=clockHarness();clock.sync(1000);clock.advance(100);
 for(const invalid of [undefined,null,'2000',NaN,Infinity,-Infinity,{},[]]){
  assert.equal(clock.sync(invalid),false);
  assert.equal(clock.now(),1100);
 }
 clock.advance(250);assert.equal(clock.now(),1350);
});

test('both menu and room snapshots carry the authoritative game clock',()=>{
 let now=3000;const game=new Game({now:()=>now}),session=game.session();
 assert.equal(game.view(session).serverTime,3000);
 game.act(session,'create',{name:'Clock check'});now=4500;
 const view=game.view(session);
 assert.equal(view.serverTime,4500);
 assert.equal(view.room.phase,'waiting');
});

test('clock-only heartbeats update time without changing the render state signature',()=>{
 const appSource=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 const start=appSource.indexOf('function acceptState(next){'),end=appSource.indexOf('\nfunction home()',start);
 assert.ok(start>=0&&end>start);
 let monotonic=0;
 const context=vm.createContext({performance:{now:()=>monotonic},syncSettings(){}});
 vm.runInContext(clockSource+'\nlet state={},discordCredential="";\n'+appSource.slice(start,end),context);
 context.acceptState({serverTime:5000,me:'player',room:null,discord:{},lobbies:[]});
 const first=vm.runInContext('JSON.stringify(state)',context);
 monotonic=1000;
 context.acceptState({serverTime:6000,me:'player',room:null,discord:{},lobbies:[]});
 assert.equal(vm.runInContext('JSON.stringify(state)',context),first);
 assert.equal(vm.runInContext('Object.hasOwn(state,"serverTime")',context),false);
 assert.equal(context.gameTime(),6000);
});
