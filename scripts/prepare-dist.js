import { rename } from 'fs/promises';
import { join } from 'path';

async function main() {
  // Rename the CommonJS output
  await rename(
    join(process.cwd(), 'dist', 'index.js'),
    join(process.cwd(), 'dist', 'index.cjs')
  );

  // The ESM output from the main tsconfig.json will remain as index.js
  console.log('✅ Distribution files prepared successfully');
}

main().catch(console.error);
