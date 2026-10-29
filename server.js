'use strict';
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');const {Game}=require('./game');
function createApp(options={}){
 const game=new Game(options),streams=new Map(),rates=new Map();
 const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 const broadcast=()=>{for(const [token,res] of streams){const s=game.sessions.get(token);if(s)res.write('data: '+JSON.stringify(game.view(s))+'\n\n');}};
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/healthz')return send(res,200,{ok:true});
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(res,403,{error:'Недопустимый источник запроса.'});
  if(url.pathname==='/events'){
   const token=url.searchParams.get('token'),s=game.sessions.get(token);if(!s)return send(res,401,{error:'Сессия истекла. Обновите страницу.'});
   const old=streams.get(token);if(old)old.end();res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(': connected\n\n');streams.set(token,res);game.connection(s,true);broadcast();
   req.on('close',()=>{if(streams.get(token)===res){streams.delete(token);game.connection(s,false);broadcast();}});return;
  }
  if(url.pathname.startsWith('/api/')&&req.method==='POST'){
   try{
    const key=req.socket.remoteAddress;const now=Date.now();let rate=rates.get(key);if(!rate||now-rate.start>10000){rate={start:now,count:0};rates.set(key,rate);}if(++rate.count>400)return send(res,429,{error:'Слишком много запросов. Подождите несколько секунд.'});
    let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>8192)return send(res,413,{error:'Слишком большой запрос.'});}const body=JSON.parse(raw||'{}');
    if(url.pathname==='/api/profile/confirm'){const result=game.profiles.confirm(req.headers.authorization?.replace(/^Bearer /,''),body);broadcast();return send(res,200,result);}
    if(url.pathname.startsWith('/api/voice/')){const token=req.headers.authorization?.replace(/^Bearer /,'');let result;if(url.pathname==='/api/voice/connect')result=game.voice.connect(body);else if(url.pathname==='/api/voice/join')result=game.voice.join(token,body);else if(url.pathname==='/api/voice/poll')result=game.voice.poll(token,body);else if(url.pathname==='/api/voice/disconnect')result=game.voice.disconnect(token);else return send(res,404,{error:'Не найдено'});broadcast();return send(res,200,result);}
    if(url.pathname==='/api/session'){let s=game.sessions.get(body.token);if(!s)s=game.session();if(Object.hasOwn(body,'discordCredential')&&(!s.room||['waiting','ended'].includes(game.rooms.get(s.room)?.phase)))game.profiles.restore(s,body.discordCredential);s.lastSeen=Date.now();return send(res,200,{token:s.token,...game.view(s)});}
    const s=game.sessions.get(body.token);if(!s)return send(res,401,{error:'Сессия истекла. Обновите страницу.'});game.act(s,body.action,body.data||{});broadcast();return send(res,200,{ok:true});
   }catch(e){return send(res,400,{error:e.message});}
  }
  const files={'/lobby-ui.js':'lobby-ui.js','/experiments-ui.js':'experiments-ui.js','/experiments.css':'experiments.css','/dossier-ui.js':'dossier-ui.js','/femboy.css':'femboy.css','/femboy-character.png':'femboy-character.png','/':'index.html','/app.js':'app.js','/clock.js':'clock.js','/style.css':'style.css','/abilities-ui.js':'abilities-ui.js','/abilities.css':'abilities.css','/settings.css':'settings.css','/settings.js':'settings.js','/layout.css':'layout.css','/themes.css':'themes.css','/space-background.js':'space-background.js'};const file=files[url.pathname];if(!file){res.writeHead(404);return res.end('Not found');}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.png')?'image/png':'text/html; charset=utf-8');res.setHeader('Cache-Control','no-cache');fs.createReadStream(path.join(__dirname,'public',file)).pipe(res);
 });
 const tick=setInterval(()=>{game.tick();broadcast();for(const [key,r] of rates)if(Date.now()-r.start>60000)rates.delete(key);},1000);tick.unref();
 return {server,game,broadcast,close:()=>{clearInterval(tick);for(const res of streams.values())res.end();server.close();}};
}
if(require.main===module){const app=createApp();app.server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Spy Dossier listening'));process.on('SIGTERM',()=>{app.close();setTimeout(()=>process.exit(0),1000).unref();});}
module.exports={createApp};
