// Путь: yandex/build.mjs
// Собирает всё, что нужно функции, в один файл yandex/function.js (его вставляют в редактор Yandex Cloud).
import { build } from 'esbuild'

await build({
  entryPoints: ['yandex/index.ts'],
  outfile: 'yandex/function.js',
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs', // Yandex Cloud запускает обычный CommonJS: exports.handler
  legalComments: 'none',
})
console.log('Готово: yandex/function.js')
