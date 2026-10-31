"use strict";
const simpleRoleName=r=>({spy:'Шпион',civilian:'Мирный',cooperative:'Команда',host:'Ведущий'}[r.role]||'');
function simpleRoleBadge(r){return r.modulation?.dossier===false?`<span class="simple-role-badge">${esc(simpleRoleName(r))}</span>`:'';}
function simpleSecret(r){return r.role==='spy'||r.role==='cooperative'?'???':flashDossier(r)&&(!r.dossier?.used||gameTime()>=r.dossier.expiresAt)?'Слово скрыто':r.word||'Слово скрыто';}
function simpleTableWord(r){return r.modulation?.dossier===false&&r.phase==='playing'?`<strong class="simple-table-word">${esc(simpleSecret(r))}</strong>`:'';}
function simpleRoleReveal(r){
 if(r.modulation?.dossier!==false||r.phase!=='reveal'||r.role==='host')return '';
 roleViewed=true;const ready=r.players.find(p=>p.id===state.me)?.ready;
 return `<section class="simple-role-panel" aria-label="Ваша роль"><h2>${esc(simpleRoleName(r))}</h2><strong class="simple-secret">${esc(simpleSecret(r))}</strong><p>Тема: ${esc(r.theme)}</p>${r.role==='spy'&&r.hint?`<p>Подсказка: ${esc(r.hint)}</p>`:''}${dossierAllies(r)}${flashDossier(r)&&!r.dossier?.used?'<button class="btn secondary" data-simple-reveal>Показать слово на 1 секунду</button>':''}${ready?'<p>Вы готовы. Ожидаем остальных…</p>':button('Я посмотрел роль →','ready','primary',dossierCanReady(r)?'':'disabled')}</section>`;
}
let simpleExpiryTimer;
function syncSimpleRole(){clearTimeout(simpleExpiryTimer);const r=state.room;if(r?.modulation?.dossier!==false)return;document.querySelectorAll('.simple-secret,.simple-table-word').forEach(n=>n.textContent=simpleSecret(r));const b=document.querySelector('[data-action="ready"]');if(b)b.disabled=!dossierCanReady(r);if(flashDossier(r)&&r.dossier?.used&&gameTime()<r.dossier.expiresAt)simpleExpiryTimer=setTimeout(syncSimpleRole,Math.max(1,r.dossier.expiresAt-gameTime()));}
document.addEventListener('click',e=>{if(e.target.closest('[data-simple-reveal]'))act('dossierReveal');});
