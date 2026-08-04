export function getToken(): string | null { return typeof window === 'undefined' ? null : localStorage.getItem('evolvia_token'); }
export function saveSession(token:string,user:unknown):void { localStorage.setItem('evolvia_token',token); localStorage.setItem('evolvia_user',JSON.stringify(user)); }
export function clearSession():void { localStorage.removeItem('evolvia_token'); localStorage.removeItem('evolvia_user'); }
export async function api<T>(path:string, options:RequestInit={}):Promise<T> {
  const headers=new Headers(options.headers); headers.set('Content-Type','application/json');
  const token=getToken(); if(token) headers.set('Authorization',`Bearer ${token}`);
  const response=await fetch(`/api${path}`,{...options,headers});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){ const m=(payload as {message?:string|string[]}).message; throw new Error(Array.isArray(m)?m.join(' '):m||'Não foi possível concluir a operação.'); }
  return payload as T;
}
