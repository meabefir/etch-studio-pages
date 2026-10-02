export const outputDefaults={width:2200,height:2200,zoom:1,x:0,y:0,margin:.08,strokes:'view'};
export const outputMaxDimension=10000;
export function validateOutput(value){
  const result={...outputDefaults,...value};
  for(const key of ['width','height'])if(!Number.isInteger(result[key])||result[key]<64||result[key]>outputMaxDimension)throw new Error('Image dimensions must be whole numbers from 64 to 10000 pixels.');
  if(!Number.isFinite(result.zoom)||result.zoom<.001||result.zoom>16||!Number.isFinite(result.x)||!Number.isFinite(result.y)||Math.max(Math.abs(result.x),Math.abs(result.y))>10000)throw new Error('Image framing is outside the supported range.');
  if(!Number.isFinite(result.margin)||result.margin<0||result.margin>.4||!['view','pixels'].includes(result.strokes))throw new Error('Image settings are invalid.');
  return Object.fromEntries(Object.keys(outputDefaults).map(key=>[key,result[key]]));
}
export function outputDimensions(settings,preview=false){const scale=preview?Math.min(1,1000/Math.max(settings.width,settings.height)):1;return {width:Math.max(2,Math.round(settings.width*scale)),height:Math.max(2,Math.round(settings.height*scale))};}
