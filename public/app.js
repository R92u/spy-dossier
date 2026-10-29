'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={room:null},token='',source,online=false,signature='',roleViewed=false,lastRound='',lastPhase='',autoDossier='',overlayKey='',toastTimer;
let profile={name:'',played:0,wins:0,results:[]};try{const p=JSON.parse(localStorage.getItem('dossier-profile')||'null');if(p&&typeof p==='object'){profile.name=typeof p.name==='string'?p.name.slice(0,20):'';profile.played=Number.isSafeInteger(p.played)?Math.max(0,p.played):0;profile.wins=Number.isSafeInteger(p.wins)?Math.max(0,p.wins):0;profile.results=Array.isArray(p.results)?p.results.slice(-100):[];}}catch{}
let discordCredential='';try{discordCredential=localStorage.getItem('dossier-discord')||'';}catch{}
let draft={word:'',theme:'',hint:'',spyId:'random'},guessDraft='',joinCode='';
function toast(message){const target=$('settings-dialog')?.open?$('settings-toast'):$('toast');if(!target)return;[$('toast'),$('settings-toast')].forEach(node=>node?.classList.remove('show'));target.textContent=message;target.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>target.classList.remove('show'),4500);}
function save(){try{localStorage.setItem('dossier-profile',JSON.stringify(profile));}catch{toast('Хранилище браузера недоступно. Прогресс сохранится только до закрытия страницы.');}}
async function request(path,body){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.error||'Ошибка сервера');return data;}
async function act(action,data={}){if(!online)return toast('Нет связи с сервером. Подождите подключения.');try{await request('/api/action',{token,action,data});}catch(e){toast(e.message);}}
const button=(label,action,style='secondary',attrs='')=>`<button class="btn ${style}" data-action="${action}" ${attrs}>${label}</button>`;
function discordProfile(){
 const d=state.discord||{};
 return `<section class="discord-profile" aria-label="Профиль Discord"><div class="panel-heading"><h2>Профиль</h2><span class="badge">DISCORD</span></div>${d.name?`<div class="discord-account"><span class="avatar">${esc(d.name[0])}</span><div><strong>${esc(d.name)}</strong><small>Сохранён в этом браузере</small></div><span class="dot online"></span></div><p class="field-note">В новых лобби подключится автоматически.</p>${button('Отвязать Discord','profileForget','ghost small')}`:`<p class="field-note">Привяжите свой Discord один раз для всех лобби.</p>${d.available?button('Привязать Discord','profileCode','secondary wide'):'<p class="field-note">Привязка профиля временно недоступна.</p>'}`}${d.code?`<div class="profile-pairing"><p class="field-note">Отправьте боту со своего Discord-аккаунта. Код действует 10 минут; заходить в войс не нужно.</p><input class="voice-code" aria-label="Команда привязки профиля" readonly value="~spy_link ${esc(d.code)}">${button('Копировать команду','profileCopy','secondary small')}${button('Отмена','profileCancel','ghost small')}<p class="field-note">Ожидаем подтверждение от бота…</p></div>`:''}</section>`;
}
function acceptState(next){
 const {serverTime,...view}=next;syncGameClock(serverTime);
 state=view;syncSettings();const credential=next.discord?.credential||'';
 if(next.discord?.available&&credential!==discordCredential){discordCredential=credential;try{if(credential)localStorage.setItem('dossier-discord',credential);else localStorage.removeItem('dossier-discord');}catch{toast('Discord привязан до закрытия страницы: хранилище браузера недоступно.');}}
}
function home(){return `<section class="home"><div class="panel home-surface"><header class="home-heading"><h1>Играть</h1></header><div class="home-columns"><div class="entry home-play"><label for="name">Имя</label><input id="name" maxlength="20" placeholder="Введите имя" value="${esc(profile.name)}" autocomplete="nickname">${button('Создать лобби','create','primary wide')}<div class="divider">или</div><label for="code">Код лобби</label><div class="join"><input id="code" maxlength="5" value="${esc(joinCode)}" placeholder="XXXXX" autocomplete="off" spellcheck="false">${button('Войти →','join')}</div><div class="local-stats"><span><b>${profile.played}</b> партий</span><span><b>${profile.wins}</b> побед</span></div></div><div class="home-lobbies">${lobbyBrowser()}</div></div></div></section>`;}
function lobbyBrowser(){const lobbies=state.lobbies||[];return `<section class="panel lobby-browser" aria-label="Активные лобби"><div class="panel-heading"><h2>Активные лобби</h2><span class="badge">${lobbies.length}</span></div><div class="lobby-list">${lobbies.length?lobbies.map(l=>{const status=!l.hostOnline?'Ведущий не в сети':l.phase==='waiting'?(l.playerCount>=l.maxPlayers?'Мест нет':'Ожидание'):l.phase==='ended'?'Раунд завершён':'Идёт игра';return `<article class="lobby-row"><div class="lobby-details"><strong class="lobby-code">${esc(l.code)}</strong><span class="lobby-host">${esc(l.hostName)}</span><small>${l.playerCount} / ${l.maxPlayers} игроков · ${status}</small></div>${button('Войти','joinListed','secondary small',`data-code="${esc(l.code)}" aria-label="Войти в лобби ${esc(l.code)}" ${l.joinable?'':'disabled'}`)}</article>`;}).join(''):'<p class="muted lobby-empty">Нет активных лобби</p>'}</div></section>`;}
function playersList(r){return r.players.map(p=>`<div class="roster-row"><span class="avatar">${esc(p.name[0])}</span><div><b>${esc(p.name)}</b><small>${p.host?'Ведущий':p.id===state.me?'Это вы':'Игрок'}${!p.connected?' · переподключается':''}</small></div><span class="dot ${p.connected?'online':''}"></span></div>`).join('');}

