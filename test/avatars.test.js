'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Game}=require('../game');
const image='data:image/jpeg;base64,'+Buffer.from([255,216,255,224,0,0,255,217]).toString('base64');
test('avatars persist across lobbies, broadcast only a URL and can be replaced or removed',()=>{
 const g=new Game(),a=g.session(),b=g.session();g.act(a,'profileAvatar',{avatar:image});g.act(a,'create',{name:'A'});g.act(b,'join',{name:'B',code:a.room});
 const url=g.view(b).room.players[0].avatar;assert.match(url,/^\/avatars\/[a-f0-9]{64}$/);assert.ok(g.avatars.images.has(url));assert.ok(!JSON.stringify(g.view(b)).includes('base64'));
 g.act(a,'leave');g.act(a,'create',{name:'A'});assert.equal(g.view(a).room.players[0].avatar,url);
 g.act(a,'profileAvatar',{avatar:''});assert.equal(g.view(a).room.players[0].avatar,'');g.avatars.prune();assert.equal(g.avatars.images.size,0);
});
test('remote, executable, invalid and oversized avatar payloads are rejected',()=>{
 const g=new Game(),s=g.session();for(const avatar of ['https://example.com/x.png','data:image/svg+xml,<svg/>','data:image/jpeg;base64,AAAA',null,'x'.repeat(50001)])assert.throws(()=>g.act(s,'profileAvatar',{avatar}));
 assert.equal(g.avatars.images.size,0);
});
