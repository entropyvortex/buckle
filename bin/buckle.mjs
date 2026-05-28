#!/usr/bin/env node
import('../dist/index.js').then((m) => m.main(process.argv)).catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
