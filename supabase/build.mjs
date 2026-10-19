// Путь: supabase/build.mjs
// Собирает функцию notify вместе с доменной логикой в один файл (его вставляют в редактор Supabase).
import { build } from 'esbuild'

await build({
  entryPoints: ['supabase/functions/notify/index.ts'],
  outfile: 'supabase/functions/notify/function.js',
  bundle: true,
  platform: 'neutral',
  format: 'esm',
  target: 'es2022',
  legalComments: 'none',
})
console.log('Готово: supabase/functions/notify/function.js')
