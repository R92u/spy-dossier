'use strict';
const {randomBytes}=require('node:crypto');
const secret=()=>randomBytes(24).toString('hex');
const snowflake=value=>typeof value==='string'&&/^\d{15,22}$/.test(value);
class VoiceBridge{
 constructor(game){this.game=game;this.links=new Map();this.invites=new Map();}
 settings(r){return r.voiceSettings||{enabled:false,radius:0};}
 configure(r,d){this.game.need(typeof d.enabled==='boolean'&&Number.isInteger(d.radius)&&d.radius>=0&&d.radius<=6,'Некорректные настройки голоса.');r.voiceSettings={enabled:d.enabled,radius:d.radius};}
 invite(r,s){this.game.need(this.settings(r).enabled,'Включите экспериментальную игру.');for(const [code,i]of this.invites)if(i.playerId===s.id||i.expires<this.game.now())this.invites.delete(code);const code=secret();this.invites.set(code,{room:r.code,playerId:s.id,host:r.hostId===s.id,expires:this.game.now()+600000});return code;}
 consume(code,host){const i=this.invites.get(code);this.game.need(i&&i.host===host&&i.expires>this.game.now(),'Код привязки неверен или истёк.');const r=this.game.rooms.get(i.room);this.game.need(r&&r.phase==='waiting'&&r.players.some(p=>p.id===i.playerId)&&this.settings(r).enabled,'Лобби недоступно для привязки.');return {i,r};}
 session(id){return [...this.game.sessions.values()].find(s=>s.id===id);}
 syncProfiles(r,l){
  const active=new Set(r.players.map(p=>p.id));
  for(const id of l.members.keys())if(!active.has(id)||l.profileMembers?.has(id))l.members.delete(id);
  l.profileMembers=new Set();
  for(const p of r.players){const user=this.session(p.id)?.discord?.userId;if(!user)continue;
   l.members.delete(p.id);
   if([...l.members.values()].includes(user))continue;
   l.members.set(p.id,user);l.profileMembers.add(p.id);
  }
 }
 checkAccount(playerId,userId){const account=this.session(playerId)?.discord;this.game.need(!account||account.userId===userId,'Отправьте команду с Discord-аккаунта, сохранённого в вашем профиле.');}
 connect(d){const {i,r}=this.consume(d.code,true);this.game.need([d.guildId,d.channelId,d.userId].every(snowflake),'Некорректные Discord ID.');this.checkAccount(i.playerId,d.userId);this.game.need(!this.links.has(r.code),'Сначала отключите прежнюю привязку.');this.game.need(![...this.links.values()].some(l=>l.channelId===d.channelId&&this.game.rooms.has(l.room)),'Канал уже связан с другой игрой.');const token=secret();this.links.set(r.code,{room:r.code,token,guildId:d.guildId,channelId:d.channelId,channelName:String(d.channelName||'Голосовой канал').slice(0,80),members:new Map([[i.playerId,d.userId]]),roster:[],lastSeen:0,error:null});this.invites.delete(d.code);return {token,room:r.code};}
 link(token){const l=[...this.links.values()].find(l=>l.token===token);this.game.need(l,'Привязка бота завершена.');return l;}
 join(token,d){const l=this.link(token),{i,r}=this.consume(d.code,false);this.game.need(r.code===l.room&&snowflake(d.userId)&&l.roster.includes(d.userId),'Зайдите в связанный голосовой канал.');this.syncProfiles(r,l);this.checkAccount(i.playerId,d.userId);this.game.need(![...l.members].some(([id,user])=>id!==i.playerId&&user===d.userId),'Этот Discord уже занимает другое место в лобби. Каждый игрок привязывает свой аккаунт.');l.members.set(i.playerId,d.userId);this.invites.delete(d.code);return {ok:true};}
 disconnect(token){const l=this.link(token);this.links.delete(l.room);return {ok:true};}
 policy(r,l){const settings=this.settings(r);if(!settings.enabled||['waiting','ended'].includes(r.phase))return {mode:'release',allowed:[]};if(['voting','guessing'].includes(r.phase))return {mode:'all',allowed:[]};if(r.phase!=='playing')return {mode:'turn',allowed:[]};const seats=r.order.filter(id=>r.players.some(p=>p.id===id&&p.alive));const index=seats.indexOf(r.current),allowed=new Set();if(index>=0)for(let offset=-settings.radius;offset<=settings.radius;offset++){const id=seats[(index+offset+seats.length*10)%seats.length];const user=l.members.get(id);if(user)allowed.add(user);}return {mode:'turn',allowed:[...allowed]};}
 poll(token,d){const l=this.link(token),r=this.game.rooms.get(l.room);if(!r){this.links.delete(l.room);return {mode:'release',closed:true,allowed:[]};}this.game.need(Array.isArray(d.roster)&&d.roster.length<=200&&d.roster.every(snowflake),'Некорректный список участников.');this.syncProfiles(r,l);l.roster=[...new Set(d.roster)];l.lastSeen=this.game.now();l.error=d.error?String(d.error).slice(0,160):null;return {...this.policy(r,l),guildId:l.guildId,channelId:l.channelId,leaseMs:5000};}
 ready(r){if(!this.settings(r).enabled)return;const l=this.links.get(r.code);if(l)this.syncProfiles(r,l);this.game.need(l&&l.lastSeen&&this.game.now()-l.lastSeen<6000&&!l.error,'Бот не готов. Проверьте подключение и права Discord.');this.game.need(r.players.filter(p=>!p.simulated).every(p=>l.members.has(p.id)&&l.roster.includes(l.members.get(p.id))),'Все игроки и ведущий должны привязать Discord и зайти в войс.');}
 view(r,s){const l=this.links.get(r.code);if(l)this.syncProfiles(r,l);const invite=[...this.invites].find(([,i])=>i.room===r.code&&i.playerId===s.id&&i.expires>this.game.now());const policy=r.testMode&&l?this.policy(r,l):null;return {...this.settings(r),expected:policy?(policy.mode==='turn'&&!policy.allowed.includes(s.discord?.userId)?'muted':'open'):null,connected:!!l,online:!!l&&!!l.lastSeen&&this.game.now()-l.lastSeen<6000,channelName:l?.channelName||'',error:l?.error||'',linked:!!l?.members.has(s.id),conflict:!!s.discord&&!!l&&!l.members.has(s.id)&&[...l.members.values()].includes(s.discord.userId),linkedPlayers:r.players.filter(p=>l?.members.has(p.id)).map(p=>p.id),code:invite?.[0]||''};}
 tick(){for(const [code,i]of this.invites)if(i.expires<this.game.now()||!this.game.rooms.has(i.room))this.invites.delete(code);for(const [room,l]of this.links)if(!this.game.rooms.has(room)&&this.game.now()-l.lastSeen>60000)this.links.delete(room);}
}
module.exports={VoiceBridge};
