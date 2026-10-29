const {test}=require('node:test');const assert=require('node:assert/strict');const {Game}=require('../game');
function setup(){let now=1000;const g=new Game({now:()=>now}),people=Array.from({length:6},()=>g.session()),[host,...players]=people;people.forEach(s=>g.connection(s,true));g.act(host,'create',{name:'Host'});players.forEach((p,i)=>g.act(p,'join',{code:host.room,name:'P'+i}));const r=g.rooms.get(host.room);g.act(host,'voiceSettings',{enabled:true,radius:1});const code=g.voice.invite(r,host),link=g.voice.connect({code,guildId:'100000000000000001',channelId:'100000000000000002',channelName:'Test',userId:'100000000000000010'});const ids=people.map((_,i)=>String(100000000000000010n+BigInt(i)));g.voice.poll(link.token,{roster:ids});players.forEach((s,i)=>g.voice.join(link.token,{code:g.voice.invite(r,s),userId:ids[i+1]}));return {g,r,people,players,host,token:link.token,ids,advance:ms=>{now+=ms;g.tick();},start:()=>g.act(host,'start',{word:'Secret',theme:'Theme',hint:'Hint',spyId:players[0].id})};}
test('voice pairing codes are private, one-use and room scoped',()=>{const {g,r,host,players,token,ids}=setup();const code=g.voice.invite(r,players[0]);assert.equal(g.view(host).room.voice.code,'');assert.equal(g.view(players[0]).room.voice.code,code);assert.throws(()=>g.voice.join('invalid',{code,userId:ids[1]}));g.voice.join(token,{code,userId:ids[1]});assert.throws(()=>g.voice.join(token,{code,userId:ids[1]}));assert.throws(()=>g.voice.join(token,{code:g.voice.invite(r,players[1]),userId:ids[1]}));assert.ok(!JSON.stringify(g.view(host)).includes(token));assert.ok(!JSON.stringify(g.view(players[1])).includes(ids[1]));});
test('voice policies follow phases and circular living neighbours',()=>{const {g,r,players,token,ids,start}=setup();start();let p=g.voice.poll(token,{roster:ids});assert.deepEqual(p.allowed,[]);r.phase='playing';r.order=players.map(p=>p.id);r.current=players[0].id;p=g.voice.poll(token,{roster:ids});assert.deepEqual(new Set(p.allowed),new Set([ids[5],ids[1],ids[2]]));r.players.find(p=>p.id===players[1].id).alive=false;p=g.voice.poll(token,{roster:ids});assert.deepEqual(new Set(p.allowed),new Set([ids[5],ids[1],ids[3]]));r.voiceSettings.radius=6;p=g.voice.poll(token,{roster:ids});assert.equal(p.allowed.length,4);assert.ok(!p.allowed.includes(ids[0]));for(const phase of ['voting','guessing']){r.phase=phase;assert.equal(g.voice.poll(token,{roster:ids}).mode,'all');}r.phase='ended';assert.equal(g.voice.poll(token,{roster:ids}).mode,'release');assert.ok(!JSON.stringify(p).includes('Secret'));assert.ok(!JSON.stringify(p).includes('spy'));});
test('voice start requires mappings, channel presence and fresh healthy bot',()=>{const {g,r,host,players,token,ids,advance,start}=setup();assert.throws(()=>g.act(players[0],'voiceSettings',{enabled:false,radius:0}));assert.throws(()=>g.act(host,'voiceSettings',{enabled:true,radius:-1}));g.voice.poll(token,{roster:ids.slice(1)});assert.throws(start);g.voice.poll(token,{roster:ids,error:'Missing permission'});assert.throws(start);g.voice.poll(token,{roster:ids});advance(6001);assert.throws(start);g.voice.poll(token,{roster:ids});start();assert.equal(r.phase,'reveal');assert.throws(()=>g.act(host,'voiceSettings',{enabled:false,radius:0}));});
test('disabled, closed and disconnected rooms release bot control',()=>{const {g,r,host,token,ids}=setup();g.act(host,'voiceSettings',{enabled:false,radius:0});assert.equal(g.voice.poll(token,{roster:ids}).mode,'release');g.act(host,'leave');assert.equal(g.voice.poll(token,{roster:ids}).closed,true);assert.throws(()=>g.voice.poll(token,{roster:ids}));});
test('voice invite expiry and wrong room cannot bind Discord',()=>{const {g,r,players,advance,token,ids}=setup();const code=g.voice.invite(r,players[0]);advance(600001);assert.throws(()=>g.voice.join(token,{code,userId:ids[1]}));});

