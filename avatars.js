'use strict';
const {createHash}=require('node:crypto');
class Avatars{
 constructor(game){this.game=game;this.images=new Map();}
 set(s,value){
  this.game.need(typeof value==='string'&&value.length<=45000,'Аватарка слишком большая. Загрузите её через профиль.');
  let url='';
  if(value){
   this.game.need(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value),'Допускается только обработанная JPEG-аватарка.');
   const bytes=Buffer.from(value.slice(23),'base64');
   this.game.need(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217,'Некорректная картинка.');
   url='/avatars/'+createHash('sha256').update(bytes).digest('hex');this.images.set(url,bytes);
  }
  s.avatar=url;const r=this.game.rooms.get(s.room),p=r?.players.find(p=>p.id===s.id);if(p)p.avatar=url;
 }
 prune(){const used=new Set([...this.game.sessions.values()].map(s=>s.avatar));for(const r of this.game.rooms.values())for(const p of r.players)used.add(p.avatar);for(const url of this.images.keys())if(!used.has(url))this.images.delete(url);}
}
module.exports={Avatars};
