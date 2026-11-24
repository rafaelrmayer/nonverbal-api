import {releasePhoto} from './demo.mjs';
import {stopMirror} from './mirror.mjs';
const modes=['photo','mirror'];
const tabs=modes.map(mode=>document.getElementById(mode+'ModeTab'));
let active;
function select(mode,{focus=false,updateURL=true}={}) {
  if(mode!==active){
    // Release both before displaying the next panel, including pending permissions/uploads.
    releasePhoto();stopMirror();
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
  const mode=location.hash==='#photo'?'photo':location.hash==='#mirror'?'mirror':location.pathname==='/mirror'?'mirror':'photo';
  select(mode,{updateURL:false});
}
for(const [index,tab]of tabs.entries())tab.addEventListener('click',()=>select(modes[index]));
document.querySelector('.experience-tabs').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  select(event.key==='Home'?'photo':event.key==='End'?'mirror':active==='photo'?'mirror':'photo',{focus:true});
});
window.addEventListener('hashchange',fromURL);
fromURL();
