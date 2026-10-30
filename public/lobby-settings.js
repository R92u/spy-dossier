'use strict';
let lobbySettingsTab='rules',lobbySettingsCloseTimer;
function syncLobbySettings(){
 const dialog=document.getElementById('lobby-settings-dialog'),r=state.room;
 if(!dialog?.open)return;
 if(!r||r.phase!=='waiting'||r.hostId!==state.me){clearTimeout(lobbySettingsCloseTimer);dialog.close();return;}
 if(lobbySettingsTab==='strong'&&!r.abilities?.enabled)lobbySettingsTab='abilities';
 dialog.querySelector('[data-lobby-tab="strong"]').hidden=!r.abilities?.enabled;
 const markup=`<section id="lobby-rules-page" class="lobby-menu-page" ${lobbySettingsTab==='rules'?'':'hidden'}><div class="lobby-menu-title"><span>01 / ПРАВИЛА</span><h2>Экспериментальная игра</h2><p>Настройте раунд для своей компании.</p></div>${experimentSettings(r)}</section><section id="lobby-abilities-page" class="lobby-menu-page" ${lobbySettingsTab==='abilities'?'':'hidden'}><div class="lobby-menu-title"><span>02 / СПОСОБНОСТИ</span><h2>Абилки шпиона</h2><p>Состав способностей и способ их выдачи.</p></div>${r.experiments?.cooperative?'<p class="lobby-menu-empty">В режиме «Все за одно» способности отключены. Изменить режим можно во вкладке «Правила».</p>':abilitySettings(r)}</section><section id="lobby-strong-page" class="lobby-menu-page" ${lobbySettingsTab==='strong'?'':'hidden'}><div class="lobby-menu-title"><span>03 / СИЛЬНЫЕ СПОСОБНОСТИ</span><h2>storg abilites</h2><p>Способности, которые меняют порядок и правила ходов.</p></div>${r.abilities?.enabled?abilityPool(r,true):''}${r.abilities?.enabled&&!r.abilities.discordReady?'<p class="field-note">Для способностей с пометкой Discord привяжите профиль и включите управление микрофонами в разделе «Правила».</p>':''}</section>`;
 const template=document.createElement('template');template.innerHTML=markup;
 patchLobbyChildren(document.getElementById('lobby-menu-content'),template.content);
 dialog.querySelectorAll('[data-lobby-tab]').forEach(button=>{const selected=button.dataset.lobbyTab===lobbySettingsTab;button.setAttribute('aria-pressed',String(selected));});
}
function closeLobbySettings(){
 const dialog=document.getElementById('lobby-settings-dialog');if(!dialog.open||dialog.classList.contains('closing'))return;
 dialog.classList.add('closing');
 lobbySettingsCloseTimer=setTimeout(()=>{dialog.close();dialog.classList.remove('closing');},matchMedia('(prefers-reduced-motion: reduce)').matches?0:180);
}
function openLobbySettings(){
 const r=state.room;if(!r||r.phase!=='waiting'||r.hostId!==state.me)return;
 const dialog=document.getElementById('lobby-settings-dialog');
 if(!dialog.querySelector('.lobby-menu-shell')){
  dialog.innerHTML=`<div class="lobby-menu-shell"><aside class="lobby-menu-sidebar"><div class="lobby-menu-brand"><img src="/lobby-logo.png" alt="" width="46" height="46"><strong>aqr1337<span>LOBBY CONTROL</span></strong></div><div class="lobby-menu-nav-label">НАСТРОЙКИ</div><nav aria-label="Разделы настроек лобби"><button type="button" data-lobby-tab="rules" aria-controls="lobby-rules-page"><span aria-hidden="true">⊞</span> Правила</button><button type="button" data-lobby-tab="abilities" aria-controls="lobby-abilities-page"><span aria-hidden="true">✧</span> Способности</button><button type="button" data-lobby-tab="strong" aria-controls="lobby-strong-page" hidden><span aria-hidden="true">⚡</span> storg abilites</button></nav><div class="lobby-menu-sidebar-foot"><span class="lobby-menu-status"></span> Сохранение автоматически</div></aside><div class="lobby-menu-main"><header class="lobby-menu-header"><span id="lobby-menu-heading">Настройки лобби</span><button type="button" data-lobby-close aria-label="Закрыть настройки лобби">×</button></header><div id="lobby-menu-toast" role="status" aria-live="polite"></div><div id="lobby-menu-content"></div><footer class="lobby-menu-footer"><span>Изменения применяются ко всему лобби</span><button class="btn secondary small" type="button" data-lobby-close>Готово</button></footer></div></div>`;
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeLobbySettings();});
  dialog.addEventListener('close',()=>{dialog.classList.remove('closing');document.body.classList.remove('lobby-menu-open');document.querySelector('[data-open-lobby-settings]')?.focus({preventScroll:true});});
  dialog.addEventListener('click',event=>{if(event.target===dialog||event.target.closest('[data-lobby-close]'))closeLobbySettings();const tab=event.target.closest('[data-lobby-tab]');if(tab&&lobbySettingsTab!==tab.dataset.lobbyTab){lobbySettingsTab=tab.dataset.lobbyTab;syncLobbySettings();document.getElementById('lobby-menu-content').scrollTop=0;}});
 }
 clearTimeout(lobbySettingsCloseTimer);dialog.classList.remove('closing');if(!dialog.open)dialog.showModal();document.body.classList.add('lobby-menu-open');syncLobbySettings();
}
document.addEventListener('click',event=>{if(event.target.closest('[data-open-lobby-settings]'))openLobbySettings();});
