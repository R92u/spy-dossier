'use strict';
function avatarMarkup(player,className='avatar'){
 const value=player?.avatar||'',valid=/^\/avatars\/[a-f0-9]{64}$/.test(value)||/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value);
 return `<span class="${className}${valid?' has-avatar':''}">${valid?`<img src="${esc(value)}" alt="" decoding="async">`:esc(player?.name?.[0]||'?')}</span>`;
}
function avatarProfile(){return `<section class="avatar-profile" aria-label="Аватарка профиля"><div class="profile-portrait">${avatarMarkup(profile)}<div><h3>${esc(profile.name||'Ваш профиль')}</h3><p class="field-note">Аватарка видна всем игрокам.</p></div></div><div class="avatar-tools"><label class="btn secondary" for="avatar-upload">Загрузить аватарку</label><input id="avatar-upload" type="file" accept="image/png,image/jpeg,image/webp" hidden>${profile.avatar?'<button type="button" class="btn ghost" data-avatar-remove>Убрать</button>':''}</div><p class="field-note">PNG, JPG или WebP до 6 МБ. Сохраняется в этом браузере.</p></section>`;}
async function saveAvatar(value){
 if(!online)throw Error('Дождитесь подключения к серверу.');
 await request('/api/action',{token,action:'profileAvatar',data:{avatar:value}});
 profile.avatar=value;save();settingsProfileSignature='';syncSettings();
}
document.addEventListener('change',async event=>{
 if(event.target.id!=='avatar-upload')return;
 const file=event.target.files?.[0];if(!file)return;
 try{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>6*1024*1024)throw Error('Выберите PNG, JPG или WebP размером до 6 МБ.');
  const bitmap=await createImageBitmap(file);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=192;
  const context=canvas.getContext('2d');context.fillStyle='#e9e8e4';context.fillRect(0,0,192,192);
  const side=Math.min(bitmap.width,bitmap.height);context.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,192,192);bitmap.close();
  let value=canvas.toDataURL('image/jpeg',.82);if(value.length>45000)value=canvas.toDataURL('image/jpeg',.6);
  await saveAvatar(value);toast('Аватарка сохранена');
 }catch(error){toast(error.message||'Не удалось открыть картинку.');}
 finally{event.target.value='';}
});
document.addEventListener('click',async event=>{if(!event.target.closest('[data-avatar-remove]'))return;try{await saveAvatar('');}catch(error){toast(error.message);}});
