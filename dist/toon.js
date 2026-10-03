export const toonDefaults={shadeMode:'hatch',toonBlend:'linear',toonRamp:[{id:'shadow',position:0,color:'#263044'},{id:'midtone',position:.5,color:'#8f9eaf'},{id:'light',position:1,color:'#f4e6cd'}]};
export const toonKeys=Object.keys(toonDefaults);
export function validateToonSettings(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid toon settings.');
  const shadeMode=value.shadeMode??toonDefaults.shadeMode,toonBlend=value.toonBlend??toonDefaults.toonBlend;
  if(!['hatch','toon','combined'].includes(shadeMode)||!['linear','constant'].includes(toonBlend))throw new Error('Invalid toon settings.');
  return {shadeMode,toonBlend,toonRamp:validateRamp(value.toonRamp??toonDefaults.toonRamp)};
}
export const rgb=color=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
export function validateRamp(value){
  if(!Array.isArray(value)||value.length<2||value.length>128)throw new Error('A color ramp needs 2–128 stops.');
  const ids=new Set();return value.map(stop=>{if(!stop||typeof stop.id!=='string'||!stop.id||stop.id.length>80||ids.has(stop.id)||!Number.isFinite(stop.position)||stop.position<0||stop.position>1||!/^#[0-9a-f]{6}$/i.test(stop.color)||(stop.interpolation!==undefined&&!['inherit','linear','constant'].includes(stop.interpolation)))throw new Error('Invalid color ramp stop.');ids.add(stop.id);return {id:stop.id,position:stop.position,color:stop.color.toLowerCase(),...(stop.interpolation&&stop.interpolation!=='inherit'?{interpolation:stop.interpolation}:{})};}).sort((a,b)=>a.position-b.position);
}
// A stop owns the transition to the next stop on its right.
export const stopInterpolation=(stop,blend='linear')=>stop.interpolation&&stop.interpolation!=='inherit'?stop.interpolation:blend;
export function rampColor(stops,position,blend='linear'){
  let left=stops[0];if(position<left.position)return rgb(left.color);
  for(let i=1;i<stops.length;i++){const right=stops[i];if(position<right.position){if(stopInterpolation(left,blend)==='constant')return rgb(left.color);const a=rgb(left.color),b=rgb(right.color),t=(position-left.position)/Math.max(1e-12,right.position-left.position);return a.map((v,k)=>Math.round(v+(b[k]-v)*t));}left=right;}return rgb(left.color);
}
export function rampTable(stops,blend){const table=new Uint8Array(256*3);for(let i=0;i<256;i++)table.set(rampColor(stops,i/255,blend),i*3);return table;}
export const hex=channels=>'#'+channels.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
export function averageLightTone(normal,directions){const sum=[0,0,0];for(const direction of directions){const length=Math.hypot(...direction);if(length)for(let k=0;k<3;k++)sum[k]+=direction[k]/length;}const length=Math.hypot(...sum);return length>1e-6?Math.max(0,Math.min(1,normal.reduce((v,n,k)=>v+n*sum[k]/length,0))):0;}
