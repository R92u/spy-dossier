'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Game}=require('../game');
function setup(settings={},ability){
 let now=1000;const g=new Game({now:()=>now}),all=Array.from({length:6},()=>g.session()),[host,...players]=all;
 all.forEach(s=>g.connection(s,true));g.act(host,'create',{name:'Host'});players.forEach((p,i)=>g.act(p,'join',{code:host.room,name:'Player '+i}));const r=g.room(host);
 const configure=patch=>g.act(host,'modulationSettings',{countdown:true,animations:true,dossier:true,...settings,...patch});configure();
 if(ability)g.act(host,'abilitySettings',{enabled:true,wheel:true,censored:true,pool:[ability]});
 const start=()=>g.act(host,'start',{word:'Маяк',theme:'Море',hint:'Свет',spyId:players[0].id});
 const ready=()=>players.forEach(p=>g.act(p,'ready'));
 const advance=ms=>{now+=ms;g.tick();};return {g,r,host,players,configure,start,ready,advance};
}
test('modulation is host-only, validates flags, persists across reset and locks during a round',()=>{
 const x=setup({countdown:false,dossier:false});const {g,r,host,players}=x;
 assert.throws(()=>g.act(players[0],'modulationSettings',{countdown:true,animations:true,dossier:true}));
 assert.throws(()=>x.configure({countdown:0}));x.start();assert.throws(()=>x.configure({countdown:true}));x.ready();
 assert.equal(r.phase,'playing');assert.equal(g.view(players[0]).room.word,null);assert.equal(g.view(players[1]).room.word,'Маяк');
 g.act(players[0],'guessStart');g.act(players[0],'guessSubmit',{text:'wrong'});g.act(host,'reset');assert.equal(g.view(host).room.modulation.dossier,false);
});
test('all readers can open concurrently, readiness is individual, countdown starts after the last acknowledgement',()=>{
 const x=setup(),{g,r,players}=x;x.start();players.forEach(p=>assert.equal(g.view(p).room.dealTo,p.id));
 [...players].reverse().slice(0,4).forEach(p=>g.act(p,'ready'));x.advance(20000);assert.equal(r.phase,'reveal');
 assert.throws(()=>g.act(players[1],'ready'));g.act(players[0],'ready');assert.equal(r.selectionEndsAt,26000);
 x.advance(4999);assert.equal(r.phase,'selecting');x.advance(1);assert.equal(r.phase,'playing');
});
test('one-second words expire independently for simultaneous readers even without dossiers',()=>{
 const x=setup({dossier:false}),{g,r,host,players}=x;
 g.act(host,'experimentSettings',{enabled:true,flashWord:true,multiSpy:false,spyCount:1,spiesKnowEachOther:false,cooperative:false,micChaos:false,micChance:10});x.start();
 g.act(players[1],'dossierReveal');x.advance(400);g.act(players[2],'dossierReveal');
 assert.equal(g.view(players[1]).room.word,'Маяк');assert.equal(g.view(players[2]).room.word,'Маяк');assert.equal(g.view(players[0]).room.word,null);
 x.advance(600);assert.equal(g.view(players[1]).room.word,null);assert.equal(g.view(players[2]).room.word,'Маяк');g.act(players[1],'ready');assert.throws(()=>g.act(players[2],'ready'));
 x.advance(400);assert.equal(g.view(players[2]).room.word,null);assert.equal(r.phase,'reveal');
});
for(const ability of ['coin','reverse','shuffle','spotlight'])test('disabled animations apply '+ability+' immediately without blocking turns',()=>{
 const x=setup({animations:false,countdown:false},ability),{g,r,players}=x;g.abilities.random=()=>0;x.start();assert.equal(r.phase,'reveal');assert.equal(r.abilityDraw,null);x.ready();
 const current=r.current,target=players.find(p=>p.id!==current);g.act(players[0],'abilityUse',{targetId:target.id});assert.equal(r.phase,'playing');assert.equal(r.abilityEffect,null);assert.equal(r.abilityShuffle,null);
 assert.equal(g.view(players[0]).room.ability.used,true);
 if(ability==='coin'){assert.equal(g.view(players[0]).room.ability.letter,'М');assert.equal(g.view(players[1]).room.ability.letter,null);}
 if(ability==='reverse')assert.equal(r.turnDirection,-1);
 if(ability==='shuffle')assert.equal(r.cycle,2);
 if(ability==='spotlight'){assert.equal(r.current,target.id);g.act(x.host,'next');assert.equal(r.current,current);}
});
test('voting ends as soon as majority becomes unreachable, with votes still outstanding',()=>{
 const x=setup({countdown:false}),{g,r,players}=x;x.start();x.ready();g.act(players[0],'voteStart');
 g.act(players[0],'vote',{targetId:null});g.act(players[1],'vote',{targetId:null});assert.equal(r.phase,'voting');
 g.act(players[2],'vote',{targetId:null});assert.equal(r.phase,'playing');assert.equal(g.alive(r).length,5);assert.equal(r.vote,null);
});
test('split votes remain open while a strict majority is still possible',()=>{
 const x=setup({countdown:false}),{g,r,players}=x;x.start();x.ready();g.act(players[0],'voteStart');
 g.act(players[0],'vote',{targetId:players[3].id});g.act(players[1],'vote',{targetId:players[4].id});g.act(players[2],'vote',{targetId:players[3].id});assert.equal(r.phase,'voting');
 g.act(players[3],'vote',{targetId:players[3].id});assert.equal(r.phase,'playing');assert.equal(g.alive(r).length,4);
});
test('a departing voter immediately resolves an already secured majority',()=>{
 const x=setup({countdown:false}),{g,r,players}=x;x.start();x.ready();g.act(players[0],'voteStart');
 g.act(players[0],'vote',{targetId:players[1].id});g.act(players[2],'vote',{targetId:players[1].id});
 g.act(players[3],'leave');assert.equal(r.phase,'voting');g.act(players[4],'leave');assert.equal(r.phase,'ended');assert.equal(r.result.winner,'spy');
});
