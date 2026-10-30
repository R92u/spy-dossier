'use strict';
let oneWordTurn='';
function oneWordWriter(r){return r?.phase==='one-word'&&(r.current===state.me||(r.testMode&&r.canTest&&r.players.find(p=>p.id===r.current)?.simulated));}
function sharedDraft(r){return r?.phase==='one-word'?r.oneWord?.draft||'':r?.guess||'';}
function syncOneWordDraft(r){const key=r?.phase==='one-word'?r.roundId+':'+r.current:'';if(key!==oneWordTurn){oneWordTurn=key;guessDraft=sharedDraft(r);}}
function oneWordPanel(r){
 const writer=oneWordWriter(r),p=r.players.find(p=>p.id===r.current),w=r.oneWord;
 return `<section class="panel guess-panel one-word-panel"><div class="panel-heading"><span class="badge">ОДНИМ СЛОВОМ</span><span class="badge">${w.index} / ${w.total}</span></div><div class="one-word-speaker">${avatarMarkup(p)}<h2>${esc(p.name)}</h2></div><p class="muted">Один круг без микрофонов. Напишите одну ассоциацию.</p><label for="guess">${writer?'Ваше слово':esc(p.name)+' сейчас пишет'}</label><div class="animated-input"><input id="guess" maxlength="32" autocomplete="off" spellcheck="false" value="${esc(writer?guessDraft:w.draft)}" placeholder="${writer?'Одно слово…':'Ждём первые буквы…'}" ${writer?'':'readonly'}><div class="letter-window" aria-hidden="true"><div class="letter-track"></div></div></div>${writer?button('Передать ход →','oneWordSubmit','primary wide'):''}<div class="one-word-history">${w.entries.map(entry=>{const author=r.players.find(p=>p.id===entry.playerId);return `<div>${avatarMarkup(author)}<span><small>${esc(author?.name)}</small><b>${esc(entry.text)}</b></span></div>`;}).join('')}</div></section>`;
}
