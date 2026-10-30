'use strict';
const draftPattern=/^[\p{L}\p{M}'’\-]*$/u,wordPattern=/^[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*$/u;
class OneWord{
 constructor(game){this.game=game;}
 begin(r){
  this.game.abilities.ensureTurns(r);
  const alive=new Set(this.game.alive(r).map(p=>p.id)),interrupted=r.current;
  const order=[...new Set([...r.turnQueue,...this.game.abilities.cycleOrder(r,r.turnAnchor)])].filter(id=>alive.has(id)&&id!==interrupted);
  order.push(interrupted);
  r.oneWord={order,pending:[...order],draft:'',entries:[]};r.silence=null;r.micInterrupted=null;
  r.phase='one-word';r.current=order[0];r.turnSerial=(r.turnSerial||1)+1;
 }
 action(r,s,action,d){
  const p=r.players.find(p=>p.id===s.id),current=r.players.find(p=>p.id===r.current);
  const simulated=r.testMode&&r.hostId===s.id&&this.game.canTest(s)&&current?.simulated;
  this.game.need(r.phase==='one-word'&&r.oneWord&&p?.alive&&(s.id===r.current||simulated),'Сейчас пишет другой игрок.');
  const text=typeof d.text==='string'?d.text.normalize('NFC'):null;
  this.game.need(text!==null&&text.length<=32&&draftPattern.test(text),'Введите только одно слово, до 32 букв.');
  if(action==='oneWordType'){r.oneWord.draft=text;return;}
  this.game.need(wordPattern.test(text),'Введите одно слово без пробелов.');
  r.oneWord.entries.push({playerId:r.current,text});this.advance(r);
 }
 advance(r){
  const w=r.oneWord;if(!w)return;
  const alive=new Set(this.game.alive(r).map(p=>p.id));w.pending=w.pending.slice(1).filter(id=>alive.has(id));w.draft='';
  r.turnSerial=(r.turnSerial||1)+1;
  if(w.pending.length){r.current=w.pending[0];return;}
  const order=w.order.filter(id=>alive.has(id));r.oneWord=null;r.phase='playing';r.cycle++;
  r.current=order[0];r.turnAnchor=r.current;r.turnQueue=order.slice(1);r.turnOrderSignature=r.order.join(',');r.cycleSpoken=[r.current];this.game.suspicions.reveal(r,r.cycle-1);
 }
 view(r){return r.oneWord?{draft:r.oneWord.draft,entries:r.oneWord.entries.map(e=>({...e})),index:r.oneWord.order.length-r.oneWord.pending.length+1,total:r.oneWord.order.length}:null;}
}
module.exports={OneWord};
