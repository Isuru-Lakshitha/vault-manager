import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
const adapter=fileURLToPath(new URL('./test/browser/firestore.js',import.meta.url));
export default defineConfig({plugins:[{name:'isolated-test-data',enforce:'pre',configureServer(server){server.middlewares.use((req,res,next)=>{if(/^\/test\/browser\/(dashboard|accounts|transactions|cards|settings)(\?.*)?$/.test(req.url || ''))req.url='/test/browser/index.html';next();});},resolveId(source){if(source==='firebase/firestore'||/(^|\/)firebase(?:\.js)?$/.test(source))return adapter;}},react()],build:{rollupOptions:{input:fileURLToPath(new URL('./test/browser/index.html',import.meta.url))}},optimizeDeps:{entries:['test/browser/index.html']},server:{host:'127.0.0.1',port:5177,strictPort:true}});
