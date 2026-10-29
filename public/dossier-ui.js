'use strict';
let dossierExpiryTimer,dossierOpening=0,dossierRevealPending=false;
const flashDossier=r=>!!(r?.experiments?.flashWord&&r.role==='civilian');
const dossierCanReady=r=>!flashDossier(r)||!!(r.dossier?.used&&gameTime()>=r.dossier.expiresAt);
const guessWriter=r=>r?.guesserId===state.me;
function dossierWord(r){
 if(r.role!=='civilian')return '';
 const visible=!flashDossier(r)||!!(r.dossier?.used&&gameTime()<r.dossier.expiresAt);
 return `<div class="dossier-word"><span>${flashDossier(r)?'ЗАПОМНИТЕ · 1 СЕКУНДА':'СЕКРЕТНОЕ СЛОВО'}</span><strong>${visible&&r.word?esc(r.word):r.dossier?.used?'Слово скрыто':'Нажмите «Открыть досье»'}</strong></div>`;
}
function dossierAllies(r){
 if(r.role!=='spy'||!r.spyIds)return '';
 const names=r.players.filter(p=>p.id!==state.me&&r.spyIds.includes(p.id)).map(p=>esc(p.name));
 return names.length?`<div class="dossier-intel"><span>НАПАРНИКИ</span><b>${names.join(', ')}</b></div>`:'';
}
function resetDossierTimers(){clearTimeout(dossierExpiryTimer);dossierOpening++;dossierRevealPending=false;}
function syncDossierState(r){
 clearTimeout(dossierExpiryTimer);
 if(!r)return;
 const dialog=$('dossier'),word=dialog.querySelector('.dossier-word');
 if(word&&flashDossier(r)){
  const visible=r.dossier?.used&&gameTime()<r.dossier.expiresAt;
  word.querySelector('strong').textContent=visible&&r.word?r.word:r.dossier?.used?'Слово скрыто':'Открываем досье…';
  word.classList.toggle('word-expired',!!r.dossier?.used&&!visible);
 }
 const ready=dialog.querySelector('[data-dossier-ready]');
 if(ready){ready.disabled=!dossierCanReady(r);ready.textContent=ready.disabled?'Запомните слово…':'Готов →';}
 const outside=document.querySelector('[data-action="ready"]');if(outside)outside.disabled=!roleViewed||!dossierCanReady(r);
 if(dialog.open&&flashDossier(r)&&r.dossier?.used&&gameTime()<r.dossier.expiresAt){
  const roundId=r.roundId;
  dossierExpiryTimer=setTimeout(()=>{if(state.room?.roundId===roundId)syncDossierState(state.room);},Math.max(1,r.dossier.expiresAt-gameTime()));
 }
}
async function revealDossierWord(folder){
 const r=state.room;if(!flashDossier(r)||!r.dossier?.canReveal||dossierRevealPending)return;
 dossierRevealPending=true;const opening=dossierOpening,roundId=r.roundId;
 // Start the server's one-second window only after the cover has moved away.
 await Promise.allSettled(folder.querySelector('.dossier-cover').getAnimations().map(animation=>animation.finished));
 if(opening!==dossierOpening||!$('dossier').open||state.room?.roundId!==roundId)return;
 try{await request('/api/action',{token,action:'dossierReveal',data:{}});}
 catch(error){dossierRevealPending=false;toast(error.message);closeDossier();}
}
