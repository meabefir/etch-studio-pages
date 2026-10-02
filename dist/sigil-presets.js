import {motifSettings,sigilMotifKeys} from './sigil-data.js';
export const SIGIL_PRESET_STORAGE_KEY='etch.sigil-motifs.v1';
export const motifMatch=(a,b)=>sigilMotifKeys.every(key=>a[key]===b[key]);
export function readSavedMotifs(storage){
  const raw=storage.getItem(SIGIL_PRESET_STORAGE_KEY);if(!raw)return [];
  let doc;try{doc=JSON.parse(raw);}catch{throw new Error('Saved sigil motifs could not be read.');}
  if(doc?.version!==1||!Array.isArray(doc.presets))throw new Error('Saved sigil motifs use an unsupported format.');
  const result=[],ids=new Set();for(const item of doc.presets){try{
    if(!item||typeof item.id!=='string'||!/^saved-[a-z0-9-]{1,80}$/i.test(item.id)||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.trim().length>60)continue;
    result.push({id:item.id,name:item.name.trim(),settings:motifSettings(item.settings)});ids.add(item.id);
  }catch{/* Keep other valid motifs available. */}}return result;
}
export function saveNamedMotif(storage,name,settings){
  const clean=String(name).trim();if(!clean||clean.length>60)throw new Error('Use a motif name between 1 and 60 characters.');
  const valid=motifSettings(settings),presets=readSavedMotifs(storage),existing=presets.find(item=>item.name.toLocaleLowerCase()===clean.toLocaleLowerCase());
  const preset={id:existing?.id||`saved-${crypto.randomUUID()}`,name:clean,settings:valid},updated=existing?presets.map(item=>item.id===existing.id?preset:item):[...presets,preset];
  storage.setItem(SIGIL_PRESET_STORAGE_KEY,JSON.stringify({version:1,presets:updated}));return {presets:updated,preset,replaced:Boolean(existing)};
}
