import {validateReferences} from './sigil-reference-data.js';
export const sigilDefaults = {
  curveResolution: 18, meshResolution: 92, adaptiveResolution: false, adaptiveQuality: 2, adaptiveBoost: 3, detailBudget:9000000, smoothMesh:false, smoothAngle:45, smoothStrength:.35, smoothPasses:4, smoothVolume:true, radiusScale: 1, flatten: 1, bulge: .12, endTaper: .25, tipLength: .4, cap: 'rounded',
  blend: .055, poleBulge: 1.18, symmetry: 'mirror', radialCopies: 4, twist: 0,
  ripple: true, rippleAmplitude: .12, rippleFrequency: 8, ripplePhase: 0, rippleSharpness: 1,
  spineWave: 0, spineFrequency: 3, spineDepth: 0,
  ridges: 0, ridgeDepth: 0, ridgeTwist: 0, bark: .035, barkFrequency: 18,
  thorns: true, thornDensity: 2.8, thornLength: .42, thornRadius: .085, thornCurve: .55, thornLean: -.22, thornJitter: .2, thornSides: 'alternate',
  leaves: false, leafDensity: 1.3, leafLength: .6, leafWidth: .18, leafThickness: .18, leafCurl: .35,
  seed: 12, metalness: .15, roughness: .55, color: '#bfae93', live: true, showCurves: true,showAxes:false,lockRotation:false
};
export const sigilControls = [
  ['Shape', 'radiusScale', 'Radius multiplier', .15, 3, .05], ['Shape','flatten','Cross-section depth',.15,1.8,.05], ['Shape','bulge','Organic swelling',0,.8,.02], ['Shape','endTaper','End taper',0,1,.02], ['Shape','tipLength','Tip extension',0,2,.05], ['Shape','blend','Junction blending',0,.25,.005], ['Shape','poleBulge','Pole swelling',1,2,.05], ['Shape','twist','Cross-section twist',-6,6,.1], ['Shape','radialCopies','Radial copies',2,8,1],
  ['Ripples & waves','rippleAmplitude','Ripple depth',0,.7,.02], ['Ripples & waves','rippleFrequency','Ripples per curve',1,40,1], ['Ripples & waves','ripplePhase','Ripple phase',0,360,5], ['Ripples & waves','rippleSharpness','Ripple sharpness',.3,4,.1], ['Ripples & waves','spineWave','Centerline wave',0,.4,.01], ['Ripples & waves','spineFrequency','Centerline frequency',1,16,1], ['Ripples & waves','spineDepth','Wave depth in Z',0,.5,.01],
  ['Surface texture','ridges','Flute count',0,16,1], ['Surface texture','ridgeDepth','Flute depth',0,.5,.02], ['Surface texture','ridgeTwist','Spiral turns',-8,8,.1], ['Surface texture','bark','Bark relief',0,.3,.01], ['Surface texture','barkFrequency','Bark frequency',2,50,1], ['Surface texture','seed','Pattern seed',1,999,1],
  ['Thorns','thornDensity','Thorns per unit',.3,7,.1], ['Thorns','thornLength','Thorn length',.05,1.2,.02], ['Thorns','thornRadius','Thorn base radius',.025,.25,.005], ['Thorns','thornCurve','Thorn curvature',0,1,.05], ['Thorns','thornLean','Thorn lean',-.8,.8,.05], ['Thorns','thornJitter','Growth variation',0,.8,.05],
  ['Leaves','leafDensity','Leaves per unit',.3,4,.1], ['Leaves','leafLength','Leaf length',.1,1.2,.025], ['Leaves','leafWidth','Leaf width',.05,.45,.01], ['Leaves','leafThickness','Leaf thickness',.08,.5,.02], ['Leaves','leafCurl','Leaf curl',0,1,.05],
  ['Resolution & finish','curveResolution','Samples per segment',6,64,2], ['Resolution & finish','meshResolution','Mesh grid resolution',40,160,4], ['Resolution & finish','adaptiveQuality','Adaptive detail fidelity',1,4,.25], ['Resolution & finish','adaptiveBoost','Maximum detail boost',1,6,.25], ['Resolution & finish','smoothAngle','Sharp angle threshold (°)',0,180,1], ['Resolution & finish','smoothStrength','Smoothing strength',.05,.8,.05], ['Resolution & finish','smoothPasses','Smoothing passes',1,20,1], ['Resolution & finish','metalness','Metallic finish',0,1,.05], ['Resolution & finish','roughness','Surface roughness',.05,1,.05]
];
export const sigilPresets = [
  { id:'thorn',name:'Thorn sigil',settings:{...sigilDefaults} },
  { id:'cyber',name:'Chrome cybersigil',settings:{...sigilDefaults,flatten:.52,bulge:0,endTaper:.9,cap:'pointed',tipLength:1.2,rippleAmplitude:.08,rippleFrequency:18,bark:0,thorns:true,thornDensity:3.4,thornLength:.55,thornCurve:.85,thornJitter:0,blend:.035,metalness:1,roughness:.18,color:'#b5c5d7',ridges:3,ridgeDepth:.2} },
  { id:'vine',name:'Living vine',settings:{...sigilDefaults,symmetry:'none',bulge:.4,flatten:.8,spineWave:.1,spineDepth:.04,rippleFrequency:4,rippleAmplitude:.16,bark:.1,thornDensity:1.6,thornLength:.27,thornJitter:.55,leaves:true,leafCurl:.6,metalness:0,roughness:.85,color:'#7c9c6b'} },
  { id:'smooth',name:'Continuous sigil',settings:{...sigilDefaults,thorns:false,ripple:false,bark:0,bulge:0,endTaper:.8,cap:'pointed',blend:.09,flatten:.65,metalness:.3,roughness:.4,color:'#d0bfae'} },
  { id:'coral',name:'Tidal coral',settings:{...sigilDefaults,symmetry:'radial',radialCopies:5,radiusScale:.75,bulge:.35,rippleAmplitude:.38,rippleFrequency:12,bark:.15,thorns:false,spineWave:.075,spineDepth:.08,poleBulge:1.5,color:'#c99085',metalness:0,roughness:.9} },
  { id:'relic',name:'Forged relic',settings:{...sigilDefaults,rippleAmplitude:.27,rippleFrequency:16,rippleSharpness:2.3,ridges:6,ridgeDepth:.28,ridgeTwist:2,bark:.06,flatten:.75,thorns:false,cap:'flat',endTaper:0,metalness:.9,roughness:.28,color:'#a88955'} }
];
const options = {cap:['rounded','flat','pointed'],symmetry:['none','mirror','radial'],thornSides:['alternate','paired','spiral']};
export const sigilSharedKeys=['curveResolution','meshResolution','adaptiveResolution','adaptiveQuality','adaptiveBoost','detailBudget','smoothMesh','smoothAngle','smoothStrength','smoothPasses','smoothVolume','metalness','roughness','color','live','showCurves','showAxes','lockRotation'];
export const sigilMotifKeys=Object.keys(sigilDefaults).filter(key=>!sigilSharedKeys.includes(key));
const limits=Object.fromEntries(sigilControls.map(([,key,,min,max])=>[key,[min,max]]));
limits.detailBudget=[512,Infinity];
function settingsFor(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid sigil settings.');
  const settings={};for(const key of keys){const v=value[key]??sigilDefaults[key],defaultValue=sigilDefaults[key];
    if(typeof v!==typeof defaultValue||(typeof v==='number'&&(!Number.isFinite(v)||v<limits[key][0]||v>limits[key][1]))||(options[key]&&!options[key].includes(v))||(key==='color'&&!/^#[0-9a-f]{6}$/i.test(v)))throw new Error(`Invalid sigil setting: ${key}.`);
    if(key==='detailBudget'&&!Number.isSafeInteger(v))throw new Error('Detail budget must be a positive whole number.');
    settings[key]=['curveResolution','meshResolution','smoothPasses','seed','radialCopies','ridges'].includes(key)?Math.round(v):v;
  }return settings;
}
export function motifSettings(value){return settingsFor(value,sigilMotifKeys);}
export function curveSettings(design,curve){return {...design.settings,...curve.settings};}
export function validateSigil(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.curves) || !value.curves.length || value.curves.length>24) throw new Error('A sigil needs 1–24 curves.');
  const settings=settingsFor(value.settings||{},Object.keys(sigilDefaults));
  const ids=new Map(), curveIds=new Set(), vec=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=50);
  const curves=value.curves.map(curve=>{
    if(typeof curve.id!=='string'||curveIds.has(curve.id)||typeof curve.name!=='string'||curve.name.length>80||!Array.isArray(curve.nodes)||curve.nodes.length<2||curve.nodes.length>32) throw new Error('Each curve needs 2–32 vertices and a unique name reference.'); curveIds.add(curve.id);
    if(curve.settings!=null&&Object.keys(curve.settings).some(key=>!sigilMotifKeys.includes(key)))throw new Error('Curve motifs cannot override shared resolution or finish.');
    return {id:curve.id,name:curve.name,settings:curve.settings==null?null:motifSettings(curve.settings),nodes:curve.nodes.map((node,index)=>{
      if(typeof node.id!=='string'||ids.has(node.id)||!vec(node.p)||!vec(node.in)||!vec(node.out)||!Number.isFinite(node.radius)||node.radius<.015||node.radius>1||!['free','aligned','mirrored'].includes(node.mode)) throw new Error('Invalid sigil vertex or Bézier handles.');
      ids.set(node.id,{curve:curve.id,index}); return {id:node.id,p:[...node.p],in:[...node.in],out:[...node.out],radius:node.radius,mode:node.mode,link:node.link||null,inheritRadius:node.inheritRadius!==false};
    })};
  });
  for(const curve of curves) for(let i=0;i<curve.nodes.length;i++) {
    const node=curve.nodes[i]; if(!node.link)continue; const target=ids.get(node.link);
    if(!target||target.curve===curve.id||(i!==0&&i!==curve.nodes.length-1))throw new Error('Connect only a curve endpoint to a vertex on a different curve.');
    const visited=new Set([node.id]); let current=node;
    while(current.link){if(visited.has(current.link))throw new Error('Pole connections cannot form a reference cycle.');visited.add(current.link); current=curves.flatMap(c=>c.nodes).find(n=>n.id===current.link);}
  }
  return {version:1,settings,curves,...(value.references===undefined?{}:{references:validateReferences(value.references)})};
}
export function nodeMap(design) { return new Map(design.curves.flatMap(c=>c.nodes.map(n=>[n.id,n]))); }
export function resolveNode(node, map) { const visited=new Set(); while(node.link&&!visited.has(node.id)){visited.add(node.id);node=map.get(node.link)||node;}return node; }
export function pointOf(node,map){return resolveNode(node,map).p;}
export function radiusOf(node,map){return node.link&&node.inheritRadius?resolveNode(node,map).radius:node.radius;}
let serial=0;
export function makeNode(p,radius=.09){return {id:`v-${Date.now().toString(36)}-${++serial}`,p:[...p],in:[0,-.3,0],out:[0,.3,0],radius,mode:'aligned',link:null,inheritRadius:true};}
export function makeCurve(name='Curve',points=[[0,-1,0],[0,0,0],[.6,1,0]]) {return {id:`c-${Date.now().toString(36)}-${++serial}`,name,settings:null,nodes:points.map(p=>makeNode(p))};}
export function starterSigil() {
  const stem=makeCurve('Spine',[[0,-1.65,0],[0,-.5,0],[0,.65,0],[0,1.7,0]]);stem.nodes.forEach((n,i)=>n.radius=[.06,.13,.11,.035][i]);
  const wing=makeCurve('Crescent',[[0,-.5,0],[.85,.0,0],[1.2,.9,0],[.75,1.45,0]]);wing.nodes[0].link=stem.nodes[1].id;wing.nodes[0].out=[.48,.02,0];wing.nodes[1].in=[-.35,-.15,0];wing.nodes[1].out=[.32,.15,0];wing.nodes[2].in=[.07,-.4,0];wing.nodes[2].out=[-.07,.35,0];wing.nodes[3].in=[.35,-.05,0];wing.nodes[3].out=[-.3,.05,0];wing.nodes[3].radius=.025;
  const root=makeCurve('Root hook',[[0,-.5,0],[.9,-.85,0],[.75,-1.45,0]]);root.nodes[0].link=stem.nodes[1].id;root.nodes[0].out=[.4,-.15,0];root.nodes[1].in=[-.2,.3,0];root.nodes[1].out=[.2,-.3,0];root.nodes[2].in=[.2,.15,0];root.nodes[2].radius=.025;
  return {version:1,settings:{...sigilDefaults},curves:[stem,wing,root]};
}
