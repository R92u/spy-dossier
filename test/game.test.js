'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {Game,normalized}=require('../game');const {createApp}=require('../server');
function setup(count=4){let now=1000;const g=new Game({now:()=>now});const all=Array.from({length:count+1},()=>g.session());all.forEach(s=>g.connection(s,true));const [host,...players]=all;g.act(host,'create',{name:'Ведущий'});players.forEach((p,i)=>g.act(p,'join',{code:host.room,name:'Игрок '+i}));g.act(host,'start',{word:'Ёлка',theme:'Зима',hint:'Зелёная',spyId:players[0].id});return {g,host,players,r:g.rooms.get(host.room),advance:ms=>{now+=ms;g.tick();},ready:()=>{let r=g.rooms.get(host.room);while(g.dealTo(r))g.act(players.find(p=>p.id===g.dealTo(r)),'ready');now+=4500;g.tick();}};}
test('private views never disclose secret or spy identity',()=>{const {g,host,players,r}=setup();const view=g.view(players[0]).room;assert.equal(view.word,null);assert.equal(view.hint,r.first===players[0].id?'Зелёная':null);assert.equal(view.spyId,null);assert.equal(g.view(players[1]).room.word,'Ёлка');assert.equal(g.view(players[1]).room.hint,null);assert.equal(g.view(players[1]).room.spyId,null);assert.equal(g.view(host).room.spyId,players[0].id);assert.equal(new Set(r.order).size,4);assert.ok(!r.order.includes(host.id));});
test('all players must acknowledge role before turns; unauthorized controls fail',()=>{const {g,host,players,r,ready}=setup();assert.throws(()=>g.act(players[0],'next'));g.act(players.find(p=>p.id===g.dealTo(r)),'ready');assert.equal(r.phase,'reveal');ready();assert.equal(r.phase,'playing');const other=players.find(p=>p.id!==r.current);assert.throws(()=>g.act(other,'next'));assert.throws(()=>g.act(host,'voteStart'));assert.throws(()=>g.act(players[1],'guessStart'));const before=r.current;g.act(host,'next');assert.notEqual(r.current,before);});
test('strict majority vote eliminates innocent and continues, dead cannot vote',()=>{const {g,players,r,ready,advance}=setup(4);ready();g.act(players[1],'voteStart');for(const p of players.slice(0,3))g.act(p,'vote',{targetId:players[3].id});assert.equal(r.phase,'voting');advance(30000);assert.equal(r.phase,'playing');assert.equal(r.players.find(p=>p.id===players[3].id).alive,false);assert.throws(()=>g.act(players[3],'voteStart'));assert.notEqual(r.current,players[3].id);});
test('half of votes and abstention do not eliminate anyone',()=>{const {g,players,r,ready,advance}=setup(4);ready();g.act(players[1],'voteStart');for(const p of players.slice(0,2))g.act(p,'vote',{targetId:players[0].id});g.act(players[2],'vote',{targetId:null});assert.throws(()=>g.act(players[2],'vote',{targetId:players[0].id}));advance(30000);assert.equal(r.phase,'playing');assert.ok(g.alive(r).length===4);});
test('majority catches spy and ends round once',()=>{const {g,players,r,ready,advance}=setup();ready();g.act(players[1],'voteStart');players.slice(1).forEach(p=>g.act(p,'vote',{targetId:players[0].id}));advance(30000);assert.equal(r.result.winner,'civilians');assert.equal(g.view(players[0]).room.word,'Ёлка');assert.throws(()=>g.act(players[0],'guessSubmit',{text:'ёлка'}));});
test('one remaining civilian gives spy victory',()=>{const {g,players,r,ready,advance}=setup(3);ready();g.act(players[1],'voteStart');players.slice(0,2).forEach(p=>g.act(p,'vote',{targetId:players[2].id}));advance(30000);assert.equal(r.result.winner,'spy');});
test('guess interrupts voting; live text visible to everyone; normalized answer wins',()=>{const {g,players,host,r,ready,advance}=setup();ready();g.act(players[2],'voteStart');g.act(players[0],'guessStart');g.act(players[0],'guessType',{text:'ел'});assert.equal(g.view(host).room.guess,'ел');assert.equal(g.view(players[2]).room.guess,'ел');advance(30001);assert.equal(r.phase,'guessing');assert.throws(()=>g.act(players[1],'guessType',{text:'ёлка'}));g.act(players[0],'guessSubmit',{text:'  ЕЛКА  '});assert.equal(r.result.winner,'spy');});
test('wrong answer loses, repeated attempts rejected, host can reset',()=>{const {g,players,host,r,ready}=setup();ready();g.act(players[0],'guessStart');g.act(players[0],'guessSubmit',{text:'снег'});assert.equal(r.result.winner,'civilians');assert.throws(()=>g.act(players[0],'guessSubmit',{text:'ёлка'}));assert.throws(()=>g.act(players[0],'reset'));g.act(host,'reset');assert.equal(r.phase,'waiting');assert.equal(r.spyId,null);assert.equal(r.word,'');});
test('reconnect preserves role and seat; expiry of spy finishes round',()=>{const {g,players,r,ready,advance}=setup();ready();const seat=r.order.indexOf(players[0].id);g.connection(players[0],false);advance(30000);g.connection(players[0],true);assert.equal(g.view(players[0]).room.role,'spy');assert.equal(r.order.indexOf(players[0].id),seat);g.connection(players[0],false);advance(90001);assert.equal(r.result.winner,'civilians');});
test('departing host closes lobby for everyone',()=>{const {g,host,players}=setup();g.act(host,'leave');assert.equal(g.rooms.size,0);assert.ok(players.every(p=>g.view(p).room===null));});
test('new round random assignment and invalid joins',()=>{const {g,host,players,r,ready}=setup();const extra=g.session();assert.throws(()=>g.act(extra,'join',{code:r.code,name:'Extra'}));ready();g.act(players[0],'guessStart');g.act(players[0],'guessSubmit',{text:'wrong'});g.act(host,'reset');g.act(host,'start',{word:'Маяк',theme:'Море',hint:'Свет',spyId:'random'});assert.equal(r.round,2);assert.ok(players.some(p=>p.id===r.spyId));assert.equal(r.phase,'reveal');});
test('normalization preserves meaningful punctuation and handles ё and spaces',()=>{assert.equal(normalized('  СЕВЕРНЫЙ   ПОЛЮС '),'северный полюс');assert.notEqual(normalized('маяк!'),normalized('маяк'));});
test('HTTP health, sessions, streaming, invalid credentials and static assets',async()=>{const app=createApp();await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});let reader;try{assert.equal((await fetch(base+'/healthz')).status,200);assert.match(await (await fetch(base+'/')).text(),/Шпион/);const session=await (await post('/api/session',{})).json();assert.ok(session.token);const stream=await fetch(base+'/events?token='+session.token);reader=stream.body.getReader();const chunk=new TextDecoder().decode((await reader.read()).value);assert.match(chunk,/data:/);assert.equal((await post('/api/action',{token:session.token,action:'create',data:{name:'Test'}})).status,200);assert.equal((await post('/api/action',{token:'invalid',action:'create'})).status,401);assert.equal((await fetch(base+'/game.js')).status,404);assert.equal((await fetch(base+'/api/session',{method:'POST',headers:{origin:'https://evil.invalid'}})).status,403);}finally{if(reader)await reader.cancel();app.close();}});

