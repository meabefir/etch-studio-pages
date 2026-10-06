import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';

export function parseMeshOBJ(text){
  // OBJLoader uses one primitive type per object. A loose edge or point can
  // change an entire polygon object into LineSegments/Points and mix incompatible
  // vertex buffers. This geometry-only editor imports faces, so remove those
  // records before parsing while preserving objects, groups and global indices.
  const faces=text.replace(/\r\n/g,'\n').replace(/\\\n/g,'').replace(/^[ \t]*(?:l|p)(?:[ \t][^\n]*)?$/gm,'');
  return new OBJLoader().parse(faces);
}
