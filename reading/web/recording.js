// Audio stays on this device. Study records store only its opaque ID.
let database;
async function db(){
  if(database)return database;
  database=await new Promise((resolve,reject)=>{const r=indexedDB.open('wordweave-audio',1);r.onupgradeneeded=()=>r.result.createObjectStore('clips');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  return database;
}
export async function saveClip(id,blob){const d=await db();await new Promise((resolve,reject)=>{const t=d.transaction('clips','readwrite');t.objectStore('clips').put(blob,id);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}
export async function loadClip(id){const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('clips').objectStore('clips').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
