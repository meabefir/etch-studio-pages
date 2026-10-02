import * as THREE from 'three';
export function axisCameraPose(camera,target,axis,sign=1){const distance=Math.max(.1,camera.position.distanceTo(target)),direction=new THREE.Vector3();direction[axis]=sign;camera.position.copy(target).addScaledVector(direction,distance);camera.up.set(0,axis==='y'?0:1,axis==='y'?-sign:0);camera.lookAt(target);camera.updateMatrixWorld(true);}
export function rollCameraPose(camera,target,radians){const forward=target.clone().sub(camera.position).normalize();camera.up.applyAxisAngle(forward,radians).normalize();camera.lookAt(target);camera.updateMatrixWorld(true);}
export class ViewCompass {
  constructor(container,actions){
    this.root=document.createElement('div');this.root.className='view-compass';this.root.setAttribute('aria-label','Camera orientation');this.root.innerHTML='<div class="compass-ball"><svg viewBox="0 0 104 104" aria-hidden="true"></svg></div><div class="compass-roll"></div>';
    this.svg=this.root.querySelector('svg');this.buttons=[];
    for(const [axis,color]of [['x','#dc8787'],['y','#8dc395'],['z','#7facdc']])for(const sign of [-1,1]){
      const button=document.createElement('button'),line=document.createElementNS('http://www.w3.org/2000/svg','line');button.className='compass-axis';button.textContent=(sign<0?'−':'')+axis.toUpperCase();button.setAttribute('aria-label',`Align view to ${sign>0?'positive':'negative'} ${axis.toUpperCase()} axis`);button.title=`Look from ${sign>0?'+':'−'}${axis.toUpperCase()} at the selected model`;button.style.setProperty('--axis-color',color);button.onclick=()=>actions.align(axis,sign);line.setAttribute('stroke',color);line.setAttribute('x1','52');line.setAttribute('y1','52');this.svg.append(line);this.root.querySelector('.compass-ball').append(button);this.buttons.push({axis,sign,button,line});
    }
    for(const [text,angle,label]of [['↶',-15,'Roll camera left 15 degrees'],['↷',15,'Roll camera right 15 degrees']]){const button=document.createElement('button');button.textContent=text;button.setAttribute('aria-label',label);button.title=label;button.onclick=()=>actions.roll(angle);this.root.querySelector('.compass-roll').append(button);}container.append(this.root);
  }
  update(camera){const rotation=camera.quaternion.clone().invert();for(const {axis,sign,button,line}of this.buttons){const v=new THREE.Vector3();v[axis]=sign;v.applyQuaternion(rotation);let x=52+v.x*34,y=52-v.y*34;if(Math.hypot(v.x,v.y)<.12)x+=sign*11;button.style.left=`${x}px`;button.style.top=`${y}px`;button.style.zIndex=String(Math.round(v.z*10+20));button.classList.toggle('behind',v.z<-.1);line.setAttribute('x2',x);line.setAttribute('y2',y);line.setAttribute('opacity',v.z<-.1?'.3':'.8');}}
}
