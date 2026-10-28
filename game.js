'use strict';
const {randomBytes,randomInt}=require('node:crypto');
const clean=(s,max=80)=>typeof s==='string'?s.trim().slice(0,max):'';
const normalized=s=>clean(s).normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ');
const shuffle=items=>{const a=[...items];for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
class Game {
 constructor({now=Date.now,voteMs=30000}={}){this.rooms=new Map();this.sessions=new Map();this.now=now;this.voteMs=voteMs;}
 session(){const token=randomBytes(24).toString('hex');const s={token,id:randomBytes(8).toString('hex'),room:null,connected:false,lastSeen:this.now()};this.sessions.set(token,s);return s;}
 need(ok,message){if(!ok)throw Error(message);}
 room(s){const r=this.rooms.get(s.room);this.need(r,'Лобби уже закрыто. Создайте новое.');return r;}
 players(r){return r.players.filter(p=>!p.host);}
 alive(r){return this.players(r).filter(p=>p.alive);}
 finish(r,winner,reason){r.phase='ended';r.result={id:r.roundId,winner,reason,word:r.word,spyId:r.spyId};r.vote=null;}
 next(r){const live=this.alive(r);if(!live.length)return;let i=r.order.indexOf(r.current);for(let n=0;n<r.order.length;n++){i=(i+1)%r.order.length;if(i===0)r.cycle++;if(live.some(p=>p.id===r.order[i])){r.current=r.order[i];return;}}}
 resolve(r){if(!r.vote)return;const tally={};for(const id of Object.values(r.vote.ballots))if(id)tally[id]=(tally[id]||0)+1;const threshold=Math.floor(r.vote.eligible.length/2)+1;const target=Object.keys(tally).find(id=>tally[id]>=threshold);r.vote=null;r.phase='playing';if(!target){r.notice='Большинство не набрано. Никто не выбывает.';return;}const p=r.players.find(p=>p.id===target);p.alive=false;r.notice=p.name+' выбывает.';if(target===r.spyId){this.finish(r,'civilians','Шпион раскрыт большинством голосов.');return;}r.notice=p.name+' был мирным. Раунд продолжается.';if(this.alive(r).length<=2){this.finish(r,'spy','Остался один мирный игрок. Шпион победил.');return;}if(r.current===target)this.next(r);}
 leave(s){const r=this.rooms.get(s.room);s.room=null;if(!r)return;if(r.hostId===s.id){for(const p of r.players){const peer=[...this.sessions.values()].find(x=>x.id===p.id);if(peer)peer.room=null;}this.rooms.delete(r.code);return;}const p=r.players.find(x=>x.id===s.id);if(r.phase==='waiting'||r.phase==='ended')r.players=r.players.filter(x=>x.id!==s.id);else if(p){p.connected=false;p.alive=false;if(s.id===r.spyId)this.finish(r,'civilians','Шпион покинул раунд.');else if(this.alive(r).length<=2)this.finish(r,'spy','В раунде остался один мирный.');else{if(r.vote){r.vote.eligible=r.vote.eligible.filter(id=>id!==s.id);delete r.vote.ballots[s.id];for(const voter in r.vote.ballots)if(r.vote.ballots[voter]===s.id)delete r.vote.ballots[voter];}if(r.current===s.id)this.next(r);if(r.phase==='reveal'&&this.alive(r).every(p=>p.ready))r.phase='playing';}}}
 connection(s,online){s.connected=online;s.lastSeen=this.now();const r=this.rooms.get(s.room);if(r){const p=r.players.find(p=>p.id===s.id);if(p)p.connected=online;}}
 tick(){for(const s of this.sessions.values()){if(!s.connected&&this.now()-s.lastSeen>90000&&s.room)this.leave(s);if(!s.connected&&!s.room&&this.now()-s.lastSeen>3600000)this.sessions.delete(s.token);}for(const r of this.rooms.values())if(r.vote&&r.vote.endsAt<=this.now())this.resolve(r);}
 act(s,action,d={}){
  s.lastSeen=this.now();
  if(action==='leave'){this.leave(s);return;}
  if(action==='create'||action==='join'){
   this.need(!s.room,'Сначала выйдите из текущего лобби.');const name=clean(d.name,20);this.need(name,'Введите имя.');let r;
   if(action==='create'){let code;do{code=randomBytes(4).toString('hex').slice(0,5).toUpperCase();}while(this.rooms.has(code));r={code,hostId:s.id,players:[],phase:'waiting',round:0,notice:''};this.rooms.set(code,r);}else{r=this.rooms.get(clean(d.code,5).toUpperCase());this.need(r,'Лобби не найдено.');this.need(r.phase==='waiting','Раунд уже начался. Дождитесь нового.');this.need(r.players.length<13,'В лобби уже 12 игроков.');}
   this.need(!r.players.some(p=>normalized(p.name)===normalized(name)),'Это имя уже занято.');r.players.push({id:s.id,name,host:r.hostId===s.id,alive:true,ready:false,connected:s.connected});s.room=r.code;return;
  }
  const r=this.room(s),p=r.players.find(p=>p.id===s.id),host=r.hostId===s.id;
  this.need(p,'Вы не участник лобби.');
  if(action==='start'){
   this.need(host&&r.phase==='waiting','Только ведущий может начать раунд.');const players=this.players(r);this.need(players.length>=3,'Нужны минимум 3 игрока и ведущий.');this.need(players.every(p=>p.connected),'Дождитесь подключения всех игроков.');
   const word=clean(d.word),theme=clean(d.theme),hint=clean(d.hint,140);this.need(word&&theme&&hint,'Укажите слово, тему и подсказку.');const spy=d.spyId==='random'?players[randomInt(players.length)].id:d.spyId;this.need(players.some(p=>p.id===spy),'Выберите шпиона.');
   Object.assign(r,{word,theme,hint,spyId:spy,phase:'reveal',round:r.round+1,roundId:randomBytes(12).toString('hex'),order:shuffle(players.map(p=>p.id)),cycle:1,vote:null,guess:'',result:null,notice:''});r.current=r.order[0];for(const x of players){x.alive=true;x.ready=false;}return;
  }
  if(action==='ready'){this.need(!host&&r.phase==='reveal','Сейчас нельзя подтвердить роль.');p.ready=true;if(this.alive(r).every(p=>p.ready)){r.phase='playing';r.notice='';}return;}
  if(action==='next'){this.need(r.phase==='playing'&&(host||(p.alive&&r.current===p.id)),'Сейчас не ваш ход.');this.next(r);return;}
  if(action==='voteStart'){this.need(!host&&p.alive&&r.phase==='playing','Голосование сейчас недоступно.');r.phase='voting';r.vote={endsAt:this.now()+this.voteMs,eligible:this.alive(r).map(p=>p.id),ballots:{},initiator:p.name};r.notice='';return;}
  if(action==='vote'){this.need(r.phase==='voting'&&r.vote&&r.vote.eligible.includes(p.id)&&p.alive&&!host,'Вы не можете голосовать.');this.need(!Object.hasOwn(r.vote.ballots,p.id),'Ваш голос уже учтён.');const target=d.targetId;this.need(target===null||this.alive(r).some(p=>p.id===target),'Игрок недоступен.');r.vote.ballots[p.id]=target;return;}
  if(action==='guessStart'){this.need(p.id===r.spyId&&p.alive&&['playing','voting'].includes(r.phase),'Угадывать может только шпион во время раунда.');r.phase='guessing';r.vote=null;r.guess='';return;}
  if(action==='guessType'){this.need(p.id===r.spyId&&r.phase==='guessing','Сейчас нельзя вводить догадку.');r.guess=typeof d.text==='string'?d.text.slice(0,80):'';return;}
  if(action==='guessSubmit'){this.need(p.id===r.spyId&&r.phase==='guessing','Сейчас нельзя отправить догадку.');const guess=clean(d.text);this.need(guess,'Введите слово.');r.guess=guess;this.finish(r,normalized(guess)===normalized(r.word)?'spy':'civilians',normalized(guess)===normalized(r.word)?'Шпион угадал секретное слово.':'Шпион ошибся. Мирные победили.');return;}
  if(action==='reset'){this.need(host&&r.phase==='ended','Новый раунд открывает ведущий.');r.players=r.players.filter(p=>p.host||p.connected);r.phase='waiting';r.word='';r.hint='';r.theme='';r.spyId=null;r.vote=null;r.result=null;r.guess='';r.order=[];r.notice='';for(const x of r.players){x.alive=true;x.ready=false;}return;}
  throw Error('Неизвестное действие.');
 }
 list(){return [...this.rooms.values()].map(r=>{const host=r.players.find(p=>p.id===r.hostId);const playerCount=this.players(r).length;return {code:r.code,hostName:host?.name||'',playerCount,maxPlayers:12,phase:r.phase,hostOnline:!!host?.connected,joinable:r.phase==='waiting'&&playerCount<12&&!!host?.connected};}).sort((a,b)=>Number(b.joinable)-Number(a.joinable)||a.code.localeCompare(b.code));}
 view(s){const r=this.rooms.get(s.room);if(!r)return {me:s.id,room:null,lobbies:this.list()};const host=r.hostId===s.id,spy=r.spyId===s.id,ended=r.phase==='ended';return {me:s.id,room:{code:r.code,phase:r.phase,round:r.round,roundId:r.roundId,players:r.players.map(p=>({...p})),hostId:r.hostId,theme:r.theme||'',hint:host||spy||ended?r.hint||'':null,word:host||(!spy&&r.phase!=='waiting')||ended?r.word||'':null,role:host?'host':r.phase==='waiting'?null:spy?'spy':'civilian',spyId:host||ended?r.spyId:null,order:r.order||[],current:r.current,cycle:r.cycle,notice:r.notice,guess:r.phase==='guessing'||ended?r.guess:null,vote:r.vote?{endsAt:r.vote.endsAt,total:r.vote.eligible.length,count:Object.keys(r.vote.ballots).length,required:Math.floor(r.vote.eligible.length/2)+1,voted:Object.hasOwn(r.vote.ballots,s.id),myVote:r.vote.ballots[s.id],initiator:r.vote.initiator}:null,result:r.result||null}};}
}
module.exports={Game,normalized};
