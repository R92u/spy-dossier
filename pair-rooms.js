'use strict';
const {randomBytes,randomInt}=require('node:crypto');
class PairRooms{
 constructor(game){this.game=game;this.random=randomInt;}
 enabled(r){const e=this.game.experiments.settings(r);return e.enabled&&e.commonGround&&!e.cooperative;}
 ready(r){this.game.need(this.game.abilities.discordReady(r),'Для парных комнат привяжите Discord и включите микрофоны.');this.game.voice.ready(r);const l=this.game.voice.links.get(r.code);this.game.need(l?.pairRooms,'Обновите Discord-бота: нужна поддержка парных комнат и права Manage Channels / Move Members.');}
 begin(r,{spyId=null,targetId=null,resume='playing',kind='cross'}={}){
  this.ready(r);this.game.need(!r.pairEvent,'Парные комнаты уже открыты.');
  let ids=this.game.alive(r).map(p=>p.id);const groups=[];
  if(spyId){this.game.need(ids.includes(targetId)&&targetId!==spyId,'Выберите другого живого игрока.');groups.push([spyId,targetId]);ids=ids.filter(id=>id!==spyId&&id!==targetId);}
  for(let i=ids.length-1;i>0;i--){const j=this.random(i+1);[ids[i],ids[j]]=[ids[j],ids[i]];}
  while(ids.length>=2)groups.push(ids.splice(0,2));
  if(ids.length){if(groups.length)groups[groups.length-1].push(ids[0]);else groups.push(ids);}
  // Shuffle room numbers as well: no group position identifies the activator.
  for(let i=groups.length-1;i>0;i--){const j=this.random(i+1);[groups[i],groups[j]]=[groups[j],groups[i]];}
  const now=this.game.now();r.pairEvent={id:randomBytes(12).toString('hex'),kind,groups,resume,stage:'prepare',startedAt:now,deadline:now+90000,endsAt:null,progress:0,error:null};r.phase='pair-rooms';
 }
 command(r,l){const e=r.pairEvent;if(!e)return null;return {id:e.id,kind:e.kind,hostUserId:l.members.get(r.hostId),stage:e.stage,endsAt:e.endsAt,groups:e.groups.map(group=>group.map(id=>l.members.get(id)).filter(Boolean))};}
 report(r,d){
  const e=r.pairEvent;if(!e||!d||d.id!==e.id)return;
  if(d.error&&e.stage!=='return'){e.error='Не удалось подготовить комнаты. Возвращаем участников.';this.returning(r);}
  if(e.stage==='prepare'){
   if(Number.isFinite(d.progress))e.progress=Math.max(e.progress,Math.max(0,Math.min(.99,d.progress)));
   if(d.status==='ready'){e.stage='talk';e.progress=1;e.endsAt=this.game.now()+20000;e.deadline=e.endsAt;}
  }else if(e.stage==='return'&&d.status==='returned')this.complete(r);
 }
 returning(r){const e=r.pairEvent;if(e&&e.stage!=='return'){e.stage='return';e.deadline=this.game.now()+90000;}}
 complete(r){const e=r.pairEvent;if(!e)return;r.pairEvent=null;if(r.phase!=='pair-rooms')return;if(e.error)r.notice=e.error+' Игра продолжена.';if(e.resume==='selecting'){this.game.beginCountdown(r);}else{r.phase='playing';if(!this.game.alive(r).some(p=>p.id===r.current))this.game.next(r);}}
 tick(r){const e=r.pairEvent;if(!e)return;const l=this.game.voice.links.get(r.code),now=this.game.now();if(e.stage==='talk'&&now>=e.endsAt)this.returning(r);else if(e.stage==='prepare'&&now>=e.deadline){e.error='Подготовка комнат заняла слишком долго.';this.returning(r);}else if(e.stage==='return'&&e.deadline!==null&&now>=e.deadline){e.error='Бот не подтвердил возврат. Проверьте голосовой канал или завершите раунд.';e.deadline=null;}if(!l&&e.stage!=='return'){e.error='Связь с ботом потеряна.';this.returning(r);}}
 view(r){const e=r.pairEvent;return e?{id:e.id,kind:e.kind,groups:e.groups.map(g=>[...g]),stage:e.stage,startedAt:e.startedAt,endsAt:e.endsAt,progress:e.progress,error:e.error}:null;}
}
module.exports={PairRooms};
