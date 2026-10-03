import {toonDefaults,validateRamp} from './toon.js?v=stop-blending-1';

export const RAMP_PRESET_STORAGE_KEY='etch.color-ramp-presets.v1';
const palette=(id,name,colors,positions,blend='linear')=>({id,name,settings:{toonBlend:blend,toonRamp:colors.map((color,i)=>({id:`${id}-${i}`,position:positions[i],color}))}});
export const builtinRampPresets=[
  {id:'studio',name:'Studio',settings:{toonBlend:toonDefaults.toonBlend,toonRamp:validateRamp(toonDefaults.toonRamp)}},
  palette('graphite','Graphite',['#16191f','#505660','#a9adb2','#f5f2e9'],[0,.3,.7,1]),
  palette('moonlight','Moonlight',['#101c35','#304c75','#789ac0','#becfdf','#f2f4f1'],[0,.25,.55,.8,1]),
  palette('verdigris','Verdigris',['#142e2d','#2b6460','#79a58b','#c2c2a0','#f5e6bd'],[0,.28,.55,.78,1]),
  palette('forest','Forest',['#172b25','#3d5b37','#7e9154','#c5ce92','#f3eed5'],[0,.25,.53,.78,1]),
  palette('ember','Ember',['#251526','#70303b','#c45d45','#e9a365','#fff0cb'],[0,.28,.53,.78,1]),
  palette('rose-quartz','Rose quartz',['#29223e','#664761','#ad788d','#e3b5b8','#fff0e0'],[0,.25,.53,.8,1]),
  palette('porcelain','Porcelain',['#26334e','#7d9eaf','#d5e2df','#fff5e2'],[0,.25,.55,.82],'constant'),
  palette('cyber-glow','Cyber glow',['#15152e','#4d307b','#b755ad','#73d6df','#e9fffb'],[0,.22,.45,.7,.9],'constant')
];

export function rampSettings(value){
  if(!value||typeof value!=='object'||!['linear','constant'].includes(value.toonBlend))throw new Error('Invalid color ramp preset.');
  return {toonBlend:value.toonBlend,toonRamp:validateRamp(value.toonRamp)};
}
export function rampSettingsMatch(a,b){
  return a.toonBlend===b.toonBlend&&a.toonRamp.length===b.toonRamp.length&&a.toonRamp.every((stop,i)=>stop.position===b.toonRamp[i].position&&stop.color.toLowerCase()===b.toonRamp[i].color.toLowerCase()&&(stop.interpolation??'inherit')===(b.toonRamp[i].interpolation??'inherit'));
}
export function readSavedRampPresets(storage){
  const raw=storage.getItem(RAMP_PRESET_STORAGE_KEY);if(!raw)return [];
  let doc;try{doc=JSON.parse(raw);}catch{throw new Error('Saved color ramp presets could not be read.');}
  if(doc?.version!==1||!Array.isArray(doc.presets))throw new Error('Saved color ramp presets use an unsupported format.');
  const result=[],ids=new Set();
  for(const item of doc.presets){
    try{
      if(!item||typeof item.id!=='string'||!/^ramp-[a-z0-9-]{1,80}$/i.test(item.id)||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.trim().length>60)continue;
      result.push({id:item.id,name:item.name.trim(),settings:rampSettings(item.settings)});ids.add(item.id);
    }catch{/* Keep the other valid presets available. */}
  }
  return result;
}
export function saveNamedRampPreset(storage,name,value){
  const cleanName=String(name).trim();if(!cleanName||cleanName.length>60)throw new Error('Use a preset name between 1 and 60 characters.');
  const settings=rampSettings(value),presets=readSavedRampPresets(storage),existing=presets.find(p=>p.name.toLocaleLowerCase()===cleanName.toLocaleLowerCase());
  const preset={id:existing?.id||`ramp-${crypto.randomUUID()}`,name:cleanName,settings};
  const updated=existing?presets.map(p=>p.id===existing.id?preset:p):[...presets,preset];
  storage.setItem(RAMP_PRESET_STORAGE_KEY,JSON.stringify({version:1,presets:updated}));
  return {presets:updated,preset,replaced:!!existing};
}