function voiceSettings(r){
 const v=r.voice||{},host=r.hostId===state.me;
 return '<section class="voice-settings">'+(host?'<label class="switch-row"><span>Микрофоны Discord <small>Управление голосовым каналом</small></span><input id="voice-enabled" type="checkbox" role="switch" '+(v.enabled?'checked':'')+' '+(r.testMode||(r.abilities?.enabled&&r.abilities.pool.includes('silence'))?'disabled':'')+'></label>':'')+(v.enabled?'<div class="voice-details">'+(host?'<label for="whisper-radius">Перешёптывания <output id="whisper-value">'+v.radius+'</output></label><input id="whisper-radius" type="range" min="0" max="6" step="1" value="'+v.radius+'"><p class="field-note">Соседей с каждой стороны; 0 — говорит только текущий игрок. Выбывших пропускаем.</p>':'<h3>Микрофоны Discord</h3>')+'<p class="field-note">'+(v.connected?esc(v.channelName)+' · '+(v.online?'бот на связи':'бот не в сети'):'Голосовой канал ещё не привязан')+'</p><p class="field-note">Discord привязан: '+v.linkedPlayers.length+' / '+r.players.length+'</p>'+(v.error?'<p class="accent">'+esc(v.error)+'</p>':'')+(v.conflict?'<p class="accent">Этот Discord уже занимает другое место в лобби. Каждому игроку нужен свой аккаунт.</p>':v.linked?'<p class="success">Ваш Discord подключён</p>':state.discord?.name?'<p class="field-note">Ваш Discord сохранён. Ожидаем подключения канала ведущим.</p>':'<p class="field-note">Привяжите Discord в настройках профиля.</p>')+(host&&!v.connected?button('Подключить голосовой канал','voiceCode','secondary wide'):'')+(v.code?'<p class="field-note">Находясь в нужном войсе, отправьте боту эту команду:</p><input class="voice-code" aria-label="Код привязки Discord" readonly value="~'+(host?'spy_connect':'spy_join')+' '+esc(v.code)+'">'+button('Копировать команду','voiceCopy','ghost small'):'')+(host&&v.connected?button('Отключить бота','voiceDisconnect','ghost wide'):'')+'</div>':'')+'</section>';
}

