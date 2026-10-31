'use strict';
const {randomBytes,randomInt}=require('node:crypto');const {VoiceBridge}=require('./voice');const {Profiles}=require('./profiles');const {Abilities}=require('./abilities');const {Experiments}=require('./experiments');const {Avatars}=require('./avatars');const {OneWord}=require('./one-word');const {PairRooms}=require('./pair-rooms');const {Suspicions}=require('./suspicions');
const clean=(s,max=80)=>typeof s==='string'?s.trim().slice(0,max):'';
const normalized=s=>clean(s).normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ');
const shuffle=items=>{const a=[...items];for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
class Game {
 constructor({now=Date.now,voteMs=30000,profileSecret=process.env.SPY_PROFILE_SECRET||''}={}){this.rooms=new Map();this.sessions=new Map();this.now=now;this.voteMs=voteMs;this.voice=new VoiceBridge(this);this.profiles=new Profiles(this,profileSecret);this.abilities=new Abilities(this);this.experiments=new Experiments(this);this.avatars=new Avatars(this);this.oneWord=new OneWord(this);this.pairs=new PairRooms(this);this.suspicions=new Suspicions(this);}
 session(){const token=randomBytes(24).toString('hex');const s={token,id:randomBytes(8).toString('hex'),room:null,connected:false,lastSeen:this.now()};this.sessions.set(token,s);return s;}
 need(ok,message){if(!ok)throw Error(message);}
 room(s){const r=this.rooms.get(s.room);this.need(r,'Лобби уже закрыто. Создайте новое.');return r;}
 canTest(s){return this.profiles.read(s?.discord?.credential)?.name.toLowerCase()==='aqr1337';}
 updateTestAccess(s){const r=this.rooms.get(s.room);if(r?.testMode&&r.hostId===s.id&&['waiting','ended'].includes(r.phase)&&!this.canTest(s)){r.testMode=false;r.players=r.players.filter(p=>!p.simulated);const owner=r.players.find(p=>p.id===s.id);if(owner)owner.host=true;}}
 players(r){return r.players.filter(p=>!p.host);}
 alive(r){return this.players(r).filter(p=>p.alive);}
 isSpy(r,id){return (r.spyIds||[r.spyId]).includes(id);}
 checkVictory(r){if(this.experiments.cooperative(r)){if(!this.alive(r).length){this.finish(r,'cancelled','Все игроки покинули раунд.');return true;}return false;}const alive=this.alive(r),spies=alive.filter(p=>this.isSpy(r,p.id)).length;if(!spies){this.finish(r,'civilians','Все шпионы выбыли.');return true;}if(spies>=alive.length-spies){this.finish(r,'spy','Шпионов осталось не меньше, чем мирных.');return true;}return false;}
 finish(r,winner,reason){r.pairEvent=null;r.suspicionDossier=null;r.phase='ended';r.result={id:r.roundId,winner,reason,word:r.word,spyId:r.spyId,spyIds:[...(r.spyIds||[r.spyId])].filter(Boolean)};r.vote=null;this.abilities.finish(r);this.experiments.finish(r);}
 modulation(r){return r.modulation||{countdown:true,animations:true,dossier:true};}
 beginCountdown(r){r.selectionEndsAt=this.modulation(r).countdown?this.now()+5000:null;r.phase=r.selectionEndsAt?'selecting':'playing';}
 maybeResolve(r){if(!r.vote)return;const votes=Object.values(r.vote.ballots),remaining=r.vote.eligible.length-votes.length,threshold=Math.floor(r.vote.eligible.length/2)+1,tally={};for(const id of votes)if(id)tally[id]=(tally[id]||0)+1;const best=Math.max(0,...Object.values(tally));if(best>=threshold||best+remaining<threshold)this.resolve(r);}
 dealTo(r){return r.order.find(id=>r.players.some(p=>p.id===id&&p.alive&&!p.ready));}
 selectFirst(r){if(this.pairs.enabled(r)&&!r.commonGroundDone){r.commonGroundDone=true;try{this.pairs.begin(r,{kind:'common',resume:'selecting'});return;}catch(e){r.notice=e.message;}}this.beginCountdown(r);}
 next(r){if(r.phase==='pair-rooms'||r.phase==='suspicions')return;const cycle=r.cycle;if(r.phase==='one-word'){this.oneWord.advance(r);this.experiments.observe(r);return;}this.abilities.next(r);if(r.cycle>cycle)this.suspicions.reveal(r,cycle);this.experiments.observe(r);}
 resolve(r){
  if(!r.vote)return;const tally={};for(const id of Object.values(r.vote.ballots))if(id)tally[id]=(tally[id]||0)+1;
  const threshold=Math.floor(r.vote.eligible.length/2)+1,target=Object.keys(tally).find(id=>tally[id]>=threshold);
  r.vote=null;r.phase='playing';
  if(!target){r.notice='Большинство не набрано. Никто не выбывает.';this.experiments.observe(r);return;}
  const p=r.players.find(p=>p.id===target);p.alive=false;this.abilities.prune(r);r.notice=p.name+' выбывает. Раунд продолжается.';
  if(this.checkVictory(r))return;if(r.current===target)this.next(r);this.experiments.observe(r);
 }
 leave(s){
  const r=this.rooms.get(s.room);s.room=null;if(!r)return;
  if(r.hostId===s.id){for(const p of r.players){const peer=[...this.sessions.values()].find(x=>x.id===p.id);if(peer)peer.room=null;}this.rooms.delete(r.code);return;}
  const p=r.players.find(x=>x.id===s.id);
  if(r.phase==='waiting'||r.phase==='ended'){r.players=r.players.filter(x=>x.id!==s.id);return;}
  if(!p)return;p.connected=false;p.alive=false;this.abilities.prune(r);if(this.checkVictory(r))return;
  if(r.vote){r.vote.eligible=r.vote.eligible.filter(id=>id!==s.id);delete r.vote.ballots[s.id];for(const voter in r.vote.ballots)if(r.vote.ballots[voter]===s.id)delete r.vote.ballots[voter];}
  if(r.phase==='guessing'&&r.guesserId===s.id){r.phase='playing';r.guesserId=null;r.guess='';}
  if(r.current===s.id)this.next(r);if(r.phase==='reveal'&&this.alive(r).every(p=>p.ready))this.selectFirst(r);this.maybeResolve(r);this.experiments.observe(r);
 }
 connection(s,online){s.connected=online;s.lastSeen=this.now();const r=this.rooms.get(s.room);if(r){const p=r.players.find(p=>p.id===s.id);if(p)p.connected=online;}}
 tick(){this.avatars.prune();this.voice.tick();this.profiles.tick();for(const s of this.sessions.values()){if(!s.connected&&this.now()-s.lastSeen>90000&&s.room)this.leave(s);if(!s.connected&&!s.room&&this.now()-s.lastSeen>3600000)this.sessions.delete(s.token);}for(const r of this.rooms.values()){this.abilities.tick(r);this.maybeResolve(r);this.pairs.tick(r);this.suspicions.check(r);if(r.vote&&r.vote.endsAt<=this.now())this.resolve(r);if(r.phase==='selecting'&&r.selectionEndsAt<=this.now())r.phase='playing';this.experiments.tick(r);}}
 act(s,action,d={}){try{return this.action(s,action,d);}finally{const r=this.rooms.get(s.room);if(r)this.experiments.observe(r);}}
 action(s,action,d={}){
  s.lastSeen=this.now();
  if(action==='profileAvatar'){this.avatars.set(s,d.avatar);return;}
  if(action==='profileCode'){this.profiles.invite(s);return;}
  if(action==='profileCancel'){this.profiles.cancel(s);return;}
  if(action==='profileForget'){this.profiles.forget(s);return;}
  if(action==='profileRestore'){this.profiles.restore(s,d.credential);return;}
  if(action==='leave'){this.leave(s);return;}
  if(action==='create'||action==='join'){
   this.need(!s.room,'Сначала выйдите из текущего лобби.');const name=clean(d.name,20);this.need(name,'Введите имя.');let r;
   if(action==='create'){let code;do{code=randomBytes(4).toString('hex').slice(0,5).toUpperCase();}while(this.rooms.has(code));r={code,hostId:s.id,players:[],phase:'waiting',round:0,notice:''};this.rooms.set(code,r);}else{r=this.rooms.get(clean(d.code,5).toUpperCase());this.need(r,'Лобби не найдено.');this.need(r.phase==='waiting','Раунд уже начался. Дождитесь нового.');this.need(!r.testMode,'Это одиночное тестовое лобби.');this.need(r.players.length<13,'В лобби уже 12 игроков.');}
   this.need(!r.players.some(p=>normalized(p.name)===normalized(name)),'Это имя уже занято.');r.players.push({id:s.id,name,avatar:s.avatar||'',host:r.hostId===s.id,alive:true,ready:false,connected:s.connected});s.room=r.code;return;
  }
  const r=this.room(s),p=r.players.find(p=>p.id===s.id),host=r.hostId===s.id;
  this.need(p,'Вы не участник лобби.');
  if(action==='modulationSettings'){this.need(host&&r.phase==='waiting','Настройки меняет ведущий до старта.');this.need(['countdown','animations','dossier'].every(k=>typeof d[k]==='boolean'),'Некорректные настройки.');r.modulation={countdown:d.countdown,animations:d.animations,dossier:d.dossier};return;}
  if(action==='experimentSettings'){this.need(host&&r.phase==='waiting','Эксперименты настраивает ведущий до старта.');this.experiments.configure(r,d);return;}
  if(action==='pairAbort'){this.need(host&&r.phase==='pair-rooms','Завершить событие может ведущий.');this.finish(r,'cancelled','Ведущий завершил парный разговор. Бот возвращает участников.');return;}
  if(action==='suspect'){this.suspicions.choose(r,s,d.targetId);return;}
  if(action==='suspicionsRead'){this.suspicions.acknowledge(r,s);return;}
  if(action==='dossierReveal'){this.experiments.reveal(r,s);return;}
  if(action==='testMode'){this.need(host&&r.phase==='waiting','Режим выбирает ведущий до старта.');this.need(this.canTest(s),'Тестовый режим доступен только Discord-профилю aqr1337.');this.need(typeof d.enabled==='boolean','Некорректный режим.');this.need(r.players.length===1,'Для теста создайте лобби без других игроков.');this.need(!d.enabled||(!this.experiments.cooperative(r)&&!this.experiments.settings(r).multiSpy),'Выключите совместный режим и несколько шпионов перед тестом.');r.testMode=d.enabled;p.host=!d.enabled;if(d.enabled){this.experiments.enable(r);this.voice.configure(r,{enabled:true,radius:0});}return;}
  if(action==='testStop'||action==='testVoteEnd'){this.need(host&&r.testMode&&this.canTest(s),'Тестовые действия недоступны.');this.need(!['waiting','ended'].includes(r.phase),'Тест ещё не запущен.');if(action==='testVoteEnd'){this.need(r.phase==='voting','Голосование не запущено.');this.resolve(r);}else this.finish(r,'civilians','Тест завершён. Микрофоны восстанавливаются.');return;}
  if(action==='abilitySettings'){this.need(host&&r.phase==='waiting','Способности настраивает ведущий до старта.');this.need(!d.enabled||!this.experiments.cooperative(r),'Способности отключены в совместном режиме.');this.abilities.configure(r,d);return;}
  if(['oneWordType','oneWordSubmit'].includes(action)){this.oneWord.action(r,s,action,d);return;}
  if(action==='abilityUse'){this.abilities.use(r,s,d);return;}
  if(action==='testAbility'){this.abilities.test(r,s,d.id);return;}
  if(action==='voiceSettings'){this.need(host&&r.phase==='waiting','Настройки доступны ведущему до старта.');this.need(!r.testMode||d.enabled,'Для теста оставьте управление микрофонами включённым.');this.need(d.enabled||(!this.abilities.needsDiscord(r)&&!this.pairs.enabled(r)),'Сначала выключите способности, которым нужен Discord.');this.need(!d.enabled||!this.experiments.cooperative(r),'Микрофоны Discord отключены в совместном режиме.');this.voice.configure(r,d);if(d.enabled)this.experiments.enable(r);return;}
  if(action==='voiceCode'){this.need(r.phase==='waiting','Привязка доступна до старта.');this.voice.invite(r,s);return;}
  if(action==='voiceDisconnect'){this.need(host,'Только ведущий отключает бота.');const link=this.voice.links.get(r.code);if(link)this.voice.disconnect(link.token);return;}
  if(action==='start'){
   this.need(host&&r.phase==='waiting','Только ведущий может начать раунд.');if(r.testMode){this.need(this.canTest(s),'Тестовый режим доступен только Discord-профилю aqr1337.');this.need(r.players.length===1&&r.players[0].id===s.id,'В тестовом лобби должен быть только один игрок.');this.need(this.voice.settings(r).enabled,'Включите управление микрофонами.');}else this.need(this.players(r).length>=3,'Нужны минимум 3 игрока и ведущий.');this.need(r.players.every(p=>p.connected),'Дождитесь подключения всех игроков.');
   this.experiments.ready(r);this.abilities.ready(r);this.voice.ready(r);const word=clean(d.word)||(r.testMode?'маяк':''),theme=clean(d.theme)||(r.testMode?'Море':''),hint=clean(d.hint,140)||(r.testMode?'Светит в темноте':'');const coop=this.experiments.cooperative(r);this.need(word&&theme&&(coop||hint),'Укажите слово, тему и подсказку.');const players=this.players(r);const spy=coop?null:r.testMode?s.id:d.spyId==='random'?players[randomInt(players.length)].id:d.spyId;this.need(coop||players.some(p=>p.id===spy),'Выберите шпиона.');if(r.testMode){for(let i=1;i<=3;i++)r.players.push({id:randomBytes(8).toString('hex'),name:'Виртуальный '+i,host:false,simulated:true,alive:true,ready:true,connected:true});players.push(...r.players.filter(p=>p.simulated));}
   const count=this.experiments.settings(r).enabled&&this.experiments.settings(r).multiSpy?this.experiments.settings(r).spyCount:1,spyIds=coop?[]:[spy,...shuffle(players.filter(p=>p.id!==spy).map(p=>p.id)).slice(0,count-1)];
   Object.assign(r,{word,theme,hint,spyId:spy,spyIds,guesserId:null,phase:'reveal',round:r.round+1,roundId:randomBytes(12).toString('hex'),order:shuffle(players.map(p=>p.id)),cycle:1,vote:null,guess:'',result:null,notice:''});r.first=r.testMode?s.id:r.order[randomInt(r.order.length)];r.current=r.first;r.selectionEndsAt=null;for(const x of players){x.alive=true;x.ready=!!x.simulated;}this.experiments.begin(r);this.abilities.begin(r);this.suspicions.begin(r);r.commonGroundDone=false;r.pairEvent=null;return;
  }
  if(action==='ready'){this.need((!host||r.testMode)&&r.phase==='reveal','Сейчас нельзя подтвердить роль.');this.need(p.alive&&!p.ready,'Роль уже подтверждена.');this.experiments.canReady(r,s);p.ready=true;if(this.alive(r).every(p=>p.ready)){this.selectFirst(r);r.notice='';}return;}
  if(action==='next'){this.need(r.phase==='playing'&&(host||(p.alive&&r.current===p.id)),'Сейчас не ваш ход.');this.next(r);return;}
  if(action==='voteStart'){this.need(!this.experiments.cooperative(r),'В совместном режиме нет голосования.');this.need((!host||r.testMode)&&p.alive&&r.phase==='playing','Голосование сейчас недоступно.');r.phase='voting';r.vote={endsAt:this.now()+this.voteMs,eligible:this.alive(r).filter(p=>!p.simulated).map(p=>p.id),ballots:{},initiator:p.name};r.notice='';return;}
  if(action==='vote'){this.need(r.phase==='voting'&&r.vote&&r.vote.eligible.includes(p.id)&&p.alive&&(!host||r.testMode),'Вы не можете голосовать.');this.need(!Object.hasOwn(r.vote.ballots,p.id),'Ваш голос уже учтён.');const target=d.targetId;this.need(target===null||this.alive(r).some(p=>p.id===target),'Игрок недоступен.');r.vote.ballots[p.id]=target;this.maybeResolve(r);return;}
  if(action==='guessStart'){
   const coop=this.experiments.cooperative(r);this.need(p.alive&&(coop?r.phase==='playing'&&r.current===p.id:(!host||r.testMode)&&this.isSpy(r,p.id)&&['playing','voting'].includes(r.phase)),'Сейчас нельзя угадывать слово.');
   r.phase='guessing';r.vote=null;r.guess='';r.guesserId=p.id;return;
  }
  if(action==='guessType'){this.need(p.id===r.guesserId&&p.alive&&r.phase==='guessing','Сейчас нельзя вводить догадку.');r.guess=typeof d.text==='string'?d.text.slice(0,80):'';return;}
  if(action==='guessSubmit'){
   this.need(p.id===r.guesserId&&p.alive&&r.phase==='guessing','Сейчас нельзя отправить догадку.');const guess=clean(d.text);this.need(guess,'Введите слово.');r.guess=guess;
   const correct=normalized(guess)===normalized(r.word);
   if(this.experiments.cooperative(r)){if(correct)this.finish(r,'team','Команда угадала секретное слово.');else{r.phase='playing';r.guesserId=null;r.notice='Ответ неверный. Следующий игрок задаёт вопросы.';this.next(r);}return;}
   this.finish(r,correct?'spy':'civilians',correct?'Шпионы угадали секретное слово.':'Шпион ошибся. Мирные победили.');return;
  }
  if(action==='reset'){this.need(host&&r.phase==='ended','Новый раунд открывает ведущий.');r.players=r.players.filter(p=>!p.simulated&&(p.host||p.connected));r.phase='waiting';r.word='';r.hint='';r.theme='';r.spyId=null;r.spyIds=[];r.guesserId=null;r.dossierReveals={};r.vote=null;r.result=null;r.guess='';r.order=[];r.notice='';this.abilities.clear(r);this.experiments.finish(r);for(const x of r.players){x.alive=true;x.ready=false;}return;}
  throw Error('Неизвестное действие.');
 }
 list(){return [...this.rooms.values()].filter(r=>!r.testMode).map(r=>{const host=r.players.find(p=>p.id===r.hostId);const playerCount=this.players(r).length;return {code:r.code,hostName:host?.name||'',playerCount,maxPlayers:12,phase:r.phase,hostOnline:!!host?.connected,joinable:r.phase==='waiting'&&playerCount<12&&!!host?.connected};}).sort((a,b)=>Number(b.joinable)-Number(a.joinable)||a.code.localeCompare(b.code));}
 view(s){const serverTime=this.now(),r=this.rooms.get(s.room);if(!r)return {serverTime,me:s.id,avatar:s.avatar||'',discord:this.profiles.view(s),room:null,lobbies:this.list()};const host=r.hostId===s.id&&!r.testMode,spy=this.isSpy(r,s.id),ended=r.phase==='ended';return {serverTime,me:s.id,avatar:s.avatar||'',discord:this.profiles.view(s),room:{modulation:this.modulation(r),pairEvent:this.pairs.view(r),suspicions:this.suspicions.view(r,s),oneWord:this.oneWord.view(r),...this.abilities.view(r,s),experiments:this.experiments.view(r),dossier:this.experiments.dossier(r,s),guesserId:r.guesserId||null,testMode:!!r.testMode,canTest:r.hostId===s.id&&this.canTest(s),voice:this.voice.view(r,s),code:r.code,phase:r.phase,round:r.round,roundId:r.roundId,players:r.players.map(p=>({...p})),hostId:r.hostId,theme:r.theme||'',hint:host||(spy&&r.first===s.id)||ended?r.hint||'':null,word:host||ended||this.experiments.wordVisible(r,s)?r.word||'':null,role:host?'host':r.phase==='waiting'?null:this.experiments.cooperative(r)?'cooperative':spy?'spy':'civilian',spyId:host||ended?r.spyId:null,spyIds:host||ended||(spy&&this.experiments.settings(r).spiesKnowEachOther)?[...(r.spyIds||[r.spyId])].filter(Boolean):null,order:r.order||[],dealTo:r.phase==='reveal'&&!host&&!r.players.find(p=>p.id===s.id)?.ready?s.id:null,selectionEndsAt:r.selectionEndsAt,current:['reveal','ability-draw'].includes(r.phase)?null:r.current,cycle:r.cycle,notice:r.notice,guess:r.phase==='guessing'||ended?r.guess:null,vote:r.vote?{endsAt:r.vote.endsAt,total:r.vote.eligible.length,count:Object.keys(r.vote.ballots).length,required:Math.floor(r.vote.eligible.length/2)+1,voted:Object.hasOwn(r.vote.ballots,s.id),myVote:r.vote.ballots[s.id],initiator:r.vote.initiator}:null,result:r.result||null}};}
}
module.exports={Game,normalized};
