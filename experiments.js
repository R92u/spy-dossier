'use strict';
const {randomInt}=require('node:crypto');
const defaults=()=>({enabled:false,flashWord:false,multiSpy:false,spyCount:1,spiesKnowEachOther:false,cooperative:false,micChaos:false,micChance:10});

class Experiments{
 constructor(game){this.game=game;this.random=randomInt;}
 settings(r){return r.experimentSettings||defaults();}
 cooperative(r){const s=this.settings(r);return s.enabled&&s.cooperative;}
 maxSpies(r){return Math.max(1,Math.min(5,Math.floor((this.game.players(r).length-1)/2)));}
 configure(r,d){
  const bools=['enabled','flashWord','multiSpy','spiesKnowEachOther','cooperative','micChaos'];
  this.game.need(bools.every(key=>typeof d[key]==='boolean'),'Некорректные настройки экспериментов.');
  this.game.need(Number.isInteger(d.spyCount)&&d.spyCount>=1&&d.spyCount<=5,'Выберите от 1 до 5 шпионов.');
  this.game.need(Number.isInteger(d.micChance)&&d.micChance>=1&&d.micChance<=100,'Шанс должен быть от 1 до 100%.');
  this.game.need(!r.testMode||(!d.cooperative&&!d.multiSpy),'Сначала выключите одиночный тест.');
  if(!d.enabled){
   this.game.need(!r.testMode&&!this.game.abilities.needsDiscord(r),'Сначала выключите одиночный тест и «Радиомолчание».');
   r.experimentSettings=defaults();this.game.voice.configure(r,{enabled:false,radius:this.game.voice.settings(r).radius});return;
  }
  const next=Object.fromEntries([...bools,'spyCount','micChance'].map(key=>[key,d[key]]));
  if(next.cooperative){
   Object.assign(next,{flashWord:false,multiSpy:false,spyCount:1,spiesKnowEachOther:false,micChaos:false});
   this.game.voice.configure(r,{enabled:false,radius:0});
   r.abilitySettings={...this.game.abilities.settings(r),enabled:false};
  }
  r.experimentSettings=next;
 }
 enable(r){r.experimentSettings={...this.settings(r),enabled:true};}
 ready(r){
  const s=this.settings(r);if(!s.enabled)return;
  if(s.cooperative){this.game.need(!r.testMode&&!this.game.voice.settings(r).enabled&&!this.game.abilities.settings(r).enabled,'Совместный режим несовместим с тестом, микрофонами и способностями.');return;}
  if(s.multiSpy)this.game.need(!r.testMode&&this.game.players(r).length>s.spyCount*2,'Для выбранного числа шпионов нужно больше мирных игроков.');
 }
 begin(r){r.dossierReveals={};r.micInterrupted=null;r.micTurnKey=null;r.micNextAt=null;}
 finish(r){r.micInterrupted=null;r.micTurnKey=null;r.micNextAt=null;}
 flash(r,s){return this.settings(r).enabled&&this.settings(r).flashWord&&!this.cooperative(r)&&s.id!==r.hostId&&!this.game.isSpy(r,s.id);}
 dossier(r,s){
  const entry=r.dossierReveals?.[s.id],eligible=this.flash(r,s),p=r.players.find(p=>p.id===s.id);
  return {canReveal:!!(eligible&&p?.alive&&r.phase==='reveal'&&this.game.dealTo(r)===s.id&&!entry),used:!!entry,expiresAt:entry?.expiresAt??null};
 }
 reveal(r,s){
  this.game.need(this.dossier(r,s).canReveal,'Досье недоступно или уже открывалось.');
  r.dossierReveals[s.id]={expiresAt:this.game.now()+1000};
 }
 canReady(r,s){if(this.flash(r,s)){const entry=r.dossierReveals?.[s.id];this.game.need(entry&&entry.expiresAt<=this.game.now(),'Сначала откройте досье и дождитесь исчезновения слова.');}}
 wordVisible(r,s){
  if(this.cooperative(r)||this.game.isSpy(r,s.id))return false;
  if(!this.flash(r,s))return r.phase!=='waiting';
  const entry=r.dossierReveals?.[s.id];return !!entry&&entry.expiresAt>this.game.now();
 }
 observe(r){
  if(r.micInterrupted&&r.turnSerial>r.micInterrupted.untilTurn)r.micInterrupted=null;
  const s=this.settings(r),active=s.enabled&&s.micChaos&&!s.cooperative&&r.phase==='playing';
  const key=active?`${r.current}:${r.turnSerial}`:null;
  if(key!==r.micTurnKey){r.micTurnKey=key;r.micNextAt=key?this.game.now()+2000:null;}
 }
 tick(r){
  this.observe(r);if(r.micNextAt===null||r.micNextAt===undefined||this.game.now()<r.micNextAt)return;
  // One roll after a delayed tick; never fast-forward several players at once.
  r.micNextAt=this.game.now()+1000;
  if(this.random(100)>=this.settings(r).micChance)return;
  const interrupted=r.current;this.game.next(r);
  r.micInterrupted={targetId:interrupted,untilTurn:r.turnSerial};
  r.notice='Микрофон пропал. Ход передан дальше.';
 }
 muted(r,id){return r.micInterrupted?.targetId===id&&r.turnSerial<=r.micInterrupted.untilTurn;}
 view(r){return {...this.settings(r),maxSpies:this.maxSpies(r)};}
}
module.exports={Experiments};
