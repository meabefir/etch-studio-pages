import {hatchingSettings,saveNamedPreset,readSavedPresets} from './settings.js?v=cross-angle-1';
import {motifSettings} from './sigil-data.js';
import {saveNamedMotif,readSavedMotifs} from './sigil-presets.js';
import {rampSettings,saveNamedRampPreset,readSavedRampPresets} from './toon-presets.js?v=stop-blending-1';
import {validateScene} from './scenes.js?v=cross-angle-1';

const types={
  hatching:{label:'preset',validate:hatchingSettings,save:saveNamedPreset,read:readSavedPresets},
  'sigil-motif':{label:'motif',validate:motifSettings,save:saveNamedMotif,read:readSavedMotifs},
  'color-ramp':{label:'ramp',validate:rampSettings,save:saveNamedRampPreset,read:readSavedRampPresets},
  scene:{label:'scene',validate:validateScene}
};
const typeOf=type=>{const info=typeof type==='string'&&Object.hasOwn(types,type)&&types[type];if(!info)throw new Error('This file has an unsupported preset type.');return info;};
export function sharedDocument(type,name,data){
  const info=typeOf(type),limit=type==='scene'?100:60;
  if(typeof name!=='string'||!name.trim()||name.trim().length>limit)throw new Error(`Use a ${info.label} name between 1 and ${limit} characters.`);
  return {format:'etch-studio',version:1,type,name:name.trim(),data:info.validate(data)};
}
export function encodeSharedFile(type,name,data){return JSON.stringify(sharedDocument(type,name,data),null,2)+'\n';}
export function decodeSharedFile(text,expectedType){
  let doc;try{doc=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new Error('This file is not valid JSON. Choose a file downloaded from Etch.');}
  if(doc?.format!=='etch-studio'||doc.version!==1)throw new Error('This file is not a supported Etch preset or scene file.');
  const info=typeOf(doc.type);typeOf(expectedType);
  if(doc.type!==expectedType)throw new Error(`This is a ${info.label} file. Load it in the ${doc.type==='scene'?'Scene':doc.type==='hatching'?'Hatching':doc.type==='sigil-motif'?'Sigil motif':'Color ramp'} section.`);
  return sharedDocument(doc.type,doc.name,doc.data);
}
export async function readSharedFile(file,type){
  if(!file||typeof file.text!=='function')throw new Error('Choose a preset or scene file.');
  if(file.size>64*1024*1024)throw new Error('Preset and scene files must be smaller than 64 MB. Model geometry belongs in separate OBJ or GLB files.');
  return decodeSharedFile(await file.text(),type);
}
export function sharedFilename(type,name){
  typeOf(type);const clean=name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/g,'').slice(0,80)||'Untitled';
  return `etch-${clean}.${type}.json`;
}
export function downloadSharedFile(type,name,data){
  const text=encodeSharedFile(type,name,data),url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download=sharedFilename(type,name);document.body.append(link);try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
export function importedName(name,records,limit=60){
  const used=new Set(records.map(record=>record.name.toLocaleLowerCase()));let result=name;
  for(let i=2;used.has(result.toLocaleLowerCase());i++){const suffix=` (${i})`;result=name.slice(0,limit-suffix.length).trimEnd()+suffix;}
  return result;
}
export function importSharedPreset(storage,doc,records){
  doc=sharedDocument(doc.type,doc.name,doc.data);const info=typeOf(doc.type);if(!info.save)throw new Error('Use the scene importer for scene files.');
  let name=importedName(doc.name,records);
  try{name=importedName(doc.name,[...records,...info.read(storage)]);return {...info.save(storage,name,doc.data),storageError:null};}
  catch(error){
    // File loading remains usable when browser storage is full or unavailable.
    const preset={id:`${doc.type==='color-ramp'?'ramp':'saved'}-${crypto.randomUUID()}`,name,settings:doc.data};
    return {presets:[...records,preset],preset,replaced:false,storageError:error};
  }
}
export function presetImportMessage(result,label){return `Loaded ${label} “${result.preset.name}” from file.${result.storageError?' Browser storage is unavailable; download a copy to keep it.':''}`;}

export function attachFileControls(parent,{type,getName,getData,onImport,onMessage,getDisabled=()=>false}){
  const info=typeOf(type),row=document.createElement('div');row.className='preset-file-actions';
  const download=document.createElement('button'),load=document.createElement('button'),input=document.createElement('input');
  for(const b of [download,load]){b.type='button';b.className='button subtle';}
  download.textContent=`Download ${info.label}`;load.textContent='Load from file';load.setAttribute('aria-label',`Load ${info.label} from file`);
  download.title=`Download the current ${info.label} as a shareable JSON file.`;load.title=`Choose an Etch ${info.label} JSON file from your computer.`;
  input.type='file';input.accept='.json,application/json';input.hidden=true;input.setAttribute('aria-label',`${info.label} file`);row.append(download,load,input);parent.append(row);
  let busy=false;const refresh=()=>{download.disabled=load.disabled=busy||getDisabled();};
  const guard=()=>{if(busy||getDisabled())throw new Error('Wait for the current load or save to finish.');};
  download.onclick=()=>{try{guard();downloadSharedFile(type,getName(),getData());}catch(error){onMessage(error.message,true);}};
  load.onclick=()=>{try{guard();input.value='';input.click();}catch(error){onMessage(error.message,true);}};
  input.onchange=async()=>{const file=input.files[0];if(!file)return;try{guard();busy=true;refresh();const doc=await readSharedFile(file,type);await onImport(doc);}catch(error){onMessage(error.message||'This file could not be loaded.',true);}finally{busy=false;input.value='';refresh();}};
  refresh();return {download,load,input,refresh};
}
