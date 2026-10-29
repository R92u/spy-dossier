'use strict';
const abilityNames={coin:'50/50',silence:'Радиомолчание',vowels:'Гласный след',probe:'Пробник',shuffle:'Перетасовка',reverse:'Смена курса',spotlight:'Голос толпы'};
const abilityDescriptions={coin:'Один бросок. Орёл открывает первую букву слова.',silence:'Один игрок пропустит ближайший ход. Его микрофон выключится до конца следующего чужого хода.',vowels:'Узнать число гласных: 0, 1, 2 или 3 и больше.',probe:'Проверить одну букву: есть ли она в слове, без указания позиции.',shuffle:'Перемешать места всех игроков и начать новый круг со случайного участника.',reverse:'Развернуть очередь тех, кто ещё не ходил в этом круге.',spotlight:'Дать выбранному игроку дополнительное слово. Затем вернётся прерванный ход.'};
let abilityTargetOpen=false,abilityProbeDraft='',abilityCoinSeen='',abilityCoinEvent=null,wheelCaptionTimer,coinCloseTimer,shuffleTimer,lastShuffleUI='',lastSpotlightUI='';
const wheelItems=pool=>Array.from({length:pool.length===1?6:pool.length<4?pool.length*2:pool.length},(_,i)=>pool[i%pool.length]);
function abilitySettings(r){
 const a=r.abilities||{enabled:false,wheel:true,censored:false,pool:['coin']},host=r.hostId===state.me;
 if(!host)return a.enabled?`<section class="ability-settings"><h3>Способности шпиона</h3><p class="field-note">${a.pool.map(id=>abilityNames[id]).join(' · ')}${!a.wheel?' · Секретная выдача':a.censored?' · Колесо с цензурой':' · Открытое колесо'}</p></section>`:'';
 return `<section class="ability-settings"><label class="switch-row"><span>Абилки шпиона<small>Одна случайная способность на раунд</small></span><input id="abilities-enabled" type="checkbox" role="switch" ${a.enabled?'checked':''}></label>${a.enabled?`<div class="ability-options"><label class="switch-row"><span>Анимация колеса<small>До открытия досье</small></span><input id="abilities-wheel" type="checkbox" role="switch" ${a.wheel?'checked':''}></label><label class="switch-row"><span>Цензура<small>${a.wheel?'Результат колеса и монетку видит только шпион':'Монетку видит только шпион'}</small></span><input id="abilities-censored" type="checkbox" role="switch" ${a.censored?'checked':''}></label>${!a.wheel?'<p class="field-note">Способность выдаётся тайно, без колеса.</p>':''}<div class="ability-pool">${Object.entries(abilityNames).map(([id,name])=>`<label class="ability-choice"><input type="checkbox" data-ability-pool="${id}" ${a.pool.includes(id)?'checked':''} ${id==='silence'&&!a.discordReady&&!a.pool.includes(id)?'disabled':''}><span><strong>${name}${id==='silence'?' · Discord':''}</strong><small>${abilityDescriptions[id]}</small></span></label>`).join('')}</div>${!a.discordReady?'<p class="field-note">Для «Радиомолчания» привяжите Discord в профиле и включите экспериментальную игру.</p>':''}</div>`:''}</section>`;
}
function abilityTestPicker(r){
 if(!r.testMode||!r.canTest||['waiting','ended','ability-draw'].includes(r.phase))return '';
 const available=r.phase==='playing'&&!r.spotlight;
 return `<section class="ability-test-picker" aria-label="Проверка всех способностей"><strong>Проверить способность</strong><p class="field-note">Выбор выдаёт новый заряд. Можно повторять в этом тесте.</p><div>${Object.entries(abilityNames).map(([id,name])=>button(name,'abilityTest','ghost small',`data-ability="${id}" ${available?'':'disabled'}`)).join('')}</div></section>`;
}
function abilityControl(r,context='table'){
 const a=r.ability;if(r.role!=='spy'||!a?.id||['waiting','ended','ability-draw','shuffling'].includes(r.phase))return '';
 const used=a.used,coin=a.id==='coin',targeted=['silence','spotlight'].includes(a.id),feedback=a.feedback||{};
 const targets=abilityTargetOpen&&!used&&targeted&&r.phase==='playing'?`<div class="ability-targets" role="group" aria-label="Выберите цель способности">${r.players.filter(p=>!p.host&&p.alive&&(a.id!=='spotlight'||p.id!==r.current)).map(p=>button(esc(p.name)+(p.id===state.me?' · я':''),'abilityTarget','ghost small',`data-target="${p.id}"`)).join('')}${button('Отмена','abilityCancel','ghost small')}</div>`:'';
 let result=a.letter?`<div class="ability-letter">Первая буква <strong>${esc(a.letter)}</strong></div>`:feedback.vowels!==undefined?`<div class="ability-letter">Гласных в слове <strong>${feedback.vowels==='3+'?'3+':esc(feedback.vowels)}</strong></div>`:feedback.probe?`<div class="ability-letter"><strong>${esc(feedback.probe.letter)}</strong>${feedback.probe.present?'Есть в слове':'Нет в слове'}</div>`:'';
 if(!result)result=`<p class="ability-description">${used?(coin?(a.coin?.outcome==='tails'?'Решка. Подсказки нет.':a.coin?.outcome?'Орёл. Подсказка получена.':'Монетка в воздухе…'):'Способность использована.'):abilityDescriptions[a.id]}</p>`;
 const probe=!used&&a.id==='probe'?`<div class="ability-probe"><input id="ability-probe-${context}" data-ability-probe maxlength="2" aria-label="Буква для проверки" value="${esc(abilityProbeDraft)}" placeholder="А" autocomplete="off">${button('Проверить букву','abilityProbe','ability-button',a.canUse?'':'disabled')}</div>`:'';
 const control=!used&&a.id!=='probe'?button(coin?'Подбросить монетку':targeted?'Выбрать игрока':'Активировать',targeted?'abilityPick':'abilityUse','ability-button',a.canUse?'':'disabled'):'';
 return `<section class="ability-control" aria-label="Способность шпиона"><div class="ability-heading"><span class="ability-icon">${coin?'◈':'◌'}</span><strong>${abilityNames[a.id]}</strong><span class="badge">${used?'ИСПОЛЬЗОВАНО':'1 ЗАРЯД'}</span></div>${result}${control}${probe}${targets}</section>`;
}
function abilityWheel(r){
 const d=r.abilityDraw;if(!d)return '';
 const masked=!d.result,items=wheelItems(d.pool);
 return `<section class="ability-wheel-screen" aria-label="Выбор способности"><span class="eyebrow">СПОСОБНОСТЬ ШПИОНА</span><h1>${masked?'Под грифом «секретно»':'Испытайте удачу'}</h1><div class="ability-wheel-stage"><div class="ability-wheel-pointer" aria-hidden="true"></div><div class="ability-wheel" data-wheel="${esc(d.id)}">${items.map((id,i)=>`<span class="wheel-label" data-wheel-label="${i}">${masked?'?':abilityNames[id]}</span>`).join('')}</div><div class="wheel-hub" aria-hidden="true">Ш</div></div><h2 class="wheel-caption" aria-live="polite">Выбираем способность…</h2><p class="ability-wheel-legend">${masked?'Результат увидит только шпион':d.pool.map(id=>abilityNames[id]).join(' · ')}</p>${r.testMode?testControls(r):''}</section>`;
}
function abilityShuffleOverlay(r){return r.abilityShuffle?'<div class="ability-shuffle-overlay" aria-label="Перетасовка мест"><div class="shuffle-mark"><strong>⇄</strong><p>Перетасовка</p></div></div>':'';}
function positionAbilityShuffle(r){
 const d=r?.abilityShuffle,veil=document.querySelector('.ability-shuffle-overlay');clearTimeout(shuffleTimer);
 if(!d||!veil)return;
 if(lastShuffleUI!==d.id){lastShuffleUI=d.id;window.scrollTo({top:0,left:0,behavior:'instant'});}
 const elapsed=Math.max(0,Date.now()-d.startedAt),remaining=d.blackoutEndsAt-Date.now();
 veil.style.animationDelay=-elapsed+'ms';
 if(remaining<=0)veil.hidden=true;else shuffleTimer=setTimeout(()=>{if(state.room?.abilityShuffle?.id===d.id){veil.hidden=true;document.querySelector('.table-section')?.classList.add('table-shake');}},remaining);
}
function positionSpotlight(r){
 const id=r?.spotlight?.targetId;if(!id){lastSpotlightUI='';return;}
 const seat=document.querySelector('.seat.spotlight'),table=document.querySelector('.table-wrap');
 if(!seat||!table||lastSpotlightUI===id)return;
 lastSpotlightUI=id;closeDossier();
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
  const bounds=table.getBoundingClientRect(),a=2*Math.PI*r.order.indexOf(id)/r.order.length-Math.PI/2,dx=.4*bounds.width*Math.cos(a),dy=.39*bounds.height*Math.sin(a);
  seat.animate([{transform:`translate(-50%,-50%) translate(${dx}px,${dy}px) scale(1)`},{transform:'translate(-50%,-50%) translate(0,0) scale(1.25)'}],{duration:550,easing:'cubic-bezier(.2,.7,.3,1)'});
 }
 seat.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
