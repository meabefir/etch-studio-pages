import * as THREE from 'three';
import {nodeMap,pointOf,radiusOf,curveSettings,motifSettings} from './sigil-data.js';
import {sampleCurve} from './sigil-geometry.js?v=sigil-performance-1';

// Keep GPU buffers and sampled curves between edits. All grab points share one
// instanced draw, rather than allocating and drawing a sphere for every vertex.
export class SigilCurveOverlay{
  constructor(){
    this.group=new THREE.Group();this.lines=[];this.markerPool=[];this.markers=[];this.samples=new Map();this.materials=new Map();this.colors=new Map();
    this.sphere=new THREE.SphereGeometry(1,12,8);this.markerMaterial=new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false,depthWrite:false});this.capacity=0;this.ensureCapacity(128);
  }
  ensureCapacity(count){
    if(count<=this.capacity)return;this.capacity=Math.max(128,2**Math.ceil(Math.log2(count)));
    if(this.instances){this.group.remove(this.instances);this.instances.dispose();}
    this.instances=new THREE.InstancedMesh(this.sphere,this.markerMaterial,this.capacity);this.instances.count=0;this.instances.frustumCulled=false;this.instances.renderOrder=1000;this.instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(this.instances);
  }
  color(value){let color=this.colors.get(value);if(!color){color=new THREE.Color(value);this.colors.set(value,color);}return color;}
  curvePoints(curve,design,map){
    const settings=curveSettings(design,curve),key=JSON.stringify([settings.curveResolution,motifSettings(settings),curve.nodes.map(n=>[pointOf(n,map),n.in,n.out,radiusOf(n,map),Boolean(n.link)])]);
    let cached=this.samples.get(curve.id);if(!cached||cached.key!==key){cached={key,points:sampleCurve(curve,design,null,map).map(p=>p.p)};this.samples.set(curve.id,cached);}return cached.points;
  }
  rebuild(design,selected){
    this.group.visible=design.settings.showCurves;if(!this.group.visible)return this.markers;
    const map=nodeMap(design),plus=(p,h)=>p.map((v,i)=>v+h[i]);let lineCount=0,markerCount=0;
    this.ensureCapacity(design.curves.reduce((n,c)=>n+c.nodes.length,0)+(design.curves.find(c=>c.id===selected.curve)?.nodes.length||0)*2);
    const line=(points,color,opacity=1)=>{
      const key=color+'|'+opacity;let material=this.materials.get(key);
      if(!material){material=new THREE.LineBasicMaterial({color,depthTest:false,depthWrite:false,transparent:true,opacity});this.materials.set(key,material);}
      let object=this.lines[lineCount++];if(!object){object=new THREE.Line(new THREE.BufferGeometry(),material);object.renderOrder=950;object.frustumCulled=false;this.lines.push(object);this.group.add(object);}
      let attribute=object.geometry.getAttribute('position');if(attribute?.count!==points.length){object.geometry.dispose();object.geometry=new THREE.BufferGeometry();attribute=new THREE.BufferAttribute(new Float32Array(points.length*3),3).setUsage(THREE.DynamicDrawUsage);object.geometry.setAttribute('position',attribute);}
      for(let i=0;i<points.length;i++)attribute.setXYZ(i,...points[i]);attribute.needsUpdate=true;object.material=material;object.visible=true;
    };
    const marker=(position,color,pick,radius)=>{
      let object=this.markerPool[markerCount];if(!object){object=new THREE.Object3D();this.markerPool.push(object);}object.position.fromArray(position);object.userData.pick=pick;object.userData.radius=radius;
      this.instances.setColorAt(markerCount++,this.color(color));
    };
    for(const curve of design.curves){
      const s=curveSettings(design,curve),points=this.curvePoints(curve,design,map);line(points,curve.id===selected.curve?'#e9c69b':'#809f9c');
      const copies=s.symmetry==='radial'?s.radialCopies:s.symmetry==='mirror'?2:1;
      for(let copy=1;copy<copies;copy++){const a=copy*Math.PI*2/copies,c=Math.cos(a),sn=Math.sin(a);line(points.map(p=>s.symmetry==='mirror'?[-p[0],p[1],p[2]]:[c*p[0]-sn*p[1],sn*p[0]+c*p[1],p[2]]),'#577977',.4);}
      for(const node of curve.nodes){
        const p=pointOf(node,map),pick={curve:curve.id,node:node.id};marker(p,node.link?'#70d0b0':node.id===selected.node?'#ffe0a5':'#d6ad78',{...pick,part:'p'},node.id===selected.node?5.5:4.5);
        if(curve.id===selected.curve)for(const part of ['in','out']){const handle=plus(p,node[part]),color=part==='in'?'#b998ef':'#73b5e2';line([p,handle],color,.8);marker(handle,color,{...pick,part},3.5);}
      }
    }
    for(let i=lineCount;i<this.lines.length;i++)this.lines[i].visible=false;
    for(const id of this.samples.keys())if(!design.curves.some(c=>c.id===id))this.samples.delete(id);
    this.instances.count=markerCount;if(this.instances.instanceColor)this.instances.instanceColor.needsUpdate=true;this.markers=this.markerPool.slice(0,markerCount);return this.markers;
  }
  update(camera,height){
    if(!this.group.visible)return;const e=camera.matrixWorldInverse.elements,factor=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/Math.max(1,height);
    for(let i=0;i<this.markers.length;i++){const marker=this.markers[i],p=marker.position,distance=Math.max(.01,-(e[2]*p.x+e[6]*p.y+e[10]*p.z+e[14]));marker.scale.setScalar(distance*factor*marker.userData.radius);marker.updateMatrix();this.instances.setMatrixAt(i,marker.matrix);}
    this.instances.instanceMatrix.needsUpdate=true;
  }
}
