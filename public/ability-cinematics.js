'use strict';
let cinematicId='',cinematicTimer;
function clearAbilityCinematic(){
 document.getElementById('ability-cinematic')?.remove();
 document.body.classList.remove('cinematic-reverse','cinematic-spotlight');
 document.documentElement.classList.remove('cinematic-running');
 clearTimeout(cinematicTimer);
}
function syncAbilityCinematic(r){
 const event=r?.abilityEffect;
 if(!event||r.phase!=='ability-effect'){clearAbilityCinematic();cinematicId='';return;}
 if(cinematicId===event.id)return;
 clearAbilityCinematic();cinematicId=event.id;
 const elapsed=Math.max(0,gameTime()-event.startedAt),duration=event.endsAt-event.startedAt;
 if(elapsed>=duration)return;
 closeDossier();closeAbilityCoin();
 const table=document.querySelector('.table-wrap');if(!table)return;
 table.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
 const bounds=table.getBoundingClientRect(),app=document.getElementById('app').getBoundingClientRect();
 const cx=bounds.left+bounds.width/2,cy=bounds.top+bounds.height/2;
 const layer=document.createElement('div');layer.id='ability-cinematic';layer.className='cinematic-layer '+event.kind;layer.setAttribute('aria-hidden','true');
 layer.style.setProperty('--effect-x',cx+'px');layer.style.setProperty('--effect-y',cy+'px');
 document.body.style.setProperty('--camera-x',(cx-app.left)+'px');document.body.style.setProperty('--camera-y',(cy-app.top)+'px');
 document.body.style.setProperty('--cinematic-duration',duration+'ms');document.body.style.setProperty('--cinematic-age',elapsed+'ms');
 layer.innerHTML='<div class="cinematic-vignette"></div><div class="cinematic-stage"></div>';
 const stage=layer.querySelector('.cinematic-stage');
 if(event.kind==='reverse'){
  layer.style.setProperty('--old-spin',(event.fromDirection*660)+'deg');
  stage.innerHTML='<div class="reverse-orbit"><span class="reverse-snake"></span><span class="reverse-arrows"></span></div>';
 }else{
  const index=r.order.indexOf(event.targetId),seat=document.querySelector(`[data-seat="${index}"]`),offset=seatOffset(r,index,bounds);
  layer.style.setProperty('--speaker-x',offset.dx+'px');layer.style.setProperty('--speaker-y',offset.dy+'px');
  if(seat){const actor=seat.cloneNode(true);actor.removeAttribute('data-seat');actor.removeAttribute('style');actor.className='seat cinematic-speaker spotlight';stage.append(actor);}
  stage.insertAdjacentHTML('beforeend','<i class="speaker-wave"></i><i class="speaker-wave second"></i>');
 }
 document.body.append(layer);document.documentElement.classList.add('cinematic-running');document.body.classList.add('cinematic-'+event.kind);
 cinematicTimer=setTimeout(clearAbilityCinematic,duration-elapsed);
}
