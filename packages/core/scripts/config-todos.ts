import { configTodos } from '../src/config';

const todos = configTodos();
if (todos.length === 0) {
  console.log('All chain/contract config is filled in.');
} else {
  console.log(`${todos.length} config TODO(s) in packages/core/src/config.ts:\n`);
  for (const t of todos) console.log(`  - ${t.key.padEnd(26)} ${t.note}`);
  if (process.argv.includes('--strict')) process.exitCode = 1;
}
