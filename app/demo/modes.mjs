import {releasePhoto} from './demo.mjs';
import {stopMirror} from './mirror.mjs';
import {releaseVocal} from './vocal.mjs';
const modes=['photo','mirror','vocal'];
const tabs=modes.map(mode=>document.getElementById(mode+'ModeTab'));
let active;
function select(mode,{focus=false,updateURL=true}={}) {
  if(mode!==active){
    // Release both before displaying the next panel, including pending permissions/uploads.
    if(active!==undefined){releasePhoto();stopMirror();releaseVocal();}
    active=mode;
    for(const name of modes){
      const selected=name===mode;
      const tab=document.getElementById(name+'ModeTab');
      tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
      document.getElementById(name+'Experience').hidden=!selected;
    }
  }
  if(updateURL)history.replaceState(null,'','#'+mode);
  if(focus)document.getElementById(mode+'ModeTab').focus();
}
function fromURL(){
  const mode=location.hash==='#vocal'?'vocal':location.hash==='#photo'?'photo':location.hash==='#mirror'?'mirror':location.pathname==='/mirror'?'mirror':'photo';
  select(mode,{updateURL:false});
}
for(const [index,tab]of tabs.entries())tab.addEventListener('click',()=>select(modes[index]));
document.querySelector('.experience-tabs').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const index=modes.indexOf(active);
  select(event.key==='Home'?modes[0]:event.key==='End'?modes.at(-1):modes[(index+(event.key==='ArrowLeft'?-1:1)+modes.length)%modes.length],{focus:true});
});
window.addEventListener('hashchange',fromURL);
fromURL();
