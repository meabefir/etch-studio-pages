import * as THREE from 'three';

export class InfiniteGrid extends THREE.Mesh {
  constructor(){
    super(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,uniforms:{inverseProjection:{value:new THREE.Matrix4()},cameraWorld:{value:new THREE.Matrix4()},viewProjection:{value:new THREE.Matrix4()},eye:{value:new THREE.Vector3()},height:{value:-2.3},fadeRadius:{value:60},spacing:{value:.5}},vertexShader:'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',fragmentShader:''}));
    // The quad reconstructs a world-space ray, so the ground has no finite mesh boundary.
    this.material.uniforms.viewport={value:new THREE.Vector2(1,1)};
    this.material.fragmentShader=`
      uniform mat4 inverseProjection,cameraWorld,viewProjection;uniform vec3 eye;uniform vec2 viewport;uniform float height,fadeRadius,spacing;
      float lines(vec2 p,float cell){vec2 q=p/cell;vec2 edge=abs(fract(q-0.5)-0.5)/max(fwidth(q),vec2(0.00001));return 1.0-min(min(edge.x,edge.y),1.0);}
      void main(){
        vec2 ndc=gl_FragCoord.xy/viewport*2.0-1.0;
        vec4 a=inverseProjection*vec4(ndc,-1.0,1.0),b=inverseProjection*vec4(ndc,1.0,1.0);a/=a.w;b/=b.w;
        vec3 nearPoint=(cameraWorld*a).xyz,farPoint=(cameraWorld*b).xyz,ray=farPoint-nearPoint;
        if(abs(ray.y)<0.00001)discard;float t=(height-nearPoint.y)/ray.y;if(t<0.0||t>1.0)discard;
        vec3 hit=nearPoint+ray*t;vec4 clip=viewProjection*vec4(hit,1.0);float depth=clip.z/clip.w*0.5+0.5;if(depth<0.0||depth>1.0)discard;
        float fade=1.0-smoothstep(fadeRadius*0.6,fadeRadius,length(hit.xz-eye.xz));
        float footprint=max(length(dFdx(hit.xz)),length(dFdy(hit.xz)));
        float cell=spacing*pow(10.0,max(0.0,ceil(log2(max(1.0,footprint*8.0/spacing))/log2(10.0))));
        float minor=lines(hit.xz,cell),major=lines(hit.xz,cell*10.0),alpha=max(minor*0.32,major*0.57)*fade;
        if(alpha<0.002)discard;gl_FragDepth=depth;gl_FragColor=vec4(vec3(0.43,0.48,0.53),alpha);
      }`;
    this.frustumCulled=false;this.visible=false;
  }
  update(camera,renderer){const u=this.material.uniforms;u.inverseProjection.value.copy(camera.projectionMatrixInverse);u.cameraWorld.value.copy(camera.matrixWorld);u.viewProjection.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);u.eye.value.copy(camera.position);renderer.getDrawingBufferSize(u.viewport.value);}
}
