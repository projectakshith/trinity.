/* Runs before hydration (inlined in <head>) so the first paint already has the right theme. Kept hook-free for the server layout. */
export const THEME_KEY = 'trinity.theme';

export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;
