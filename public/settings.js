'use strict';
const uiPreferences={disable3d:false,experimentalDesign:false,design:'studio',femboyUnlocked:false};
const uiPreferenceKey='dossier-ui-settings';
function readUiPreferences(raw){
 try{
  const value=JSON.parse(raw||'null');
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const femboyUnlocked=value.femboyUnlocked===true;
  return {disable3d:value.disable3d===true,experimentalDesign:value.experimentalDesign===true,design:value.design==='cosmos'?'cosmos':value.design==='femboy'&&femboyUnlocked?'femboy':'studio',femboyUnlocked};
 }catch{return null;}
}
try{Object.assign(uiPreferences,readUiPreferences(localStorage.getItem(uiPreferenceKey))||{});}catch{}
let settingsProfileSignature='',settingsDialogReady=false,settingsDesignStreak=0;
function applyAppearance(){
 document.body.dataset.theme=uiPreferences.experimentalDesign?uiPreferences.design:'base';
 document.body.classList.toggle('flat-mode',uiPreferences.disable3d);
 if(typeof updateSpaceBackground==='function')updateSpaceBackground();
 document.dispatchEvent(new CustomEvent('appearancechange',{detail:{...uiPreferences}}));
}
function persistUiPreferences(){
 try{localStorage.setItem(uiPreferenceKey,JSON.stringify(uiPreferences));}
 catch{if(typeof toast==='function')toast('Настройки применены, но браузер не разрешил их сохранить.');}
}
function ensureSettingsDialog(){
 const dialog=document.getElementById('settings-dialog');
 if(!dialog||settingsDialogReady)return dialog;
 dialog.setAttribute('aria-labelledby','settings-title');
 dialog.innerHTML=`<div class="settings-shell"><header class="settings-heading"><div><span class="settings-kicker">ВАШ БРАУЗЕР</span><h2 id="settings-title">Настройки</h2></div><button class="settings-close btn ghost small" type="button" data-settings-close aria-label="Закрыть настройки">×</button></header><div id="settings-toast" role="status" aria-live="polite" aria-atomic="true"></div><div class="settings-body"><section id="settings-profile" class="settings-profile-slot" aria-label="Подключение Discord"></section><section class="appearance-settings" aria-labelledby="appearance-title"><h3 id="appearance-title">Оформление</h3><label class="switch-row settings-switch"><span>Отключить 3D<small>Плоские анимации монеты и досье</small></span><input id="setting-disable3d" type="checkbox" role="switch"></label><label class="switch-row settings-switch"><span>Тестовый дизайн<small>Меняет только оформление</small></span><input id="setting-experimental" type="checkbox" role="switch"></label><div id="setting-design-wrap" class="setting-design-wrap" hidden><label for="setting-design">Дизайн</label><select id="setting-design"><option value="studio">Студия — светлый дизайн</option><option value="cosmos">Космос — чёрно-белый</option></select></div></section></div><footer class="settings-footer"><span>Настройки сохраняются автоматически</span><button class="btn" type="button" data-settings-close>Готово</button></footer></div>`;
 settingsDialogReady=true;
 dialog.addEventListener('click',event=>{
  if(event.target===dialog||event.target.closest('[data-settings-close]'))dialog.close();
 });
 dialog.addEventListener('close',()=>{
  settingsDesignStreak=0;
  document.body.classList.remove('settings-open');
  const gear=document.getElementById('open-settings');
  if(gear&&!gear.closest('[inert]'))gear.focus({preventScroll:true});
 });
 dialog.addEventListener('change',event=>{
  let unlocked=false;
  if(event.target.id!=='setting-experimental')settingsDesignStreak=0;
  if(event.target.id==='setting-disable3d')uiPreferences.disable3d=event.target.checked;
  else if(event.target.id==='setting-experimental'){
   uiPreferences.experimentalDesign=event.target.checked;
   if(!uiPreferences.femboyUnlocked&&++settingsDesignStreak===5){
    uiPreferences.femboyUnlocked=true;uiPreferences.experimentalDesign=true;uiPreferences.design='femboy';unlocked=true;settingsDesignStreak=0;
   }
  }
  else if(event.target.id==='setting-design')uiPreferences.design=event.target.value==='cosmos'?'cosmos':event.target.value==='femboy'&&uiPreferences.femboyUnlocked?'femboy':'studio';
  else return;
  persistUiPreferences();applyAppearance();syncAppearanceControls();
  if(unlocked&&typeof toast==='function')toast('Секретный дизайн открыт ✦');
 });
 syncAppearanceControls();
 return dialog;
}
function syncAppearanceControls(){
 const flat=document.getElementById('setting-disable3d'),experimental=document.getElementById('setting-experimental'),select=document.getElementById('setting-design'),wrap=document.getElementById('setting-design-wrap');
 if(flat)flat.checked=uiPreferences.disable3d;
 if(experimental)experimental.checked=uiPreferences.experimentalDesign;
 if(select){
  const secret=select.querySelector('option[value="femboy"]');
  if(uiPreferences.femboyUnlocked&&!secret){const option=document.createElement('option');option.value='femboy';option.textContent='Femboy — секретный дизайн';select.append(option);}
  else if(!uiPreferences.femboyUnlocked&&secret)secret.remove();
  select.value=uiPreferences.design;
 }
 if(wrap)wrap.hidden=!uiPreferences.experimentalDesign;
}
function syncSettings(){
 if(!settingsDialogReady)return;
 const slot=document.getElementById('settings-profile');if(!slot)return;
 const discord=state.discord||{},editable=!state.room||['waiting','ended'].includes(state.room.phase);
 // Do not replace a selected pairing code or a focused control on ordinary heartbeats.
 const signature=JSON.stringify({name:discord.name,available:discord.available,code:discord.code,editable});
 if(signature===settingsProfileSignature)return;
 settingsProfileSignature=signature;
 slot.innerHTML=discordProfile()+(editable?'':'<p class="settings-profile-note">Привязку Discord можно менять между раундами.</p>');
 slot.querySelectorAll('[data-action="profileCode"],[data-action="profileForget"],[data-action="profileCancel"]').forEach(button=>{button.disabled=!editable;});
}
document.addEventListener('click',event=>{
 const gear=event.target.closest('#open-settings,[data-open-settings]');if(!gear)return;
 const dialog=ensureSettingsDialog();if(!dialog)return;
 syncSettings();syncAppearanceControls();
 if(!dialog.open){dialog.showModal();document.body.classList.add('settings-open');}
});
window.addEventListener('storage',event=>{
 if(event.key!==uiPreferenceKey)return;
 settingsDesignStreak=0;
 Object.assign(uiPreferences,readUiPreferences(event.newValue)||{disable3d:false,experimentalDesign:false,design:'studio',femboyUnlocked:false});
 applyAppearance();syncAppearanceControls();
});
applyAppearance();
