const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Game}=require('../game');
const {createApp}=require('../server');
const key='test-only-profile-signing-secret-1234567890';
const user=i=>String(100000000000000010n+BigInt(i));
function confirm(g,s,i=0){const code=g.profiles.invite(s);g.profiles.confirm(key,{code,userId:user(i),name:'Discord '+i});return g.view(s).discord.credential;}
function room(g){const people=Array.from({length:4},()=>g.session()),[host,...players]=people;people.forEach(s=>g.connection(s,true));g.act(host,'create',{name:'Host'});players.forEach((s,i)=>g.act(s,'join',{code:host.room,name:'P'+i}));g.act(host,'voiceSettings',{enabled:true,radius:0});return {people,host,players,r:g.rooms.get(host.room)};}
function connect(g,r,host){return g.voice.connect({code:g.voice.invite(r,host),guildId:user(100),channelId:user(101),channelName:'Test',userId:user(0)}).token;}
test('only the trusted bot can confirm a private one-time profile challenge',()=>{
 const g=new Game({profileSecret:key}),a=g.session(),b=g.session(),code=g.profiles.invite(a);
 assert.equal(g.view(b).discord.code,'');
 assert.throws(()=>g.profiles.confirm('wrong',{code,userId:user(0),name:'A'}));
 g.profiles.confirm(key,{code,userId:user(0),name:'A'});
 assert.throws(()=>g.profiles.confirm(key,{code,userId:user(1),name:'B'}));
 assert.equal(g.view(b).discord.credential,'');assert.equal(g.view(a).discord.name,'A');
});
test('saved profile survives new sessions and server restarts but cannot be forged',()=>{
 const g=new Game({profileSecret:key}),s=g.session(),credential=confirm(g,s);
 const restarted=new Game({profileSecret:key}),next=restarted.session();
 assert.ok(restarted.profiles.restore(next,credential));assert.equal(next.discord.userId,user(0));
 const [payload,signature]=credential.split('.'),data=JSON.parse(Buffer.from(payload,'base64url'));data.userId=user(9);
 assert.equal(restarted.profiles.restore(next,Buffer.from(JSON.stringify(data)).toString('base64url')+'.'+signature),false);
 assert.equal(next.discord,null);assert.equal(restarted.profiles.restore(next,'arbitrary-discord-id'),false);
 assert.equal(new Game({profileSecret:key+'changed'}).profiles.read(credential),null);
});
test('saved accounts automatically join every new lobby and drive the correct microphone',()=>{
 const g=new Game({profileSecret:key}),{people,host,players,r}=room(g);
 people.forEach((s,i)=>confirm(g,s,i));const token=connect(g,r,host);
 g.voice.poll(token,{roster:people.map((_,i)=>user(i))});assert.equal(g.view(host).room.voice.linkedPlayers.length,4);
 g.act(host,'start',{word:'Secret',theme:'Theme',hint:'Hint',spyId:players[0].id});
 r.phase='playing';r.current=players[1].id;assert.deepEqual(g.voice.poll(token,{roster:people.map((_,i)=>user(i))}).allowed,[user(2)]);
 g.act(host,'leave');g.act(host,'create',{name:'Host'});players.forEach((s,i)=>g.act(s,'join',{code:host.room,name:'P'+i}));
 g.act(host,'voiceSettings',{enabled:true,radius:0});const next=g.rooms.get(host.room),nextToken=connect(g,next,host);
 g.voice.poll(nextToken,{roster:people.map((_,i)=>user(i))});assert.equal(g.view(host).room.voice.linkedPlayers.length,4);
 assert.equal(g.view(players[0]).discord.code,'');
});
test('one Discord cannot occupy multiple seats; leaving releases a stale seat',()=>{
 const g=new Game({profileSecret:key}),{host,players,r}=room(g);const credential=confirm(g,host);
 g.profiles.restore(players[0],credential);const token=connect(g,r,host);g.voice.poll(token,{roster:[user(0)]});
 assert.equal(g.view(players[0]).room.voice.conflict,true);assert.equal(g.view(host).room.voice.linkedPlayers.length,1);
 confirm(g,players[0],1);g.voice.poll(token,{roster:[user(0),user(1)]});assert.equal(g.view(players[0]).room.voice.conflict,false);
 const saved=g.view(players[0]).discord.credential;g.act(players[0],'leave');g.profiles.restore(players[1],saved);
 g.voice.poll(token,{roster:[user(0),user(1)]});assert.equal(g.view(players[1]).room.voice.linked,true);
});
test('forget removes auto mapping; profile changes are blocked during a round',()=>{
 const g=new Game({profileSecret:key}),{people,host,players,r}=room(g);people.forEach((s,i)=>confirm(g,s,i));const token=connect(g,r,host);
 g.voice.poll(token,{roster:people.map((_,i)=>user(i))});g.act(players[0],'profileForget');assert.equal(g.view(players[0]).room.voice.linked,false);
 assert.throws(()=>g.voice.ready(r));confirm(g,players[0],1);g.act(host,'start',{word:'Secret',theme:'Theme',hint:'Hint',spyId:players[0].id});
 assert.throws(()=>g.act(players[0],'profileForget'));assert.throws(()=>g.act(players[0],'profileCode'));
 assert.throws(()=>g.act(players[0],'profileRestore',{credential:g.view(host).discord.credential}));
});
test('expired and cancelled profile codes cannot be used',()=>{
 let now=1;const g=new Game({now:()=>now,profileSecret:key}),s=g.session();let code=g.profiles.invite(s);now+=600001;
 assert.throws(()=>g.profiles.confirm(key,{code,userId:user(0),name:'A'}));code=g.profiles.invite(s);g.act(s,'profileCancel');
 assert.throws(()=>g.profiles.confirm(key,{code,userId:user(0),name:'A'}));assert.throws(()=>new Game({profileSecret:''}).profiles.invite(s));
});
test('HTTP profile confirmation requires bot authentication and session restores saved proof',async()=>{
 const app=createApp({profileSecret:key});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const post=async(path,body,auth)=>{const response=await fetch('http://127.0.0.1:'+app.server.address().port+path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 try{const first=(await post('/api/session',{})).body;await post('/api/action',{token:first.token,action:'profileCode'});
 const s=app.game.sessions.get(first.token),code=app.game.view(s).discord.code,body={code,userId:user(0),name:'A'};
 assert.equal((await post('/api/profile/confirm',body)).status,400);assert.equal((await post('/api/profile/confirm',body,key)).status,200);
 const credential=app.game.view(s).discord.credential;const second=(await post('/api/session',{discordCredential:credential})).body;
 assert.equal(second.discord.name,'A');assert.notEqual(second.me,first.me);
 assert.equal((await post('/api/session',{discordCredential:'fake'})).body.discord.name,'');
 }finally{app.close();}
});

