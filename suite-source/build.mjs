import { build } from 'vite';
import { cp } from 'node:fs/promises';
await build({mode:'pages',base:'/saengibu-auditor/',publicDir:false,build:{outDir:'../site-build',emptyOutDir:true},worker:{format:'es'}});
for (const name of ['auditor','ai-model','vendor','licenses','suite-cover.svg','favicon.svg','THIRD_PARTY_LICENSES.txt','.nojekyll']) await cp('../'+name,'../site-build/'+name,{recursive:true});
await cp('../site-build/index.html','../site-build/404.html');
