'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../public/abilities-ui.js'),'utf8');

// Only the DOM operations used by the shuffle portal are modeled. CSS animation
// playback remains a browser concern; these tests protect its lifetime and clock.
function harness(now=1000){
 class Element {
  constructor(tagName){
   this.tagName=tagName;this.children=[];this.parentNode=null;this.id='';
   this.attributes=new Map();this.properties=new Map();
   this.style={
    setProperty:(key,value)=>this.properties.set(key,String(value)),
    getPropertyValue:key=>this.properties.get(key)||'',
    removeProperty:key=>{const old=this.properties.get(key)||'';this.properties.delete(key);return old;}
   };
  }
  setAttribute(key,value){this.attributes.set(key,String(value));}
  append(child){child.remove();this.children.push(child);child.parentNode=this;}
  remove(){if(!this.parentNode)return;const siblings=this.parentNode.children;siblings.splice(siblings.indexOf(this),1);this.parentNode=null;}
  replaceChildren(...children){for(const child of [...this.children])child.remove();for(const child of children)this.append(child);}
 }
 const body=new Element('body'),app=new Element('main');app.id='app';body.append(app);
 const find=(node,id)=>node.id===id?node:node.children.map(child=>find(child,id)).find(Boolean)||null;
 const document={body,createElement:tag=>new Element(tag),getElementById:id=>find(body,id),addEventListener(){}};
 const scrolls=[];
 const context=vm.createContext({document,window:{scrollTo:options=>scrolls.push(options)},Date:{now:()=>now}});
 vm.runInContext(source,context,{filename:'abilities-ui.js'});
 return {
  body,app,document,scrolls,
  now:value=>{now=value;},
  sync:room=>context.positionAbilityShuffle(room),
  effect:()=>document.getElementById('shuffle-effect'),
  style:key=>body.style.getPropertyValue(key)
 };
}

function shuffling(id='shuffle-1',startedAt=1000){
 return {phase:'shuffling',abilityShuffle:{id,startedAt,blackoutEndsAt:startedAt+1200,endsAt:startedAt+5700}};
}

test('shuffle portal and its running clock survive game rerenders',()=>{
 const ui=harness(1100),room=shuffling();
 ui.sync(room);
 const effect=ui.effect();
 assert.equal(effect.parentNode,ui.body,'the fullscreen effect must live outside the replaceable game');
 assert.equal(ui.style('--shuffle-age'),'100ms');
 assert.equal(ui.style('--shuffle-cover-time'),'1200ms');

 for(const now of [1400,1800,2600]){
  ui.app.replaceChildren(ui.document.createElement('section'));
  ui.now(now);ui.sync(room);
  assert.equal(ui.effect(),effect,'an unrelated game render must not replace/restart the curtain');
  // Updating a negative CSS delay while the same animation is running would
  // count elapsed wall time twice and cut the blackout/shake short.
  assert.equal(ui.style('--shuffle-age'),'100ms','keep the initial delay while CSS advances naturally');
 }
 assert.equal(ui.body.children.filter(node=>node.id==='shuffle-effect').length,1);
 assert.equal(ui.scrolls.length,1,'heartbeats must not repeatedly scroll the page');
});

test('joining during or after the blackout seeks the existing server timeline',()=>{
 for(const elapsed of [450,1600,5400]){
  const ui=harness(1000+elapsed);ui.sync(shuffling());
  assert.equal(ui.style('--shuffle-age'),elapsed+'ms');
  assert.equal(ui.style('--shuffle-cover-time'),'1200ms');
  assert.ok(ui.effect());
  ui.now(1000+elapsed+200);ui.sync(shuffling());
  assert.equal(ui.style('--shuffle-age'),elapsed+'ms','late arrival must not replay or accelerate on its next update');
 }
});

test('a new shuffle gets a fresh portal and its own initial clock',()=>{
 const ui=harness(1100);ui.sync(shuffling());const old=ui.effect();
 ui.now(8200);ui.sync(shuffling('shuffle-2',8000));
 assert.notEqual(ui.effect(),old);
 assert.equal(old.parentNode,null);
 assert.equal(ui.effect().parentNode,ui.body);
 assert.equal(ui.style('--shuffle-age'),'200ms');
 assert.equal(ui.scrolls.length,2);
});

test('leaving the phase or removing its event clears the effect and only its styles',()=>{
 for(const next of [null,{phase:'shuffling'}, {...shuffling(),phase:'playing'}]){
  const ui=harness(1200);ui.body.style.setProperty('--other-setting','keep');ui.sync(shuffling());
  ui.sync(next);
  assert.equal(ui.effect(),null);
  assert.equal(ui.style('--shuffle-age'),'');
  assert.equal(ui.style('--shuffle-cover-time'),'');
  assert.equal(ui.style('--other-setting'),'keep');
  ui.sync(next);
  ui.now(1600);ui.sync(shuffling());
  assert.equal(ui.style('--shuffle-age'),'600ms','a fresh view must rejoin the current server time');
 }
});