function testToggle(r){return r.canTest?'<section class="voice-settings"><label class="switch-row"><span>Тестовый режим <small>Одиночная проверка Discord</small></span><input id="test-mode" type="checkbox" role="switch" '+(r.testMode?'checked':'')+' '+(r.experiments?.cooperative||r.experiments?.multiSpy?'disabled':'')+'></label>'+(r.testMode?'<p class="field-note">Вы — шпион. За столом ещё 3 виртуальных игрока; ходы переключаете сами. Статистика не меняется.</p>':'')+'</section>':'';}
function testControls(r){if(!r.testMode)return '';const v=r.voice||{};return `<section class="test-controls" aria-label="Проверка Discord"><div><strong>Тест Discord</strong><small>${v.online?'Бот на связи':'Бот не в сети'} · ${v.expected==='muted'?'Микрофон должен быть выключен':v.expected==='open'?'Микрофон должен быть доступен':'Ожидаем канал'}</small>${v.error?`<small class="accent">${esc(v.error)}</small>`:''}</div><div>${r.phase==='voting'?button('Закончить голосование','testVoteEnd','secondary small'):''}${button('Завершить тест','testStop','ghost small')}</div></section>`;}
function waiting(r){const host=r.hostId===state.me,players=r.players.filter(p=>!p.host);return `<div class="page-title"><div><h1>Лобби</h1></div><div class="code-card"><span class="tiny">КОД ЛОББИ</span><strong>${esc(r.code)}</strong>${button('Копировать','copy','ghost small')}</div></div><div class="lobby-grid"><section class="panel"><div class="panel-heading"><h2>Игроки</h2><span class="badge">${players.length} / 12 игроков</span></div>${playersList(r)}<p class="field-note">${r.testMode?'Для теста достаточно вас одного.':'Минимум 3 игрока для старта.'}</p><button class="btn ghost wide" data-open-settings>Профиль Discord${state.discord?.name?' · '+esc(state.discord.name):''}</button></section><section class="panel settings">${host?`<h2>${r.testMode?'Настройки теста':'Настройки раунда'}</h2>${testToggle(r)}<label for="word">Секретное слово</label><input id="word" maxlength="80" value="${esc(draft.word||(r.testMode?'маяк':''))}" placeholder="Например, маяк" autocomplete="off"><div class="two-fields"><div><label for="theme">Тема</label><input id="theme" maxlength="80" value="${esc(draft.theme||(r.testMode?'Море':''))}" placeholder="Море"></div>${r.experiments?.cooperative?'':`<div><label for="hint">Подсказка шпиону</label><input id="hint" maxlength="140" value="${esc(draft.hint||(r.testMode?'Светит в темноте':''))}" placeholder="Помогает найти путь"></div>`}</div>${r.testMode||r.experiments?.cooperative?'':`<label for="spyId">${r.experiments?.multiSpy?'Первый шпион · остальные случайно':'Кто будет шпионом?'}</label><select id="spyId"><option value="random">Случайный игрок</option>${players.map(p=>`<option value="${p.id}" ${draft.spyId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select>`}${experimentSettings(r)}${r.experiments?.cooperative?'':abilitySettings(r)}${button(r.testMode?'Начать тест →':'Начать раунд →','start','primary wide',(r.testMode?!(r.voice.online&&r.voice.linked):players.length<Math.max(3,r.experiments?.multiSpy?r.experiments.spyCount*2+1:3))?'disabled':'')}`:`<h2>Ожидание ведущего</h2>${experimentSettings(r)}${r.experiments?.cooperative?'':abilitySettings(r)}`}</section></div>`;}
function privateCard(r){const host=r.role==='host';return `<section class="panel role-card"><div class="panel-heading"><span class="badge">${host?'НАБЛЮДАТЕЛЬ':'СКРЫТО'}</span></div>${host?`<h2>Секретное слово</h2><div class="secret-word">${esc(r.word)}</div><div class="intel"><span>ТЕМА</span><b>${esc(r.theme)}</b></div><div class="intel"><span>ПОДСКАЗКА ШПИОНУ</span><b>${esc(r.hint)}</b></div>${r.experiments?.cooperative?'':`<div class="intel"><span>ШПИОНЫ</span><b>${r.players.filter(p=>(r.spyIds||[r.spyId]).includes(p.id)).map(p=>esc(p.name)).join(', ')}</b></div>`}`:`<h2>Ваша роль</h2>${button('Открыть досье','role','ghost wide','id="role-button" aria-haspopup="dialog"')}`}${r.phase==='reveal'&&!host&&!r.players.find(p=>p.id===state.me)?.ready?button('Готов →','ready','primary wide',roleViewed&&dossierCanReady(r)?'':'disabled'):''}</section>`;}
function openDossier(){
 const r=state.room;if(!r||r.role==='host'||!['reveal','playing'].includes(r.phase)||(r.phase==='reveal'&&r.dealTo!==state.me&&!r.players.find(p=>p.id===state.me)?.ready))return;
 const spy=r.role==='spy',ready=r.phase==='reveal'&&!r.players.find(p=>p.id===state.me)?.ready;

 $('dossier').innerHTML=`<button class="dossier-close" type="button" data-dossier-close aria-label="Закрыть досье" autofocus>×</button><div class="dossier-stage"><div class="dossier-folder"><article inert class="dossier-paper ${spy?'is-spy':''}"><div class="dossier-heading"><span class="dossier-label">ДОСЬЕ</span><span class="dossier-round">РАУНД ${r.round}</span></div><h2 class="dossier-role">${spy?'Шпион':r.role==='cooperative'?'Команда':'Мирный'}</h2>${dossierWord(r)}${dossierAllies(r)}<div class="dossier-intel"><span>ТЕМА</span><b>${esc(r.theme)}</b></div>${spy&&r.hint?`<div class="dossier-intel"><span>ПОДСКАЗКА</span><b>${esc(r.hint)}</b></div>`:''}<div class="dossier-ability">${abilityControl(r,'dossier')}</div><button class="btn dossier-return" type="button" ${ready?'data-dossier-ready':'data-dossier-close'}>${ready?'Готов →':'К столу →'}</button></article><div class="dossier-cover"><span class="folder-label">ЛИЧНОЕ ДЕЛО / ${String(r.round).padStart(3,'0')}</span><span class="folder-stamp">СОВЕРШЕННО СЕКРЕТНО</span><div class="folder-identity"><div class="folder-portrait"><i></i><b></b><span>?</span></div><div class="folder-lines"><i></i><i></i><i></i></div></div><button class="btn folder-open" data-dossier-open>Открыть досье →</button></div></div></div>`;
 resetDossierTimers();document.body.classList.add('dossier-open');$('dossier').showModal();$('dossier').scrollTop=0;syncDossierState(r);
}
function closeDossier(){
 resetDossierTimers();if(!$('dossier').open)return;
 $('dossier').close();$('dossier').replaceChildren();document.body.classList.remove('dossier-open');$('role-button')?.focus();
}
$('dossier').addEventListener('cancel',e=>{e.preventDefault();closeDossier();});
$('dossier').addEventListener('click',e=>{
 if(e.target.closest('[data-dossier-open]')){roleViewed=true;const folder=$('dossier').querySelector('.dossier-folder');folder.classList.add('unsealed');folder.querySelector('.dossier-cover').inert=true;folder.querySelector('.dossier-paper').inert=false;folder.querySelector('.dossier-return').focus();revealDossierWord(folder);return;}
 if(e.target.closest('[data-dossier-ready]')){if(!dossierCanReady(state.room))return;closeDossier();act('ready');}
 else if(e.target.closest('[data-dossier-close]')||e.target===$('dossier')||e.target.classList.contains('dossier-stage'))closeDossier();
});
function table(r){const ps=r.order.map(id=>r.players.find(p=>p.id===id)).filter(Boolean);return `<div class="table-wrap"><div class="table-ring"><div class="crosshair"></div>${['selecting','shuffling'].includes(r.phase)?'<div class="turn-spinner" aria-label="Выбор первого игрока"><span>➤</span></div>':''}<div class="table-center"><span class="eyebrow">${r.phase==='playing'?'КРУГ '+r.cycle:''}</span><h2>${r.phase==='reveal'?'Досье: '+esc(r.players.find(p=>p.id===r.dealTo)?.name||''):['selecting','shuffling'].includes(r.phase)?'Выбираем ход':r.phase==='voting'?'Голосование':r.phase==='guessing'?(r.experiments?.cooperative?'Общая догадка':'Шпион угадывает'):esc(r.players.find(p=>p.id===r.current)?.name||'')}</h2>${r.phase==='playing'?'<p>Сейчас ходит</p>':''}</div></div>${ps.map((p,i)=>{const a=2*Math.PI*i/ps.length-Math.PI/2;return `<div class="seat seat-${i} ${p.id===r.current&&r.phase==='playing'?'current':''} ${r.spotlight?.targetId===p.id?'spotlight':''} ${!p.alive?'eliminated':''}" data-seat="${i}"><span class="seat-number">${String(i+1).padStart(2,'0')}</span><div class="seat-avatar">${esc(p.name[0])}</div><b>${esc(p.name)}</b><small>${!p.alive?'Выбыл':!p.connected?'Нет связи':r.phase==='reveal'?(p.ready?'Готов':'Читает досье'):p.id===r.current&&r.phase==='playing'?'Его ход':p.id===state.me?'Это вы':'За столом'}</small></div>`;}).join('')}</div>`;}
function game(r){const me=r.players.find(p=>p.id===state.me),host=r.role==='host',spy=r.role==='spy',coop=!!r.experiments?.cooperative,writer=guessWriter(r);let special='';if(r.phase==='voting'){special=`<section class="panel vote-panel"><div class="panel-heading"><div><span class="eyebrow">ГОЛОСОВАНИЕ / ${esc(r.vote.initiator)}</span><h2>Выберите игрока</h2></div><span id="timer" class="timer"></span></div><p class="muted">Нужно ${r.vote.required} из ${r.vote.total} голосов. Подано ${r.vote.count}.</p><div class="vote-options">${r.players.filter(p=>!p.host&&p.alive).map(p=>button(esc(p.name),'vote','secondary '+(r.vote.myVote===p.id?'selected':''),`data-target="${p.id}" ${host||!me.alive||r.vote.voted?'disabled':''}`)).join('')}${button('Воздержаться','abstain','ghost',host||!me.alive||r.vote.voted?'disabled':'')}</div>${r.vote.voted?'<p class="success">Ваш голос учтён.</p>':''}</section>`;}if(r.phase==='guessing'){special=`<section class="panel guess-panel"><h2>${coop?'Общая догадка':'Угадывание слова'}</h2><p class="muted">${coop?'Неверный ответ передаст ход следующему игроку.':'Одна попытка на команду шпионов.'}</p><label for="guess">${writer?'Ваша догадка':coop?esc(r.players.find(p=>p.id===r.guesserId)?.name)+' сейчас пишет':'Шпион сейчас пишет'}</label><div class="animated-input"><input id="guess" maxlength="80" autocomplete="off" value="${esc(writer?guessDraft:r.guess||'')}" placeholder="${writer?'Введите секретное слово…':'Ждём первые буквы…'}" ${writer?'':'readonly'}><div class="letter-window" aria-hidden="true"><div class="letter-track"></div></div></div>${writer?button('Отправить ответ →','guessSubmit','primary wide'):''}</section>`;}
if(special)return `<div class="round-overlay"><div class="round-overlay-content">${special}${abilityControl(r)}${testControls(r)}${r.phase==='voting'&&spy&&me.alive?button('Угадать слово','guessStart','ghost wide'):''}</div></div>`;
return `${testControls(r)}<div class="page-title compact round-toolbar"><div><h1>Раунд ${r.round}</h1></div><span class="badge">${r.players.filter(p=>!p.host&&p.alive).length} В ИГРЕ</span></div><div class="game-layout"><aside class="ability-rail">${abilityControl(r)}${abilityTestPicker(r)}</aside><section class="table-section">${table(r)}${r.phase==='reveal'?`<div class="action-caption">${r.players.filter(p=>!p.host&&p.ready).length} / ${r.players.filter(p=>!p.host).length} игроков готовы</div>`:r.phase==='playing'?`<div class="actions">${host||r.testMode||me.id===r.current&&me.alive?button(host||r.testMode?'Передать ход →':'Закончить мой ход →','next','primary'):''}${!coop&&!host&&me.alive?button('Начать голосование','voteStart'):''}${(spy||coop&&r.current===state.me)&&me.alive?button(coop?'Предложить ответ':'Я знаю слово','guessStart','ghost'):''}</div>`:''}${r.phase==='voting'&&spy&&me.alive?button('Угадать слово вместо голосования','guessStart','ghost wide'):''}</section><aside class="dossier-rail">${host?`<details class="host-intel"><summary>Досье ведущего</summary>${privateCard(r)}</details>`:button('Моё досье','role','ghost',`id="role-button" ${r.phase==='selecting'||(r.phase==='reveal'&&r.dealTo!==state.me&&!me.ready)?'disabled':''}`)}${r.notice?`<div class="notice">${esc(r.notice)}</div>`:''}${!me.alive&&!host?'<div class="rule-note">Вы выбыли.</div>':''}</aside></div>${special}`;}
function end(r){const spies=r.players.filter(p=>(r.result.spyIds||[r.result.spyId]).includes(p.id)),winner=r.result.winner;return `<section class="result panel"><div class="result-symbol">${winner==='spy'?'◈':'✓'}</div><h1>${r.testMode?'Проверка завершена':winner==='cancelled'?'Раунд завершён':winner==='team'?'Команда победила!':winner==='spy'?(spies.length>1?'Шпионы победили.':'Шпион победил.'):'Мирные победили.'}</h1><p class="lead">${esc(r.result.reason)}</p><div class="answer"><span>СЕКРЕТНОЕ СЛОВО</span><strong>${esc(r.result.word)}</strong></div><p class="muted">${spies.length?(spies.length>1?'Шпионы — ':'Шпион — ')+spies.map(p=>`<b>${esc(p.name)}</b>`).join(', '):''}${r.guess?` · Ответ: «${esc(r.guess)}»`:''}</p>${r.hostId===state.me?button(r.testMode?'Повторить тест →':'Следующий раунд →','reset','primary'): '<p class="field-note">Ожидание ведущего.</p>'}</section>`;}
function render(force=false){const r=state.room;if(r?.phase!==lastPhase&&r&&!['waiting','ended'].includes(r.phase))$('settings-dialog')?.close();if(r?.roundId!==lastRound){closeDossier();lastRound=r?.roundId;roleViewed=false;autoDossier='';guessDraft='';abilityTargetOpen=false;abilityProbeDraft='';}if(!r||['waiting','ended'].includes(r.phase)||(r.phase!==lastPhase&&['voting','guessing','selecting','shuffling','ability-draw'].includes(r.phase)))closeDossier();lastPhase=r?.phase;if(r?.phase==='ended'&&r.result.winner!=='cancelled'&&!r.testMode&&r.role!=='host'&&!profile.results.includes(r.result.id)){profile.played++;if(r.result.winner==='team'||(r.role==='spy')===(r.result.winner==='spy'))profile.wins++;profile.results.push(r.result.id);profile.results=profile.results.slice(-100);save();}
 syncDossierState(r);
 const copy=JSON.parse(JSON.stringify(state));if(copy.room?.phase==='guessing')copy.room.guess='';const sig=JSON.stringify(copy);if(!force&&signature===sig){if(r?.phase==='guessing'&&!guessWriter(r)&&$('guess')){$('guess').value=r.guess||'';syncLetters($('guess'));}updateTimer();return;}signature=sig;
 const focus=document.activeElement?.id,pos=document.activeElement?.selectionStart,endPos=document.activeElement?.selectionEnd;
 const key=r&&['voting','guessing'].includes(r.phase)?r.roundId+':'+r.phase+':'+(r.vote?.endsAt||''):'';const entering=key!==overlayKey;const oldInput=!entering?document.querySelector('.animated-input'):null;overlayKey=key;
 document.body.classList.toggle('spotlight-active',!!r?.spotlight);document.body.classList.toggle('shuffling',r?.phase==='shuffling');document.body.classList.toggle('at-table',!!r&&!['waiting','ended'].includes(r.phase));document.querySelector('.top').inert=!!r&&['voting','guessing','ability-draw','shuffling'].includes(r.phase);
 $('app').innerHTML=!r?home():r.phase==='waiting'?waiting(r):r.phase==='ended'?end(r):r.phase==='ability-draw'?abilityWheel(r):game(r);$('leave').hidden=!r;
 const overlay=document.querySelector('.round-overlay');if(overlay&&entering)overlay.classList.add('arriving');
 if(oldInput&&document.querySelector('.animated-input'))document.querySelector('.animated-input').replaceWith(oldInput);
 if($('guess')){if(!guessWriter(r))$('guess').value=r.guess||'';syncLetters($('guess'));}
 document.querySelectorAll('.vote-options .btn').forEach((b,i)=>b.style.setProperty('--item-delay',Math.min(i,8)*35+'ms'));
 positionSeats(r);
 positionSpinner();
 if(r?.phase==='reveal'&&r.dealTo===state.me&&autoDossier!==r.roundId){autoDossier=r.roundId;openDossier();}
 if(focus&&$(focus)&&!$('dossier').open){ $(focus).focus();if(typeof pos==='number'&&['text','search'].includes($(focus).type))$(focus).setSelectionRange(pos,endPos??pos);}
 if(r?.phase==='guessing'&&guessWriter(r)&&!focus)$('guess').focus();syncAbilityEffects(r);syncDossierState(r);updateTimer();}

// Keep the native input for selection, caret, undo, paste and mobile keyboards.
// Only the decorative, aria-hidden letter layer is animated.
const letterStates=new WeakMap();
const graphemes=typeof Intl.Segmenter==='function'?new Intl.Segmenter('ru',{granularity:'grapheme'}):null;
const reducedLetterMotion=matchMedia('(prefers-reduced-motion: reduce)');
function animateLetter(node,frames,options){
 if(reducedLetterMotion.matches)return null;
 return node.animate(frames,{duration:170,easing:'cubic-bezier(.2,.7,.3,1)',...options});
}
function syncLetters(input){
 if(!input?.closest('.animated-input'))return;
 let current=letterStates.get(input);
 if(!current){current={nodes:[],value:'',frame:0,scroll:0};letterStates.set(input,current);}
 // Input, scrolling and server echoes share one update immediately before paint.
 if(!current.frame)current.frame=requestAnimationFrame(()=>{current.frame=0;if(input.isConnected)paintLetters(input,current);});
}
function scatterLetter(layer,rect,bounds,text){
 if(reducedLetterMotion.matches||!text.trim()||rect.right<bounds.left||rect.left>bounds.right)return;
 const x=rect.left-bounds.left,y=rect.top-bounds.top;
 // Limit simultaneous debris when a whole selection is removed or Backspace is held.
 while(layer.childElementCount>42)layer.firstElementChild.remove();
 const ghost=document.createElement('span');ghost.className='letter-dust-glyph';ghost.textContent=text;
 ghost.style.left=x+'px';ghost.style.top=y+'px';layer.append(ghost);
 const fade=animateLetter(ghost,[{opacity:.65},{opacity:0}],{duration:90});
 fade.onfinish=fade.oncancel=()=>ghost.remove();
 for(let i=0;i<5;i++){
  const particle=document.createElement('i'),size=2+Math.random()*2;
  particle.className='letter-particle';particle.style.width=particle.style.height=size+'px';
  particle.style.left=(x+rect.width*(.15+Math.random()*.7))+'px';
  particle.style.top=(y+rect.height*(.3+Math.random()*.4))+'px';layer.append(particle);
  const dx=(i-2)*9+(Math.random()-.5)*10,dy=-10-Math.random()*20;
  const animation=animateLetter(particle,[
   {opacity:0,transform:'translate(0,0) scale(1)',offset:0},
   {opacity:.95,transform:`translate(${dx*.15}px,${dy*.3}px) scale(1)`,offset:.12},
   {opacity:.7,transform:`translate(${dx*.7}px,${dy}px) scale(.75)`,offset:.55},
   {opacity:0,transform:`translate(${dx}px,${dy+22}px) scale(.25)`,offset:1}
  ],{duration:360+Math.random()*140,easing:'linear'});
  animation.onfinish=animation.oncancel=()=>particle.remove();
 }
}
function paintLetters(input,current){
 const wrapper=input.closest('.animated-input'),track=wrapper.querySelector('.letter-track');
 if(wrapper.classList.contains('composing'))return;
 if(current.value===input.value){current.scroll=input.scrollLeft;track.style.transform='translateX('+(-current.scroll)+'px)';return;}
 const previous=current.nodes;
 const chars=graphemes?Array.from(graphemes.segment(input.value),s=>s.segment):Array.from(input.value);
 // LCS keeps unchanged glyphs stable when editing the middle or replacing a selection.
 const dp=Array.from({length:previous.length+1},()=>new Uint16Array(chars.length+1));
 for(let i=previous.length-1;i>=0;i--)for(let j=chars.length-1;j>=0;j--)dp[i][j]=previous[i].textContent===chars[j]?1+dp[i+1][j+1]:Math.max(dp[i+1][j],dp[i][j+1]);
 const keep=new Map();let i=0,j=0;
 while(i<previous.length&&j<chars.length){if(previous[i].textContent===chars[j]){keep.set(j,previous[i]);i++;j++;}else if(dp[i+1][j]>=dp[i][j+1])i++;else j++;}
 // Read all visible positions before changing the DOM, including in-flight movement.
 const oldRects=new Map(previous.map(n=>[n,n.getBoundingClientRect()]));
 const windowBox=wrapper.querySelector('.letter-window'),bounds=windowBox.getBoundingClientRect();
 let particles=windowBox.querySelector('.letter-particles');
 if(!particles){particles=document.createElement('div');particles.className='letter-particles';windowBox.append(particles);}
 const retained=new Set(keep.values());
 for(const node of previous)if(!retained.has(node)){
  scatterLetter(particles,oldRects.get(node),bounds,node.textContent);node.remove();
 }
 let cursor=track.firstElementChild;
 const next=chars.map((char,index)=>{
  let node=keep.get(index);
  if(!node){node=document.createElement('span');node.className='letter';const glyph=document.createElement('span');glyph.className='letter-glyph';glyph.textContent=char;node.append(glyph);}
  // Appending a letter must not detach or restart the existing letters.
  if(node!==cursor)track.insertBefore(node,cursor);
  cursor=node.nextElementSibling;
  for(const animation of node.getAnimations())animation.cancel();
  return node;
 });
 track.style.transform='translateX('+(-input.scrollLeft)+'px)';
 const newRects=new Map(next.map(n=>[n,n.getBoundingClientRect()]));
 next.forEach((node,index)=>{
  if(!keep.has(index))animateLetter(node.firstElementChild,[{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}]);
  else {const delta=oldRects.get(node).left-newRects.get(node).left-(input.scrollLeft-current.scroll);if(Math.abs(delta)>.5)animateLetter(node,[{transform:`translateX(${delta}px)`},{transform:'translateX(0)'}],{duration:140});}
 });
 current.nodes=next;current.value=input.value;current.scroll=input.scrollLeft;
}
$('app').addEventListener('scroll',e=>{if(e.target.id==='guess')syncLetters(e.target);},true);
$('app').addEventListener('compositionstart',e=>{if(e.target.id==='guess')e.target.closest('.animated-input').classList.add('composing');});
$('app').addEventListener('compositionend',e=>{if(e.target.id==='guess'){e.target.closest('.animated-input').classList.remove('composing');syncLetters(e.target);}});

function seatOffset(r,index,box){const a=2*Math.PI*index/r.order.length-Math.PI/2,rx=Math.max(0,(box.width-90)/2),ry=Math.max(0,(box.height-110)/2);return {dx:rx*Math.cos(a),dy:ry*Math.sin(a)};}
function positionSeats(r=state.room){const table=document.querySelector('.table-wrap');if(!r?.order||!table)return;const box=table.getBoundingClientRect();document.querySelectorAll('[data-seat]').forEach((seat,i)=>{const {dx,dy}=seatOffset(r,i,box),center=r.spotlight?.targetId===r.order[i];seat.style.left=(box.width/2+(center?0:dx))+'px';seat.style.top=(box.height/2+(center?0:dy))+'px';});}
function positionSpinner(){const r=state.room,spinner=document.querySelector('.turn-spinner');if(!spinner||!r)return;const box=document.querySelector('.table-wrap').getBoundingClientRect(),{dx,dy}=seatOffset(r,r.order.indexOf(r.current),box),angle=Math.atan2(dx,-dy)*180/Math.PI;spinner.style.setProperty('--finish',(1440+(angle+360)%360)+'deg');spinner.style.animationDelay=(r.abilityShuffle?r.abilityShuffle.blackoutEndsAt-gameTime():-Math.max(0,4500-(r.selectionEndsAt-gameTime())))+'ms';}
function resizeTable(){positionSeats();positionSpinner();}
window.addEventListener('resize',resizeTable);
document.addEventListener('appearancechange',()=>{resizeTable();document.querySelectorAll('.gold-coin').forEach(coin=>coin.getAnimations().filter(a=>!('animationName' in a)).forEach(a=>a.cancel()));});
function updateTimer(){if($('timer')&&state.room?.vote)$('timer').textContent=Math.max(0,Math.ceil((state.room.vote.endsAt-gameTime())/1000))+' с';}
$('app').addEventListener('input',e=>{const {id,value}=e.target;if(id==='name'){profile.name=value.slice(0,20);save();}if(['word','theme','hint','spyId'].includes(id))draft[id]=value;if(id==='whisper-radius'&&$('whisper-value'))$('whisper-value').textContent=value;if(id==='code')joinCode=value;if(id==='guess'){guessDraft=value;syncLetters(e.target);act('guessType',{text:value});}});
$('app').addEventListener('change',e=>{if(e.target.id==='test-mode'){if(e.target.checked){draft.word=draft.word||'маяк';draft.theme=draft.theme||'Море';draft.hint=draft.hint||'Светит в темноте';}act('testMode',{enabled:e.target.checked});}if(['voice-enabled','whisper-radius'].includes(e.target.id))act('voiceSettings',{enabled:$('voice-enabled').checked,radius:Number($('whisper-radius')?.value||0)});if(e.target.id==='spyId')draft.spyId=e.target.value;});
$('app').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='code')act('join',{name:profile.name,code:$('code').value});});
document.addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const a=b.dataset.action;if(['abilityUse','abilityPick','abilityCancel','abilityTarget','abilityProbe','abilityTest'].includes(a))return;if(a==='profileCopy'){try{await navigator.clipboard.writeText('~spy_link '+state.discord.code);toast('Команда скопирована');}catch{toast('Скопируйте команду из поля.');}return;}if(a==='voiceCopy'){try{await navigator.clipboard.writeText('~'+(state.room.hostId===state.me?'spy_connect':'spy_join')+' '+state.room.voice.code);toast('Команда скопирована');}catch{toast('Скопируйте код из поля.');}return;}if(a==='joinListed'){await act('join',{name:profile.name,code:b.dataset.code});return;}if(a==='role'){openDossier();return;}if(a==='copy'){try{await navigator.clipboard.writeText(state.room.code);toast('Команда скопирована');}catch{toast('Код лобби: '+state.room.code);}return;}if(a==='create'||a==='join'){await act(a,{name:profile.name,code:$('code')?.value});return;}if(a==='start'){await act(a,draft);return;}if(a==='vote'||a==='abstain'){await act('vote',{targetId:a==='abstain'?null:b.dataset.target});return;}if(a==='guessStart')guessDraft='';if(a==='guessSubmit'){await act(a,{text:guessDraft});return;}await act(a);});
$('leave').addEventListener('click',()=>{if(confirm(state.room?.hostId===state.me?'Закрыть лобби для всех игроков?':'Выйти из лобби? В текущем раунде вы выбываете.'))act('leave');});
function connection(value){online=value;$('connection').textContent=value?'НА СВЯЗИ':'ПЕРЕПОДКЛЮЧЕНИЕ…';$('connection').classList.toggle('online',value);}
async function boot(){try{let saved;try{saved=sessionStorage.getItem('dossier-session');}catch{}const result=await request('/api/session',{token:saved,discordCredential});token=result.token;try{sessionStorage.setItem('dossier-session',token);}catch{}acceptState({serverTime:result.serverTime,me:result.me,discord:result.discord,room:result.room,lobbies:result.lobbies||[]});render();source=new EventSource('/events?token='+encodeURIComponent(token));source.onopen=()=>connection(true);source.onmessage=e=>{acceptState(JSON.parse(e.data));connection(true);render();};source.onerror=()=>connection(false);}catch(e){$('app').innerHTML='<div class="panel loading">Не удалось подключиться. Обновите страницу, чтобы попробовать снова.</div>';toast(e.message);}}
boot();