test('silence removes a whispering neighbour without expanding the whisper ring',()=>{
 const {g,r,players,token,ids,start}=setup();start();
 r.phase='playing';r.order=players.map(p=>p.id);r.current=players[0].id;r.turnSerial=1;
 r.silence={targetId:players[1].id,pending:true,untilTurn:null};
 let policy=g.voice.poll(token,{roster:ids});
 assert.deepEqual(new Set(policy.allowed),new Set([ids[5],ids[1]]));
 assert.ok(!policy.allowed.includes(ids[3]),'the next neighbour must not replace a silenced seat');
 r.voiceSettings.radius=6;policy=g.voice.poll(token,{roster:ids});
 assert.equal(policy.allowed.length,4);assert.ok(!policy.allowed.includes(ids[2]));
 // The bot receives only the existing allowlist contract, not secret ability metadata.
 assert.deepEqual(Object.keys(policy).sort(),['allowed','channelId','guildId','leaseMs','mode']);
 assert.ok(!JSON.stringify(policy).includes('silence'));
});

test('silence expires after the protected turn and never blocks discussion or release',()=>{
 const {g,r,players,token,ids,start}=setup();start();
 r.phase='playing';r.order=players.map(p=>p.id);r.current=players[0].id;r.turnSerial=8;
 r.silence={targetId:players[1].id,pending:false,untilTurn:8};
 const poll=()=>g.voice.poll(token,{roster:ids});
 assert.ok(!poll().allowed.includes(ids[2]));
 for(const phase of ['voting','guessing']){r.phase=phase;assert.deepEqual(poll().mode,'all');}
 r.phase='playing';assert.ok(!poll().allowed.includes(ids[2]),'the effect resumes if discussion ends before the next turn');
 r.turnSerial=9;assert.ok(poll().allowed.includes(ids[2]));
 r.silence.pending=true;
 for(const phase of ['ability-draw','reveal','selecting']){r.phase=phase;assert.deepEqual(poll().allowed,[]);}
 for(const phase of ['waiting','ended']){r.phase=phase;assert.equal(poll().mode,'release');}
 r.phase='playing';r.voiceSettings.enabled=false;assert.equal(poll().mode,'release');
});

test('spotlight voice follows the temporary speaker and preserves their original neighbours',()=>{
 const {g,r,players,token,ids,start}=setup();start();
 r.phase='playing';r.order=players.map(p=>p.id);r.current=players[0].id;
 const originalOrder=[...r.order],poll=()=>g.voice.poll(token,{roster:ids});
 r.spotlight={targetId:players[2].id,returnTo:r.current};r.current=players[2].id;
 assert.deepEqual(new Set(poll().allowed),new Set([ids[2],ids[3],ids[4]]));
 assert.deepEqual(r.order,originalOrder,'a centred visual seat must not change the whisper neighbours');
 for(const phase of ['voting','guessing']){r.phase=phase;assert.equal(poll().mode,'all');}
 r.phase='playing';assert.deepEqual(new Set(poll().allowed),new Set([ids[2],ids[3],ids[4]]));
 r.current=r.spotlight.returnTo;r.spotlight=null;
 assert.deepEqual(new Set(poll().allowed),new Set([ids[5],ids[1],ids[2]]));
});

test('shuffling keeps every microphone muted until the new turn is selected',()=>{
 const {g,r,players,token,ids,start}=setup();start();
 r.phase='playing';r.order=players.map(p=>p.id);r.current=players[0].id;
 const poll=()=>g.voice.poll(token,{roster:ids});assert.equal(poll().allowed.length,3);
 r.phase='shuffling';r.order=[players[3],players[1],players[4],players[0],players[2]].map(p=>p.id);r.current=players[4].id;
 assert.equal(poll().mode,'turn');assert.deepEqual(poll().allowed,[]);
 r.phase='playing';assert.deepEqual(new Set(poll().allowed),new Set([ids[2],ids[5],ids[1]]));
});
