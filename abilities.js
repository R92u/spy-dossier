'use strict';
const {randomBytes,randomInt}=require('node:crypto');
const IDS=['coin','silence','vowels','probe','shuffle','reverse','spotlight','oneword','cross','variables'];
const ACTIVE=['reveal','selecting','playing','voting','guessing'];
const segmenter=new Intl.Segmenter('ru',{granularity:'grapheme'});
const normalizeLetter=value=>value.normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е');
class Abilities{
 constructor(game){this.game=game;this.random=randomInt;}
 state(r,s){return r.spyAbilities?.[s.id]||(s.id===r.spyId?r.abilityState:null);}
 states(r){return r.spyAbilities?Object.values(r.spyAbilities):r.abilityState?[r.abilityState]:[];}
 settings(r){return r.abilitySettings||{enabled:false,wheel:true,censored:false,pool:['coin']};}
 discordReady(r){
  const host=this.game.voice.session(r.hostId);
  return !!this.game.profiles.read(host?.discord?.credential)&&this.game.voice.settings(r).enabled;
 }
 needsDiscord(r){const settings=this.settings(r);return settings.enabled&&settings.pool.some(id=>['silence','oneword','cross'].includes(id));}
 configure(r,d){
  this.game.need(['enabled','wheel','censored'].every(key=>typeof d[key]==='boolean'),'Некорректные настройки способностей.');
  this.game.need(Array.isArray(d.pool)&&d.pool.length<=IDS.length&&d.pool.every(id=>IDS.includes(id))&&new Set(d.pool).size===d.pool.length,'Некорректный список способностей.');
  this.game.need(!d.enabled||d.pool.length>0,'Включите хотя бы одну способность.');
  this.game.need(!d.enabled||!d.pool.some(id=>['silence','oneword','cross'].includes(id))||this.discordReady(r),'Для этой способности привяжите Discord-профиль ведущего и включите управление микрофонами.');
  r.abilitySettings={enabled:d.enabled,wheel:d.wheel,censored:d.censored,pool:[...d.pool]};
 }
 ready(r){
  const settings=this.settings(r);if(!settings.enabled)return;
  this.game.need(settings.pool.length>0,'Включите хотя бы одну способность.');
  this.game.need(!this.needsDiscord(r)||this.discordReady(r),'Для этих способностей нужен привязанный Discord и управление микрофонами.');
 }
 begin(r){
  this.clear(r);r.turnSerial=1;
  const settings=this.settings(r);if(!settings.enabled||this.game.experiments.cooperative(r))return;
  const ids=(r.spyIds||[r.spyId]).filter(Boolean);r.spyAbilities=Object.fromEntries(ids.map(id=>[id,this.fresh(settings.pool[this.random(settings.pool.length)])]));
  r.abilityState=r.spyAbilities[r.spyId];const id=r.abilityState.id;
  if(settings.wheel){const startedAt=this.game.now();r.phase='ability-draw';r.abilityDraw={id:randomBytes(12).toString('hex'),startedAt,endsAt:startedAt+5000,pool:[...settings.pool],result:id,censored:settings.censored};}
 }
 fresh(id){return {id,used:false,letter:null,coin:null,feedback:null};}
 clear(r){r.oneWord=null;r.abilityEffect=null;r.turnDirection=1;r.spyAbilities=null;r.publicAbilityCoin=null;r.abilityState=null;r.abilityDraw=null;r.silence=null;r.abilityShuffle=null;r.spotlight=null;r.turnQueue=null;r.turnAnchor=null;r.turnOrderSignature=null;r.cycleSpoken=[];}
 finish(r){r.oneWord=null;r.abilityEffect=null;r.abilityDraw=null;r.silence=null;r.abilityShuffle=null;r.spotlight=null;for(const ability of this.states(r))ability.coin=null;r.publicAbilityCoin=null;}
 test(r,s,id){
  this.game.need(r.testMode&&r.hostId===s.id&&this.game.canTest(s),'Выбор способности доступен только в одиночном тесте.');
  this.game.need(r.phase==='playing'&&!r.spotlight,'Дождитесь завершения дополнительного хода или анимации.');
  this.game.need(IDS.includes(id),'Неизвестная способность.');
  if(['silence','oneword','cross'].includes(id)){this.game.need(this.discordReady(r),'Для этой способности нужен Discord.');this.game.voice.ready(r);}
  r.silence=null;r.publicAbilityCoin=null;r.abilityState=this.fresh(id);r.spyAbilities={[s.id]:r.abilityState};
 }
 cycleOrder(r,anchor){
  const live=new Set(this.game.alive(r).map(p=>p.id)),index=Math.max(0,r.order.indexOf(anchor));
  return [...r.order.slice(index),...r.order.slice(0,index)].filter(id=>live.has(id));
 }
 shuffledSeats(r){
  const living=this.game.alive(r).map(p=>p.id),live=new Set(living);
  const original=[...new Set([...r.order.filter(id=>live.has(id)),...living])];
  if(original.length<2)return original;
  // Every living player moves. Bound retries, then use a nonzero rotation.
  for(let attempt=0;attempt<20;attempt++){
   const candidate=[...original];
   for(let i=candidate.length-1;i>0;i--){const j=this.random(i+1);[candidate[i],candidate[j]]=[candidate[j],candidate[i]];}
   if(candidate.every((id,i)=>id!==original[i]))return candidate;
  }
  const shift=1+this.random(original.length-1);
  return [...original.slice(shift),...original.slice(0,shift)];
 }
 ensureTurns(r){
  const signature=r.order.join(',');
  if(!r.turnQueue||r.turnOrderSignature!==signature){
   r.turnAnchor=r.current;r.turnOrderSignature=signature;r.cycleSpoken=[r.current];
   r.turnQueue=this.cycleOrder(r,r.current).filter(id=>id!==r.current);
  }
 }
 next(r){
  if(r.abilityEffect?.kind==='spotlight'){r.abilityEffect=null;if(r.phase==='ability-effect')r.phase='playing';}
  this.prune(r);
  if(r.spotlight){
   const returnTo=r.spotlight.returnTo;r.spotlight=null;
   if(this.game.alive(r).some(p=>p.id===returnTo)){r.current=returnTo;r.turnSerial=(r.turnSerial||1)+1;this.prune(r);return;}
  }
  this.ensureTurns(r);
  const live=new Set(this.game.alive(r).map(p=>p.id));if(!live.size)return;
  // A skip consumes that seat's normal turn; spotlight never consumes this queue.
  for(let n=0;n<r.order.length*2+1;n++){
   if(!r.turnQueue.length){r.turnDirection=1;r.cycle++;r.cycleSpoken=[];r.turnQueue=this.cycleOrder(r,r.turnAnchor);}
   const id=r.turnQueue.shift();if(!live.has(id))continue;r.cycleSpoken.push(id);
   if(r.silence?.pending&&r.silence.targetId===id){r.silence.pending=false;r.silence.untilTurn=(r.turnSerial||1)+1;continue;}
   r.current=id;r.turnSerial=(r.turnSerial||1)+1;this.prune(r);return;
  }
 }
 prune(r){
  if(!r.silence)return;
  if(!this.game.alive(r).some(p=>p.id===r.silence.targetId)||(!r.silence.pending&&r.turnSerial>r.silence.untilTurn))r.silence=null;
 }
 canUse(r,s){
  const ability=this.state(r,s),p=r.players.find(p=>p.id===s.id);
  if(!ability||ability.used||!this.game.isSpy(r,s.id)||this.game.experiments.cooperative(r)||!p?.alive||!ACTIVE.includes(r.phase))return false;
  if(ability.id==='cross')return r.phase==='playing'&&!r.spotlight&&this.discordReady(r);
  if(ability.id==='variables')return r.phase==='playing'&&!r.spotlight;
  if(ability.id==='oneword')return r.phase==='playing'&&!r.spotlight&&this.discordReady(r);
  if(ability.id==='silence')return r.phase==='playing'&&!r.silence&&!r.spotlight&&this.discordReady(r);
  if(ability.id==='spotlight'&&(r.silence||r.micInterrupted))return false;
  if(['shuffle','reverse','spotlight'].includes(ability.id))return r.phase==='playing'&&!r.spotlight;
  return true;
 }
 use(r,s,d){
  this.game.need(this.canUse(r,s),'Способность сейчас недоступна.');
  const ability=this.state(r,s);
  if(ability.id==='cross'){this.game.pairs.begin(r,{spyId:s.id,targetId:d.targetId});ability.used=true;return;}
  if(ability.id==='variables'){this.ensureTurns(r);for(let i=r.turnQueue.length-1;i>0;i--){const j=this.random(i+1);[r.turnQueue[i],r.turnQueue[j]]=[r.turnQueue[j],r.turnQueue[i]];}ability.used=true;return;}
  if(ability.id==='oneword'){this.game.voice.ready(r);this.game.oneWord.begin(r);ability.used=true;return;}
  if(ability.id==='coin'){
   const startedAt=this.game.now();ability.used=true;
   ability.coin={id:randomBytes(12).toString('hex'),startedAt,endsAt:startedAt+2400,outcome:this.random(2)===0?'heads':'tails'};r.publicAbilityCoin=ability.coin;
   return;
  }
  if(ability.id==='vowels'){
   const count=(normalizeLetter(r.word).match(/[аеёиоуыэюяaeiou]/gu)||[]).length;
   ability.feedback={vowels:count>=3?'3+':String(count)};ability.used=true;return;
  }
  if(ability.id==='probe'){
   const letter=typeof d.letter==='string'?normalizeLetter(d.letter.trim()):'';
   this.game.need(/^[а-яa-z]$/u.test(letter),'Введите одну русскую или латинскую букву.');
   ability.feedback={probe:{letter,present:normalizeLetter(r.word).includes(letter)}};ability.used=true;return;
  }
  if(ability.id==='shuffle'){
   const order=this.shuffledSeats(r);
   const startedAt=this.game.now();r.order=order;r.current=order[this.random(order.length)];r.cycle++;r.turnSerial=(r.turnSerial||1)+1;
   r.turnDirection=1;r.turnQueue=null;this.ensureTurns(r);r.phase='shuffling';
   r.abilityShuffle={id:randomBytes(12).toString('hex'),startedAt,blackoutEndsAt:startedAt+1200,endsAt:startedAt+5700};
   ability.used=true;return;
  }
  if(ability.id==='reverse'){
   this.ensureTurns(r);const live=new Set(this.game.alive(r).map(p=>p.id));
   r.turnQueue=r.turnQueue.filter(id=>live.has(id)).reverse();const fromDirection=r.turnDirection||1;r.turnDirection=-fromDirection;this.effect(r,'reverse',5700,{fromDirection});ability.used=true;return;
  }
  if(ability.id==='spotlight'){
   const target=this.game.alive(r).find(p=>p.id===d.targetId);
   this.game.need(target&&target.id!==r.current,'Выберите другого живого игрока для дополнительного хода.');
   this.ensureTurns(r);r.spotlight={targetId:target.id,returnTo:r.current};r.current=target.id;r.turnSerial=(r.turnSerial||1)+1;
   this.effect(r,'spotlight',7000,{targetId:target.id});ability.used=true;return;
  }
  this.game.voice.ready(r);
  const target=this.game.alive(r).find(p=>p.id===d.targetId);
  this.game.need(target,'Выберите живого игрока за столом.');
  ability.used=true;
  r.silence={targetId:target.id,pending:target.id!==r.current,untilTurn:target.id===r.current?r.turnSerial+1:null};
  if(target.id===r.current)this.game.next(r);
 }
 effect(r,kind,duration,extra={}){const startedAt=this.game.now();r.abilityEffect={id:randomBytes(12).toString('hex'),kind,startedAt,endsAt:startedAt+duration,...extra};r.phase='ability-effect';}
 tick(r){
  this.prune(r);
  if(r.phase==='ability-effect'&&r.abilityEffect?.endsAt<=this.game.now()){r.abilityEffect=null;r.phase='playing';}
  if(r.phase==='ability-draw'&&r.abilityDraw?.endsAt<=this.game.now()){r.abilityDraw=null;r.phase='reveal';}
  if(r.phase==='shuffling'&&r.abilityShuffle?.endsAt<=this.game.now()){r.abilityShuffle=null;r.phase='playing';}
  for(const ability of this.states(r)){
  if(ACTIVE.includes(r.phase)&&ability?.coin?.outcome==='heads'&&ability.coin.endsAt<=this.game.now()&&!ability.letter){
   ability.letter=[...segmenter.segment(r.word)][0]?.segment||'';
  }}
 }
 view(r,s){
  const settings=this.settings(r),spy=this.game.isSpy(r,s.id),own=this.state(r,s),assigned=spy?own:r.abilityState,multi=(r.spyIds?.length||1)>1;
  const publicAssignment=settings.wheel&&!settings.censored&&!multi;
  const visibleCoin=spy&&own?.coin?own.coin:!settings.censored?(r.publicAbilityCoin||r.abilityState?.coin):null;
  const coin=visibleCoin?{id:visibleCoin.id,startedAt:visibleCoin.startedAt,endsAt:visibleCoin.endsAt,outcome:visibleCoin.endsAt<=this.game.now()?visibleCoin.outcome:null}:null;
  const draw=r.phase==='ability-draw'?r.abilityDraw:null;
  return {
   abilities:{...settings,pool:[...settings.pool],discordReady:this.discordReady(r)},
   ability:assigned?{id:spy||publicAssignment?assigned.id:null,used:spy||publicAssignment&&assigned.id!=='variables'?assigned.used:false,letter:spy?assigned.letter:null,feedback:spy?assigned.feedback:null,coin,silence:r.silence?{targetId:r.silence.targetId,pending:r.silence.pending}:null,canUse:this.canUse(r,s)}:null,
   abilityDraw:draw?{id:draw.id,startedAt:draw.startedAt,endsAt:draw.endsAt,pool:[...draw.pool],result:spy?own?.id||null:!multi&&!draw.censored?draw.result:null,censored:draw.censored}:null,
   abilityEffect:r.abilityEffect?{...r.abilityEffect}:null,
   abilityShuffle:r.abilityShuffle?{...r.abilityShuffle}:null,
   spotlight:r.spotlight?{...r.spotlight}:null
  };
 }
}
module.exports={Abilities};
