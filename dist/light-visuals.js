import * as THREE from './vendor/build/three.module.js';

function iconTexture(type) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
  const ctx = canvas.getContext('2d'); ctx.translate(48,48); ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.fillStyle = '#252b35'; ctx.strokeStyle = '#e6ad6f';
  ctx.beginPath(); ctx.arc(0,0,32,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#fff1dc'; ctx.lineWidth = 4;
  if (type === 'sun') {
    ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.stroke();
    for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.beginPath();ctx.moveTo(Math.cos(a)*17,Math.sin(a)*17);ctx.lineTo(Math.cos(a)*24,Math.sin(a)*24);ctx.stroke();}
  } else if (type === 'point') {
    ctx.beginPath();ctx.arc(0,-5,12,Math.PI*.2,Math.PI*2.8);ctx.lineTo(-7,14);ctx.lineTo(7,14);ctx.closePath();ctx.stroke();ctx.beginPath();ctx.moveTo(-5,21);ctx.lineTo(5,21);ctx.stroke();
  } else {
    ctx.beginPath();ctx.arc(0,0,12,0,Math.PI*2);ctx.stroke();
    for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){ctx.beginPath();ctx.moveTo(Math.cos(a)*18,Math.sin(a)*18);ctx.lineTo(Math.cos(a)*25,Math.sin(a)*25);ctx.stroke();}
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
const sprite = texture => {
  const object=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,depthWrite:false,transparent:true}));object.renderOrder=900;return object;
};
export class LightVisuals {
  constructor(entry) {
    this.entry=entry;this.object=new THREE.Group();this.textures=[iconTexture(entry.lightType),iconTexture('target')];
    this.icon=sprite(this.textures[0]);this.icon.userData.entry=entry;this.object.add(this.icon);
    this.target=sprite(this.textures[1]);this.target.userData.entry=entry;this.object.add(this.target);
    this.arrow=new THREE.ArrowHelper(new THREE.Vector3(0,-1,0),new THREE.Vector3(),1,0xcf934f);
    this.arrow.traverse(o=>{if(o.material){o.material.depthTest=false;o.material.depthWrite=false;o.material.transparent=true;o.material.opacity=.85;}o.renderOrder=890;});this.object.add(this.arrow);
  }
  update(camera,height,visible,selected,aiming) {
    const entry=this.entry,origin=entry.object.getWorldPosition(new THREE.Vector3()),target=entry.target;
    const pixelScale=position=>camera.isOrthographicCamera?(camera.top-camera.bottom)/camera.zoom/height:2*Math.max(.01,-position.clone().applyMatrix4(camera.matrixWorldInverse).z)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/height;
    const projected=origin.clone().project(camera),behind=origin.clone().applyMatrix4(camera.matrixWorldInverse).z>=0;
    this.offscreen=behind||Math.abs(projected.x)>.92||Math.abs(projected.y)>.9||projected.z>1;
    if(this.offscreen){if(behind){projected.x*=-1;projected.y*=-1;}if(!Number.isFinite(projected.x))projected.x=0;if(!Number.isFinite(projected.y))projected.y=1;
      const factor=Math.max(Math.abs(projected.x)/.92,Math.abs(projected.y)/.9,1);projected.x/=factor;projected.y/=factor;projected.z=0;this.icon.position.copy(projected.unproject(camera));
    }else this.icon.position.copy(origin);
    this.icon.scale.setScalar(pixelScale(this.icon.position)*(selected?36:30));this.icon.visible=visible&&entry.visible;
    this.target.position.copy(target);this.target.scale.setScalar(pixelScale(target)*26);this.target.visible=visible&&entry.lightType==='sun'&&entry.visible&&selected&&aiming;
    const delta=target.clone().sub(origin),length=delta.length();this.arrow.visible=visible&&entry.lightType==='sun'&&entry.visible&&length>.001;
    if(this.arrow.visible){this.arrow.position.copy(origin);this.arrow.setDirection(delta.normalize());const tip=Math.min(length*.3,pixelScale(target)*18);this.arrow.setLength(length,tip,tip*.5);}
  }
  dispose() { this.object.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.textures.forEach(t=>t.dispose()); }
}
