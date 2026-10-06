export const referenceDefaults={position:[0,0,-.35],rotation:[0,0,0],scale:[1,1,1],opacity:.5,visible:true,inFront:false,keepAspect:true};
export const MAX_REFERENCES=32,REFERENCE_IMAGE_SIZE=2048;
const vector=(v,min,max)=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&n>=min&&n<=max);
export function validateReferences(value=[]){
  if(!Array.isArray(value)||value.length>MAX_REFERENCES)throw new Error(`A sigil can contain up to ${MAX_REFERENCES} reference images.`);
  const ids=new Set();return value.map(ref=>{
    if(!ref||typeof ref.id!=='string'||!ref.id||ref.id.length>100||ids.has(ref.id)||typeof ref.name!=='string'||!ref.name.trim()||ref.name.length>100)throw new Error('A reference image has an invalid name or identifier.');ids.add(ref.id);
    if(typeof ref.image!=='string'||ref.image.length>24*1024*1024||!/^data:image\/(?:png|jpeg|webp|gif|bmp|avif);base64,[a-z0-9+/]+={0,2}$/i.test(ref.image))throw new Error('Reference images must contain embedded image data.');
    if(!Number.isInteger(ref.width)||!Number.isInteger(ref.height)||ref.width<1||ref.height<1||ref.width>REFERENCE_IMAGE_SIZE||ref.height>REFERENCE_IMAGE_SIZE)throw new Error('A reference image has invalid dimensions.');
    const settings={...referenceDefaults,...ref};
    if(!vector(settings.position,-50,50)||!vector(settings.rotation,-1000,1000)||!vector(settings.scale,.001,50)||!Number.isFinite(settings.opacity)||settings.opacity<0||settings.opacity>1||!['visible','inFront','keepAspect'].every(key=>typeof settings[key]==='boolean'))throw new Error('A reference image has invalid transforms or appearance settings.');
    return {id:ref.id,name:ref.name.trim(),image:ref.image,width:ref.width,height:ref.height,position:[...settings.position],rotation:[...settings.rotation],scale:[...settings.scale],opacity:settings.opacity,visible:settings.visible,inFront:settings.inFront,keepAspect:settings.keepAspect};
  });
}
export function referenceHistoryState(design){
  // History shares immutable image assets instead of duplicating base64 data for every edit.
  return JSON.stringify(design.references?{...design,references:design.references.map(({image,...ref})=>ref)}:design);
}
export function restoreReferenceHistory(state,assets){
  const design=JSON.parse(state);if(design.references)design.references=design.references.map(ref=>({...ref,image:ref.image||assets.get(ref.id)}));return design;
}
