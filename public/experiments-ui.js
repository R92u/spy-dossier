'use strict';
let experimentMicDraft=null;
function experimentValues(r){
 const e=r.experiments||{},maxSpies=Math.max(1,Math.min(5,Number(e.maxSpies)||1));
 return {suspicions:!!e.suspicions,commonGround:!!e.commonGround,enabled:!!e.enabled,flashWord:!!e.flashWord,multiSpy:!!e.multiSpy,spyCount:Math.max(2,Math.min(5,Number(e.spyCount)||2)),spiesKnowEachOther:!!e.spiesKnowEachOther,cooperative:!!e.cooperative,micChaos:!!e.micChaos,micChance:Math.max(1,Math.min(100,Number(e.micChance)||10)),maxSpies};
}
function experimentSwitch(id,label,note,checked,disabled=false){
 return `<label class="switch-row experiment-switch"><span>${label}${note?`<small>${note}</small>`:''}</span><input id="experiment-${id}" type="checkbox" role="switch" ${checked?'checked':''} ${disabled?'disabled':''}></label>`;
}
function experimentSettings(r){
 const e=experimentValues(r),host=r.hostId===state.me,locked=r.phase!=='waiting';
 const needsVoice=!!r.testMode||!!(r.abilities?.enabled&&r.abilities.pool?.some(id=>['silence','oneword','cross'].includes(id)));
 const masterNote=r.testMode?'Нужна для одиночного теста.':needsVoice?'Сначала отключите способности, которым нужен Discord.':'';
 if(!host){
  const summary=e.cooperative?['Все за одно — угадываем слово одной командой.']:e.enabled?[
   e.suspicions?'Ставки сделаны — досье подозрений в конце круга.':'',
   e.commonGround?'Общий знаменатель — парные комнаты после досье.':'',
   e.flashWord?'Спец игра — слово видно один раз, 1 секунду.':'',
   e.multiSpy?`Шпионов: ${e.spyCount} · ${e.spiesKnowEachOther?'знают друг друга':'не знают друг друга'}.`:'',
   e.micChaos?`Проблемы с микрофоном — ${e.micChance}% каждую секунду со 2-й секунды хода.`:''
  ].filter(Boolean):[];
  const voice=e.enabled&&!e.cooperative&&r.voice?.enabled?`<p class="field-note">Микрофоны Discord · ${r.voice.connected?esc(r.voice.channelName||'Канал подключён')+' · '+(r.voice.online?'бот на связи':'бот не в сети'):'ожидаем подключения канала'}</p>`:'';
  return `<section class="experiment-settings" aria-label="Экспериментальная игра"><div class="experiment-heading"><h3>Экспериментальная игра</h3><span class="badge">${e.enabled?'ВКЛЮЧЕНА':'ВЫКЛЮЧЕНА'}</span></div>${summary.length?`<ul class="experiment-summary">${summary.map(text=>`<li>${text}</li>`).join('')}</ul>`:e.enabled?'<p class="field-note">Дополнительные правила не выбраны.</p>':''}${voice}</section>`;
 }
 const preview=experimentMicDraft?.code===r.code&&document.activeElement?.id==='experiment-mic-chance'?experimentMicDraft.value:e.micChance;
 const gameLocked=locked||e.cooperative,multiUnavailable=e.maxSpies<2;
 const multiDisabled=!!r.testMode||(multiUnavailable&&!e.multiSpy);
 const multiNote=r.testMode?'Несколько шпионов недоступны в одиночном тесте.':multiUnavailable?'Для нескольких шпионов нужно минимум 5 игроков.':e.multiSpy&&e.spyCount>e.maxSpies?`Для ${e.spyCount} шпионов нужно минимум ${e.spyCount*2+1} игроков.`:'';
 const availableCounts=Array.from({length:Math.max(2,e.maxSpies)-1},(_,index)=>index+2);
 const spyOptions=(e.spyCount>Math.max(2,e.maxSpies)?`<option value="${e.spyCount}" selected disabled>${e.spyCount} — мало игроков</option>`:'')+availableCounts.map(count=>`<option value="${count}" ${e.spyCount===count?'selected':''}>${count}</option>`).join('');
 return `<section class="experiment-settings" aria-label="Экспериментальная игра">${experimentSwitch('enabled','Экспериментальная игра','Дополнительные правила раунда',e.enabled,locked||(e.enabled&&needsVoice))}${e.enabled&&masterNote?`<p class="field-note experiment-lock-note">${masterNote}</p>`:''}${e.enabled?`<div class="experiment-options">${experimentSwitch('cooperative','Все за одно','У всех одна тема. Угадываем слово по очереди, без шпионов.',e.cooperative,locked||!!r.testMode)}${r.testMode?'<p class="field-note">«Все за одно» недоступно в одиночном тесте.</p>':''}${e.cooperative?'<p class="experiment-mode-note">Ведущий задаёт тему и слово. Неверный ответ передаёт ход дальше; попытки не ограничены. Верный ответ — общая победа.</p>':''}<fieldset class="experiment-game-options" ${gameLocked?'disabled':''} aria-label="Правила со шпионами">${experimentSwitch('flash-word','Спец игра','Слово видно один раз, 1 секунду',e.flashWord)}${experimentSwitch('suspicions','Ставки сделаны','Выбирайте подозреваемого нажатием на аватарку. В конце круга все увидят общее досье.',e.suspicions)}${experimentSwitch('common-ground','Общий знаменатель · Discord','Один разговор в парах на 20 секунд после открытия всех досье.',e.commonGround,!r.abilities?.discordReady&&!e.commonGround)}${experimentSwitch('multi-spy','Больше шпионов','Если абилки включены, каждому выдаётся своя.',e.multiSpy,multiDisabled)}${multiNote?'<p class="field-note">'+multiNote+'</p>':''}${e.multiSpy?`<div class="experiment-suboptions"><div class="experiment-count"><label for="experiment-spy-count">Количество шпионов</label><select id="experiment-spy-count" ${multiUnavailable?'disabled':''}>${spyOptions}</select></div>${experimentSwitch('spies-know','Шпионы знают друг друга','Имена союзников видны только шпионам.',e.spiesKnowEachOther)}<p class="field-note">Неверное слово любого шпиона — поражение всей команды шпионов.</p></div>`:''}${experimentSwitch('mic-chaos','Проблемы с микрофоном','Без Discord пропускает ход; с Discord также переключает микрофоны.',e.micChaos)}${e.micChaos?`<div class="experiment-suboptions experiment-probability"><label for="experiment-mic-chance">Вероятность <output id="experiment-mic-value" for="experiment-mic-chance">${preview}%</output></label><input id="experiment-mic-chance" type="range" min="1" max="100" step="1" value="${preview}" aria-valuetext="${preview}%"><div class="experiment-range-ends" aria-hidden="true"><span>1%</span><span>100%</span></div><p class="field-note">Со 2-й секунды хода — проверка каждую секунду.</p></div>`:''}</fieldset>${!e.cooperative?voiceSettings(r):''}</div>`:''}</section>`;
}
document.addEventListener('input',event=>{
 if(event.target.id!=='experiment-mic-chance')return;
 const value=Math.max(1,Math.min(100,Number(event.target.value)||10));
 experimentMicDraft={code:state.room?.code,value};
 const output=document.getElementById('experiment-mic-value');if(output)output.textContent=value+'%';
 event.target.setAttribute('aria-valuetext',value+'%');
});
document.addEventListener('focusout',event=>{if(event.target.id==='experiment-mic-chance')experimentMicDraft=null;});
document.addEventListener('change',event=>{
 if(!event.target.id?.startsWith('experiment-')||event.target.disabled)return;
 const r=state.room;if(!r||r.hostId!==state.me||r.phase!=='waiting')return;
 const current=experimentValues(r),payload={};
 const controls={suspicions:'suspicions',commonGround:'common-ground',enabled:'enabled',flashWord:'flash-word',multiSpy:'multi-spy',spiesKnowEachOther:'spies-know',cooperative:'cooperative',micChaos:'mic-chaos'};
 for(const [field,id]of Object.entries(controls)){const input=document.getElementById('experiment-'+id);payload[field]=input?input.checked:current[field];}
 for(const [field,id]of [['spyCount','spy-count'],['micChance','mic-chance']]){const input=document.getElementById('experiment-'+id);payload[field]=input?Number(input.value):current[field];}
 act('experimentSettings',payload);
});
