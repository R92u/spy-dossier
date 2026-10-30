'use strict';
let roundEventKey='',roundEventFrame=0,roundEventContent='';
function suspectAvatar(r,p){
 const can=r.suspicions?.enabled&&r.phase==='playing'&&p.alive&&p.id!==state.me&&r.players.some(p=>p.id===state.me&&!p.host&&p.alive);
 const avatar=avatarMarkup(p,'seat-avatar');
 return can?`<button type="button" class="suspect-avatar ${r.suspicions.mine===p.id?'suspect-selected':''}" data-suspect="${esc(p.id)}" aria-label="Подозревать ${esc(p.name)}" aria-pressed="${r.suspicions.mine===p.id}">${avatar}<span class="suspect-mark" aria-hidden="true">?</span></button>`:avatar;
}
function syncRoundEvents(r){
 const pair=r?.phase==='pair-rooms'?r.pairEvent:null,dossier=r?.phase==='suspicions'?r.suspicions?.dossier:null;
 const key=pair?pair.id:dossier?r.roundId+':suspects:'+dossier.cycle:'';
 let dialog=document.getElementById('round-event-dialog');
 if(!key){if(dialog?.open)dialog.close();document.body.classList.remove('round-event-open');roundEventKey='';cancelAnimationFrame(roundEventFrame);return;}
 if(!dialog){dialog=document.createElement('dialog');dialog.id='round-event-dialog';dialog.className='round-event-dialog';dialog.setAttribute('aria-label','Событие раунда');dialog.addEventListener('cancel',event=>event.preventDefault());document.body.append(dialog);}
 if(roundEventKey!==key){roundEventKey=key;roundEventContent='';dialog.classList.remove('event-enter');void dialog.offsetWidth;dialog.classList.add('event-enter');}
 if(!dialog.open)dialog.showModal();document.body.classList.add('round-event-open');
 if(pair){
  const names=group=>group.map(id=>r.players.find(p=>p.id===id)).filter(Boolean);
  const own=pair.groups.find(group=>group.includes(state.me));
  const title=pair.stage==='prepare'?'Разделяем по комнатам':pair.stage==='talk'?'Разговор в парах':'Возвращаемся за стол';
  const content=pair.stage+':'+JSON.stringify(pair.groups);
  if(content!==roundEventContent){roundEventContent=content;dialog.innerHTML=`<section class="pair-event" aria-label="Парные комнаты"><span class="eyebrow">${pair.kind==='common'?'ОБЩИЙ ЗНАМЕНАТЕЛЬ':'ПЕРЕКРЁСТНЫЙ ДОПРОС'}</span><h1>${title}</h1><div class="pair-orbit" aria-hidden="true"><i></i><i></i><i></i></div><strong class="pair-countdown" role="timer"></strong><div class="pair-progress" role="progressbar" aria-label="Подготовка комнат" aria-valuemin="0" aria-valuemax="100"><span></span></div><p class="pair-status" aria-live="polite"></p><div class="pair-groups">${(own?[own]:pair.groups).map(group=>`<div class="pair-group">${names(group).map(p=>`<div>${avatarMarkup(p)}<b>${esc(p.name)}</b></div>`).join('<span aria-hidden="true">×</span>')}</div>`).join('')}</div><p class="field-note">${pair.kind==='common'?'Обсудите и выберите общую ассоциацию.':'Разговор длится 20 секунд.'} Затем вернётся обычная игра.</p>${r.hostId===state.me?'<button type="button" class="btn ghost small" data-pair-abort>Завершить раунд</button>':''}</section>`;}
  const bar=dialog.querySelector('.pair-progress'),status=dialog.querySelector('.pair-status');bar.hidden=pair.stage==='talk';bar.classList.toggle('indeterminate',pair.stage==='return');bar.setAttribute('aria-valuenow',Math.round(pair.progress*100));bar.firstElementChild.style.width=Math.max(3,pair.progress*100)+'%';
  status.textContent=pair.error||(pair.stage==='prepare'?'Бот создаёт войсы и переносит участников…':pair.stage==='talk'?'Микрофоны в ваших комнатах открыты':'Бот возвращает участников и закрывает временные комнаты…');
  cancelAnimationFrame(roundEventFrame);const timer=()=>{if(state.room?.pairEvent?.id!==pair.id||!dialog.open)return;const element=dialog.querySelector('.pair-countdown');if(element)element.textContent=pair.stage==='talk'?String(Math.max(0,Math.ceil((pair.endsAt-gameTime())/1000))).padStart(2,'0'):'';if(pair.stage==='talk')roundEventFrame=requestAnimationFrame(timer);};timer();
 }else{
  const name=id=>r.players.find(p=>p.id===id)?.name||'Участник',tally={};dossier.entries.forEach(e=>{if(e.targetId)tally[e.targetId]=(tally[e.targetId]||0)+1;});
  const content=JSON.stringify(dossier);if(content===roundEventContent)return;roundEventContent=content;
  dialog.innerHTML=`<article class="suspect-dossier"><div class="dossier-heading"><span class="dossier-label">ОБЩЕЕ ДОСЬЕ</span><span>КРУГ ${dossier.cycle}</span></div><h1>Ставки сделаны</h1><p class="field-note">Подозрения игроков — без исключения из раунда.</p><div class="suspect-report">${dossier.entries.map(e=>`<div><b>${esc(name(e.playerId))}</b><span aria-hidden="true">→</span><strong>${e.targetId?esc(name(e.targetId)):'Не выбрал'}</strong></div>`).join('')}</div><div class="suspect-totals">${dossier.entries.map(e=>`<div><span>${esc(name(e.playerId))}</span><b>${tally[e.playerId]||0}</b></div>`).join('')}</div><button class="btn primary wide" type="button" data-suspicions-read ${dossier.acknowledged||!dossier.canClose?'disabled':''}>${dossier.acknowledged?'Ожидаем остальных…':'Закрыть досье →'}</button><p class="field-note">Прочитали ${dossier.closed} / ${dossier.total}</p></article>`;
 }
}
document.addEventListener('click',event=>{const suspect=event.target.closest('[data-suspect]');if(suspect)act('suspect',{targetId:state.room?.suspicions?.mine===suspect.dataset.suspect?null:suspect.dataset.suspect});if(event.target.closest('[data-pair-abort]'))act('pairAbort');if(event.target.closest('[data-suspicions-read]'))act('suspicionsRead');});
