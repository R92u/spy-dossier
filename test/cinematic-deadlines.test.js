'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createApp}=require('../server');
function setup(t){
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:100000});
 const app=createApp();t.after(()=>app.close());
 const g=app.game,host=g.session(),players=Array.from({length:3},()=>g.session());
 [host,...players].forEach(s=>g.connection(s,true));g.act(host,'create',{name:'Host'});
 players.forEach((s,i)=>g.act(s,'join',{name:'Player'+i,code:host.room}));
 const r=g.room(host);
 g.act(host,'abilitySettings',{enabled:true,wheel:false,censored:true,pool:['reverse']});
 g.act(host,'start',{word:'Маяк',theme:'Море',hint:'Свет',spyId:players[0].id});
 while(g.dealTo(r))g.act(players.find(p=>p.id===g.dealTo(r)),'ready');
 app.broadcast();t.mock.timers.tick(5000);
 assert.equal(r.phase,'playing','selection must end at 5000ms, between heartbeat ticks');
 return {app,g,r,players};
}
test('cinematic deadlines resume play without waiting for the next heartbeat',t=>{
 const {app,g,r,players}=setup(t);
 t.mock.timers.tick(137);
 g.act(players[0],'abilityUse');app.broadcast();
 t.mock.timers.tick(5699);assert.equal(r.phase,'ability-effect');
 t.mock.timers.tick(1);assert.equal(r.phase,'playing');
 assert.equal(r.abilityEffect,null);
 // Spotlight uses the same scheduler, including starts between periodic ticks.
 g.abilities.effect(r,'spotlight',7000,{targetId:players[1].id});app.broadcast();
 t.mock.timers.tick(6999);assert.equal(r.phase,'ability-effect');
 t.mock.timers.tick(1);assert.equal(r.phase,'playing');
});
test('cancelling an effect removes its pending deadline',t=>{
 const {app,g,r,players}=setup(t);
 g.act(players[0],'abilityUse');app.broadcast();g.finish(r,'cancelled','Test');app.broadcast();
 t.mock.timers.tick(5700);assert.equal(r.phase,'ended');assert.equal(r.abilityEffect,null);
});
