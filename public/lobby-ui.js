'use strict';
let renderedLobbyCode=null;
function lobbyNodeKey(node){
 if(node.nodeType!==1)return node.nodeName;
 const control=node.matches('label')?node.querySelector('input[id]'):null;
 return node.tagName+':'+(node.id||node.getAttribute('for')||control?.id||node.getAttribute('data-ability-pool')||node.className);
}
function patchLobbyNode(current,next){
 if(current.nodeType!==1){if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;return;}
 for(const attr of [...current.attributes])if(!next.hasAttribute(attr.name))current.removeAttribute(attr.name);
 for(const attr of next.attributes)if(current.getAttribute(attr.name)!==attr.value)current.setAttribute(attr.name,attr.value);
 patchLobbyChildren(current,next);
 if(current.tagName==='INPUT'){
  current.checked=next.checked;current.disabled=next.disabled;
  if(current.value!==next.value)current.value=next.value;
 }
 if(current.tagName==='SELECT'&&current.value!==next.value)current.value=next.value;
}
function patchLobbyChildren(current,next){
 const remaining=[...current.childNodes];let cursor=current.firstChild;
 for(const desired of [...next.childNodes]){
  const key=lobbyNodeKey(desired),index=remaining.findIndex(node=>lobbyNodeKey(node)===key);
  const actual=index<0?desired.cloneNode(true):remaining.splice(index,1)[0];
  if(actual!==cursor)current.insertBefore(actual,cursor);
  if(index>=0)patchLobbyNode(actual,desired);
  cursor=actual.nextSibling;
 }
 for(const obsolete of remaining)obsolete.remove();
}
function updateAppMarkup(markup,room){
 const app=document.getElementById('app'),code=room?.phase==='waiting'?room.code:null;
 if(code&&code===renderedLobbyCode){
  const template=document.createElement('template');template.innerHTML=markup;
  // Keep existing switches, focus, scroll anchoring and running animations alive.
  patchLobbyChildren(app,template.content);
 }else app.innerHTML=markup;
 renderedLobbyCode=code;
}
