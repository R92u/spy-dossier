'use strict';
let gameClockServerTime=0,gameClockReceivedAt=performance.now();

function syncGameClock(serverTime){
 if(typeof serverTime!=='number'||!Number.isFinite(serverTime))return false;
 gameClockServerTime=serverTime;
 gameClockReceivedAt=performance.now();
 return true;
}

function gameTime(){
 // The server sets the epoch; the browser only measures elapsed time. Changing
 // the device clock or time zone must never skip a shared animation or timer.
 return gameClockServerTime+Math.max(0,performance.now()-gameClockReceivedAt);
}
