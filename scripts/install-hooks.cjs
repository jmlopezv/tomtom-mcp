/*
 * Copyright (C) 2025 TomTom Navigation B.V.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Install Git Hooks
 *
 * Copies hook scripts from scripts/hooks/ to .git/hooks/
 * Run automatically during `npm install` via the prepare script.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const HOOKS_SRC = path.join(PROJECT_ROOT, 'scripts', 'hooks');
const HOOKS_DEST = path.join(PROJECT_ROOT, '.git', 'hooks');

// Skip if not in a git repository
if (!fs.existsSync(path.join(PROJECT_ROOT, '.git'))) {
  console.log('Not a git repository, skipping hook installation');
  process.exit(0);
}

// Ensure hooks destination exists
fs.mkdirSync(HOOKS_DEST, { recursive: true });

// Copy each hook
const hooks = fs.readdirSync(HOOKS_SRC).filter(f => !f.endsWith('.sample'));

for (const hook of hooks) {
  const src = path.join(HOOKS_SRC, hook);
  const dest = path.join(HOOKS_DEST, hook);

  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
  console.log(`Installed git hook: ${hook}`);
}