function positionAbilityWheel(r){
 const d=r?.abilityDraw,wheel=document.querySelector('.ability-wheel');if(!d||!wheel)return;
 const items=wheelItems(d.pool),winner=d.result?items.lastIndexOf(d.result):0,sector=360/items.length;
 // Masked clients receive no winning sector, including in angles or DOM attributes.
 const angle=2160+360-(winner+.5)*sector,duration=d.endsAt-d.startedAt-1000,elapsed=Math.max(0,Date.now()-d.startedAt);
 wheel.style.background='conic-gradient('+items.map((_,i)=>`${i%2?'#2c4030':'#b6a365'} ${i*sector}deg ${(i+1)*sector}deg`).join(',')+')';
 wheel.style.setProperty('--wheel-angle',angle+'deg');wheel.style.animationDuration=duration+'ms';wheel.style.animationDelay=-elapsed+'ms';
 wheel.querySelectorAll('.wheel-label').forEach((label,i)=>{const a=(i+.5)*sector;label.style.transform=`translate(-50%,-50%) rotate(${a}deg) translateY(calc(var(--wheel-size)*-.32)) rotate(${-a}deg)`;});
 clearTimeout(wheelCaptionTimer);const reveal=()=>{const caption=document.querySelector('.wheel-caption');if(state.room?.abilityDraw?.id===d.id&&caption)caption.textContent=d.result?abilityNames[d.result]:'Способность засекречена';};
 if(elapsed>=duration)reveal();else wheelCaptionTimer=setTimeout(reveal,duration-elapsed);
}
function coinMarkup(){
 return `<button class="coin-close btn ghost" type="button" data-coin-close aria-label="Свернуть монетку">×</button><span class="eyebrow">50 / 50</span><div class="coin-scene"><div class="coin-flight"><div class="gold-coin spinning">${'<i class="coin-edge"></i>'.repeat(5)}<div class="coin-face coin-heads"><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 60L18 76l8-21L8 31l31 10-3-19 14 7 14-7-3 19 31-10-18 24 8 21z" fill="currentColor"/><path d="M41 58l9 27 9-27M43 33l7-13 7 13" fill="none" stroke="currentColor" stroke-width="6"/></svg><span>ОРЁЛ</span></div><div class="coin-face coin-tails"><strong>50<br>50</strong><span>РЕШКА</span></div></div></div><div class="coin-shadow"></div></div><div class="coin-result" aria-live="polite"><h2>Монетка в воздухе…</h2><p>Один бросок. Одна возможность.</p></div>`;
}
function closeAbilityCoin(){const dialog=$('ability-effect');if(dialog?.open)dialog.close();clearTimeout(coinCloseTimer);}
function syncAbilityEffects(r){
 const slot=$('dossier').querySelector('.dossier-ability');if(slot){const markup=abilityControl(r,'dossier');if(slot.innerHTML!==markup)slot.innerHTML=markup;}
 positionAbilityWheel(r);
 positionAbilityShuffle(r);
 positionSpotlight(r);
 const event=r?.ability?.coin;
 if(!event||['waiting','ended'].includes(r.phase)){closeAbilityCoin();if(!event){abilityCoinSeen='';abilityCoinEvent=null;}return;}
 let dialog=$('ability-effect');
 if(!dialog){dialog=document.createElement('dialog');dialog.id='ability-effect';dialog.className='coin-dialog';dialog.setAttribute('aria-label','Бросок монетки 50/50');document.body.append(dialog);dialog.addEventListener('cancel',e=>{e.preventDefault();closeAbilityCoin();});dialog.addEventListener('click',e=>{if(e.target.closest('[data-coin-close]'))closeAbilityCoin();});}
 if(abilityCoinSeen!==event.id){
  abilityCoinSeen=event.id;abilityCoinEvent=null;
  // A reconnect should show a result once, but never replay a past throw.
  if(Date.now()>event.endsAt+5000)return;
  dialog.innerHTML=coinMarkup();dialog.showModal();
  const elapsed=Math.max(0,Date.now()-event.startedAt);
  dialog.querySelector('.coin-flight').style.animationDelay=-elapsed+'ms';
  dialog.querySelector('.gold-coin').style.animationDelay=-elapsed+'ms';
 }
 const resultKey=event.outcome+':'+(r.ability.letter||'');
 if(!dialog.open||abilityCoinEvent===resultKey)return;
 abilityCoinEvent=resultKey;
 if(event.outcome){
  const coin=dialog.querySelector('.gold-coin'),from=getComputedStyle(coin).transform,angle=event.outcome==='heads'?'0deg':'180deg';coin.classList.remove('spinning');coin.classList.add('landed');coin.style.setProperty('--coin-face-angle',angle);
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)coin.animate([{transform:from},{transform:`rotateY(${angle})`}],{duration:450,easing:'cubic-bezier(.2,.7,.3,1)'});
  const letter=r.ability.letter;
  dialog.querySelector('.coin-result').innerHTML=`<h2>${event.outcome==='heads'?'Орёл':'Решка'}</h2>${letter?`<p>Первая буква слова</p><strong class="coin-letter">${esc(letter)}</strong>`:`<p>${event.outcome==='heads'?'Шпион получил первую букву.':'Бросок использован. Подсказки нет.'}</p>`}`;
  clearTimeout(coinCloseTimer);coinCloseTimer=setTimeout(closeAbilityCoin,letter?4000:2500);
 }
}
async function handleAbilityAction(e){
 const b=e.target.closest('[data-action]');if(!b||b.disabled)return;
 if(b.dataset.action==='abilityPick'){abilityTargetOpen=!abilityTargetOpen;render(true);}
 if(b.dataset.action==='abilityCancel'){abilityTargetOpen=false;render(true);}
 if(b.dataset.action==='abilityTarget'){abilityTargetOpen=false;await act('abilityUse',{targetId:b.dataset.target});}
 if(b.dataset.action==='abilityUse')await act('abilityUse');
 if(b.dataset.action==='abilityProbe')await act('abilityUse',{letter:b.closest('.ability-probe').querySelector('input').value});
 if(b.dataset.action==='abilityTest'){abilityTargetOpen=false;abilityProbeDraft='';await act('testAbility',{id:b.dataset.ability});}
}
document.addEventListener('click',handleAbilityAction);
document.addEventListener('input',e=>{if(e.target.hasAttribute('data-ability-probe'))abilityProbeDraft=e.target.value;});
document.addEventListener('change',async e=>{
 if(!e.target.id.startsWith('abilities-')&&!e.target.hasAttribute('data-ability-pool'))return;
 const current=state.room?.abilities;if(!current)return;
 const enabled=$('abilities-enabled').checked,wheel=$('abilities-wheel')?.checked??current.wheel,censored=$('abilities-censored')?.checked??current.censored;
 const boxes=[...document.querySelectorAll('[data-ability-pool]')],pool=boxes.length?boxes.filter(n=>n.checked).map(n=>n.dataset.abilityPool):current.pool;
 await act('abilitySettings',{enabled,wheel,censored,pool});render(true);
});
