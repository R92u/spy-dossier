'use strict';
class Suspicions{
 constructor(game){this.game=game;}
 enabled(r){const e=this.game.experiments.settings(r);return e.enabled&&e.suspicions&&!e.cooperative;}
 begin(r){r.suspects={};r.suspicionDossier=null;}
 choose(r,s,target){this.game.need(this.enabled(r)&&r.phase==='playing'&&this.game.alive(r).some(p=>p.id===s.id),'Сейчас нельзя выбирать подозреваемого.');this.game.need(target===null||target!==s.id&&this.game.alive(r).some(p=>p.id===target),'Выберите другого живого игрока.');r.suspects||={};r.suspects[s.id]=target;}
 reveal(r,cycle){if(!this.enabled(r)||r.suspicionDossier)return;const living=this.game.alive(r),live=new Set(living.map(p=>p.id));const entries=living.map(p=>({playerId:p.id,targetId:live.has(r.suspects?.[p.id])?r.suspects[p.id]:null}));r.suspicionDossier={cycle,entries,acks:[],eligible:r.players.filter(p=>!p.simulated).map(p=>p.id)};r.phase='suspicions';this.check(r);}
 acknowledge(r,s){this.game.need(r.phase==='suspicions'&&r.suspicionDossier?.eligible.includes(s.id),'Досье недоступно.');if(!r.suspicionDossier.acks.includes(s.id))r.suspicionDossier.acks.push(s.id);this.check(r);}
 check(r){const d=r.suspicionDossier;if(!d)return;const present=new Set([...this.game.sessions.values()].filter(s=>s.room===r.code).map(s=>s.id));d.eligible=d.eligible.filter(id=>present.has(id));if(d.eligible.every(id=>d.acks.includes(id))){r.suspicionDossier=null;r.suspects={};if(r.phase==='suspicions')r.phase='playing';}}
 view(r,s){const d=r.suspicionDossier;return {enabled:this.enabled(r),mine:r.suspects?.[s.id]||null,dossier:d?{cycle:d.cycle,entries:d.entries.map(e=>({...e})),total:d.eligible.length,closed:d.acks.length,acknowledged:d.acks.includes(s.id),canClose:d.eligible.includes(s.id)}:null};}
}
module.exports={Suspicions};
