import {build} from 'esbuild';
import {writeFileSync,readFileSync,rmSync} from 'node:fs';
await build({entryPoints:['review-entry.tsx'],bundle:true,minify:true,jsx:'automatic',outfile:'.committee-build/review.js',define:{'process.env.NODE_ENV':'"production"'}});
const js=readFileSync('.committee-build/review.js','utf8').replace(/<\/script/gi,'<\\/script');
const css=readFileSync('.committee-build/review.css','utf8');
writeFileSync('public/committee-demo.html',`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Committee study demonstration</title><style>body{margin:0;background:#eef3f6}${css}</style></head><body><main id="root"></main><script>${js}</script></body></html>`);

rmSync('.committee-build',{recursive:true,force:true});