test('lobby directory exposes only public metadata and updates through room lifecycle',()=>{
 const {g,host,players,r,ready}=setup();const visitor=g.session();
 let directory=g.view(visitor).lobbies;assert.equal(directory.length,1);
 assert.deepEqual(Object.keys(directory[0]).sort(),['code','hostName','playerCount','maxPlayers','phase','hostOnline','joinable'].sort());
 assert.equal(directory[0].hostName,'Ведущий');assert.equal(directory[0].playerCount,4);assert.equal(directory[0].joinable,false);
 assert.ok(!JSON.stringify(directory).includes('Ёлка'));assert.ok(!JSON.stringify(directory).includes(players[0].id));
 ready();g.act(players[0],'guessStart');g.act(players[0],'guessSubmit',{text:'wrong'});
 assert.equal(g.view(visitor).lobbies[0].phase,'ended');g.act(host,'reset');assert.equal(g.view(visitor).lobbies[0].joinable,true);
 g.act(visitor,'join',{code:r.code,name:'Новый'});assert.equal(g.list()[0].playerCount,5);
 g.act(visitor,'leave');assert.equal(g.list()[0].playerCount,4);
 g.connection(host,false);assert.equal(g.list()[0].joinable,false);assert.equal(g.list()[0].hostOnline,false);
 g.connection(host,true);assert.equal(g.list()[0].joinable,true);
 g.act(host,'leave');assert.deepEqual(g.view(visitor).lobbies,[]);
});
test('full lobbies stay visible but cannot be joined; available ones sort first',()=>{
 const g=new Game();const host=g.session();g.connection(host,true);g.act(host,'create',{name:'Full'});
 for(let i=0;i<12;i++){const p=g.session();g.connection(p,true);g.act(p,'join',{code:host.room,name:'Player '+i});}
 const other=g.session();g.connection(other,true);g.act(other,'create',{name:'Open'});
 const list=g.list();assert.equal(list[0].code,other.room);assert.equal(list[1].playerCount,12);assert.equal(list[1].joinable,false);
 const visitor=g.session();assert.throws(()=>g.act(visitor,'join',{code:host.room,name:'Overflow'}));
});
test('dossiers are dealt in order and selection blocks actions until its deadline',()=>{
 const {g,host,players,r,advance}=setup();
 const firstReader=players.find(p=>p.id===g.dealTo(r));
 assert.throws(()=>g.act(players.find(p=>p!==firstReader),'ready'));
 assert.equal(g.view(firstReader).room.dealTo,firstReader.id);
 while(g.dealTo(r))g.act(players.find(p=>p.id===g.dealTo(r)),'ready');
 assert.equal(r.phase,'selecting');assert.ok(r.order.includes(r.current));
 assert.throws(()=>g.act(host,'next'));assert.throws(()=>g.act(players[0],'guessStart'));assert.throws(()=>g.act(players[1],'voteStart'));
 advance(4499);assert.equal(r.phase,'selecting');advance(1);assert.equal(r.phase,'playing');
});
test('spy hint depends on the first player, not the current turn',()=>{
 const {g,players,r}=setup();r.first=players[1].id;r.current=players[0].id;
 assert.equal(g.view(players[0]).room.hint,null);
 r.first=players[0].id;r.current=players[1].id;assert.equal(g.view(players[0]).room.hint,'Зелёная');
 assert.equal(g.view(players[1]).room.hint,null);
});
