import * as THREE from 'three';

const topologyCache=new WeakMap();
function topology(geometry){
  const p=geometry.attributes.position,index=geometry.index,key=`${p.version}:${index?.version}:${p.count}:${index?.count}`;
  const cached=topologyCache.get(geometry);if(cached?.key===key)return cached;
  geometry.computeBoundingBox();const size=geometry.boundingBox.getSize(new THREE.Vector3()),tolerance=Math.max(1e-9,Math.max(size.x,size.y,size.z)*1e-7);
  const welded=new Map(),ids=new Uint32Array(p.count),representatives=[];
  for(let i=0;i<p.count;i++){
    const coordinate=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v/tolerance)).join(',');
    let id=welded.get(coordinate);if(id===undefined){id=representatives.length;representatives.push(i);welded.set(coordinate,id);}ids[i]=id;
  }
  const triangles=Math.floor((index?.count??p.count)/3),normals=new Float32Array(triangles*3),edges=new Map();
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3();
  for(let face=0;face<triangles;face++){
    const vertices=[0,1,2].map(k=>index?index.getX(face*3+k):face*3+k);
    a.fromBufferAttribute(p,vertices[0]);b.fromBufferAttribute(p,vertices[1]);c.fromBufferAttribute(p,vertices[2]);
    normal.crossVectors(b.sub(a),c.sub(a));if(normal.lengthSq()<1e-24)continue;normal.normalize().toArray(normals,face*3);
    for(let k=0;k<3;k++){
      let u=ids[vertices[k]],v=ids[vertices[(k+1)%3]];if(u===v)continue;if(u>v)[u,v]=[v,u];
      const edgeKey=u*p.count+v;let edge=edges.get(edgeKey);if(!edge){edge={a:representatives[u],b:representatives[v],faces:[]};edges.set(edgeKey,edge);}edge.faces.push(face);
    }
  }
  const result={key,edges,normals};topologyCache.set(geometry,result);return result;
}

// Face normals come from triangle positions, never interpolated mesh normals.
// Welding handles OBJ splits, UV seams and separately indexed face normals.
export function creaseSegments(geometry,threshold,normalMatrix=new THREE.Matrix3()){
  const {edges,normals}=topology(geometry),p=geometry.attributes.position,positions=[],cosine=Math.cos(threshold*Math.PI/180);
  const a=new THREE.Vector3(),b=new THREE.Vector3();
  for(const edge of edges.values()){
    if(edge.faces.length<2)continue;let sharp=false;
    for(let i=0;i<edge.faces.length&&!sharp;i++)for(let j=i+1;j<edge.faces.length;j++){
      a.fromArray(normals,edge.faces[i]*3).applyMatrix3(normalMatrix).normalize();b.fromArray(normals,edge.faces[j]*3).applyMatrix3(normalMatrix).normalize();
      if(a.dot(b)<cosine-1e-7){sharp=true;break;}
    }
    if(sharp)for(const vertex of [edge.a,edge.b])positions.push(p.getX(vertex),p.getY(vertex),p.getZ(vertex));
  }
  return new Float32Array(positions);
}

export class HardContourRenderer {
  constructor(){
    this.records=new WeakMap();this.lines=new THREE.Scene();
    this.surface=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
  }
  render(engine,camera,w,h){
    const r=engine.renderer;
    if(!this.target)this.target=new THREE.WebGLRenderTarget(w,h,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true});else this.target.setSize(w,h);
    this.lines.clear();
    for(let i=0;i<engine.models.length;i++){
      const entry=engine.models[i],style=engine.styleFor(entry);if(!entry.visible||!style.hardContour)continue;
      entry.object.traverse(mesh=>{
        if(!mesh.isMesh||!mesh.visible)return;
        const matrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld),key=[style.hardAngle,mesh.geometry.attributes.position.version,mesh.geometry.index?.version,...matrix.elements].join(',');
        let record=this.records.get(mesh.geometry);
        if(!record){
          const material=new THREE.ShaderMaterial({depthWrite:false,blending:THREE.NoBlending,uniforms:{objectId:{value:i+1}},vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform float objectId;void main(){gl_FragColor=vec4(objectId/255.0,0.0,0.0,1.0);}'});
          record={key:null,line:new THREE.LineSegments(new THREE.BufferGeometry(),material)};record.line.matrixAutoUpdate=false;this.records.set(mesh.geometry,record);
          mesh.geometry.addEventListener('dispose',()=>{record.line.geometry.dispose();material.dispose();this.records.delete(mesh.geometry);topologyCache.delete(mesh.geometry);});
        }
        if(record.key!==key){record.line.geometry.dispose();record.line.geometry=new THREE.BufferGeometry();record.line.geometry.setAttribute('position',new THREE.BufferAttribute(creaseSegments(mesh.geometry,style.hardAngle,matrix),3));record.key=key;}
        record.line.material.uniforms.objectId.value=i+1;record.line.matrix.copy(mesh.matrixWorld);this.lines.add(record.line);
      });
    }
    const target=r.getRenderTarget(),clear=r.getClearColor(new THREE.Color()),alpha=r.getClearAlpha(),auto=r.autoClear,override=engine.scene.overrideMaterial,pixels=new Uint8Array(w*h*4);
    try{
      r.setRenderTarget(this.target);r.setClearColor(0,0);r.autoClear=true;engine.scene.overrideMaterial=this.surface;r.render(engine.scene,camera);
      engine.scene.overrideMaterial=override;r.autoClear=false;r.render(this.lines,camera);r.readRenderTargetPixels(this.target,0,0,w,h,pixels);
    }finally{engine.scene.overrideMaterial=override;r.setRenderTarget(target);r.setClearColor(clear,alpha);r.autoClear=auto;}
    return pixels;
  }
}
