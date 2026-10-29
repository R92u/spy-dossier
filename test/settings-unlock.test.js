const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../public/settings.js'),'utf8');
const key='dossier-ui-settings';

// Exercise the shipped script and its event handlers with a small DOM surface.
function settings(saved){
 const nodes=new Map(),stored=new Map(),messages=[];
 if(saved!==undefined)stored.set(key,JSON.stringify(saved));
 class Element{
  constructor(id=''){this.id=id;this.listeners=new Map();this.children=[];this.checked=false;this.value='';this.open=false;this.dataset={};this.classes=new Set();this.classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};}
  set innerHTML(value){this.html=value;if(this.id==='settings-dialog')for(const id of ['setting-disable3d','setting-experimental','setting-design','setting-design-wrap','settings-profile','settings-toast'])nodes.set(id,new Element(id));}
  addEventListener(type,handler){const handlers=this.listeners.get(type)||[];handlers.push(handler);this.listeners.set(type,handlers);}
  emit(type,event={}){for(const handler of this.listeners.get(type)||[])handler(event);}
  setAttribute(){}
  closest(){return null;}
  focus(){}
  showModal(){this.open=true;}
  close(){this.open=false;this.emit('close');}
  querySelector(selector){return selector==='option[value="femboy"]'?this.children.find(option=>option.value==='femboy')||null:null;}
  querySelectorAll(){return [];}
  append(child){child.parent=this;this.children.push(child);}
  remove(){this.parent.children=this.parent.children.filter(child=>child!==this);}
 }
 const document=new Element(),window=new Element();
 document.body=new Element();document.getElementById=id=>nodes.get(id)||null;document.createElement=()=>new Element();document.dispatchEvent=event=>document.emit(event.type,event);
 nodes.set('settings-dialog',new Element('settings-dialog'));nodes.set('open-settings',new Element('open-settings'));
 const context=vm.createContext({document,window,localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},CustomEvent:class{constructor(type,init){this.type=type;Object.assign(this,init);}},toast:message=>messages.push(message)});
 vm.runInContext(source,context);context.ensureSettingsDialog();nodes.get('settings-dialog').showModal();
 return {
  document,nodes,messages,
  preferences:()=>JSON.parse(vm.runInContext('JSON.stringify(uiPreferences)',context)),
  persisted:()=>JSON.parse(stored.get(key)),
  toggle(){const target=nodes.get('setting-experimental');target.checked=!target.checked;nodes.get('settings-dialog').emit('change',{target});},
  change(id,value){const target=nodes.get(id);if(typeof value==='boolean')target.checked=value;else target.value=value;nodes.get('settings-dialog').emit('change',{target});},
  close:()=>nodes.get('settings-dialog').close(),
  sync:()=>context.syncAppearanceControls(),
  storage:value=>window.emit('storage',{key,newValue:value===null?null:JSON.stringify(value)}),
  secretOption:()=>nodes.get('setting-design').querySelector('option[value="femboy"]')
 };
}
function toggleMany(ui,count){for(let i=0;i<count;i++)ui.toggle();}

test('five switch changes reveal and activate the secret theme once',()=>{
 const ui=settings();
 toggleMany(ui,4);assert.equal(ui.preferences().femboyUnlocked,false);assert.equal(ui.secretOption(),null);
 ui.sync();ui.sync();assert.equal(ui.preferences().femboyUnlocked,false);
 ui.toggle();assert.equal(ui.preferences().femboyUnlocked,true);assert.equal(ui.preferences().experimentalDesign,true);assert.equal(ui.preferences().design,'femboy');assert.equal(ui.document.body.dataset.theme,'femboy');assert(ui.secretOption());assert.equal(ui.messages.length,1);
 ui.toggle();assert.equal(ui.document.body.dataset.theme,'base');assert.equal(ui.preferences().femboyUnlocked,true);
 ui.toggle();assert.equal(ui.document.body.dataset.theme,'femboy');assert.equal(ui.messages.length,1);
});

test('changing another setting resets the consecutive switch count',()=>{
 const ui=settings();toggleMany(ui,3);ui.change('setting-disable3d',true);toggleMany(ui,2);
 assert.equal(ui.preferences().femboyUnlocked,false);toggleMany(ui,3);assert.equal(ui.preferences().femboyUnlocked,true);
 const selector=settings();toggleMany(selector,3);selector.change('setting-design','cosmos');toggleMany(selector,2);assert.equal(selector.preferences().femboyUnlocked,false);
});

test('closing settings resets the switch count',()=>{
 const ui=settings();toggleMany(ui,3);ui.close();ui.nodes.get('settings-dialog').showModal();toggleMany(ui,2);
 assert.equal(ui.preferences().femboyUnlocked,false);toggleMany(ui,3);assert.equal(ui.preferences().femboyUnlocked,true);
});

test('unlock survives loading preferences and does not alter existing themes',()=>{
 const ui=settings();toggleMany(ui,5);const restored=settings(ui.persisted());
 assert.equal(restored.preferences().femboyUnlocked,true);assert.equal(restored.document.body.dataset.theme,'femboy');assert(restored.secretOption());
 for(const design of ['studio','cosmos']){const existing=settings({design,experimentalDesign:true,disable3d:true});assert.equal(existing.document.body.dataset.theme,design);assert.equal(existing.preferences().disable3d,true);assert.equal(existing.preferences().femboyUnlocked,false);}
});

test('locked or invalid stored flags cannot select the secret theme',()=>{
 for(const femboyUnlocked of [undefined,false,'true',1]){const ui=settings({design:'femboy',experimentalDesign:true,femboyUnlocked});assert.equal(ui.document.body.dataset.theme,'studio');assert.equal(ui.secretOption(),null);}
 const ui=settings();ui.change('setting-design','femboy');assert.equal(ui.preferences().design,'studio');
});

test('storage events synchronize secret choice and safely clear preferences',()=>{
 const ui=settings();ui.storage({design:'femboy',experimentalDesign:true,femboyUnlocked:true});
 assert.equal(ui.document.body.dataset.theme,'femboy');assert(ui.secretOption());
 ui.storage(null);assert.equal(ui.document.body.dataset.theme,'base');assert.equal(ui.preferences().femboyUnlocked,false);assert.equal(ui.secretOption(),null);
});
