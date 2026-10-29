'use strict';
const {randomBytes,createHmac,timingSafeEqual}=require('node:crypto');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
class Profiles{
 constructor(game,secret=''){this.game=game;this.secret=secret;this.invites=new Map();}
 available(){return typeof this.secret==='string'&&this.secret.length>=32;}
 editable(s){const r=this.game.rooms.get(s.room);this.game.need(!r||['waiting','ended'].includes(r.phase),'Менять Discord можно между раундами.');}
 sign(payload){return createHmac('sha256',this.secret).update('spy-profile-v1:'+payload).digest('base64url');}
 issue(userId,name){const payload=Buffer.from(JSON.stringify({v:1,userId,name,nonce:randomBytes(16).toString('hex')})).toString('base64url');return payload+'.'+this.sign(payload);}
 read(credential){
  if(!this.available()||typeof credential!=='string'||credential.length>1500)return null;
  const [payload,signature,...extra]=credential.split('.');if(extra.length||!payload||!equal(signature,this.sign(payload)))return null;
  try{const p=JSON.parse(Buffer.from(payload,'base64url').toString());return p.v===1&&typeof p.userId==='string'&&/^\d{15,22}$/.test(p.userId)&&typeof p.name==='string'&&p.name.length<=80?p:null;}catch{return null;}
 }
 restore(s,credential){this.editable(s);const account=this.read(credential);s.discord=account?{...account,credential}:null;this.game.updateTestAccess(s);return !!account;}
 cancel(s){for(const [code,i]of this.invites)if(i.session===s.token)this.invites.delete(code);}
 invite(s){this.editable(s);this.game.need(this.available(),'Привязка профиля пока не настроена.');this.cancel(s);const code=randomBytes(16).toString('hex');this.invites.set(code,{session:s.token,expires:this.game.now()+600000});return code;}
 confirm(auth,d){
  this.game.need(this.available()&&equal(auth,this.secret),'Нет доступа к подтверждению Discord.');
  const invite=this.invites.get(d.code),s=invite&&this.game.sessions.get(invite.session);
  this.game.need(s&&invite.expires>this.game.now(),'Код профиля неверен или истёк. Получите новый на сайте.');this.editable(s);
  this.game.need(typeof d.userId==='string'&&/^\d{15,22}$/.test(d.userId),'Некорректный Discord ID.');
  const name=typeof d.name==='string'?d.name.trim().slice(0,80):'';this.game.need(name,'Не указано имя Discord.');
  const credential=this.issue(d.userId,name);s.discord={...this.read(credential),credential};this.game.updateTestAccess(s);this.cancel(s);return {ok:true};
 }
 forget(s){this.editable(s);s.discord=null;this.game.updateTestAccess(s);this.cancel(s);}
 view(s){const invite=[...this.invites].find(([,i])=>i.session===s.token&&i.expires>this.game.now());return {available:this.available(),name:s.discord?.name||'',credential:s.discord?.credential||'',code:invite?.[0]||''};}
 tick(){for(const [code,i]of this.invites)if(i.expires<=this.game.now()||!this.game.sessions.has(i.session))this.invites.delete(code);}
}
module.exports={Profiles};
