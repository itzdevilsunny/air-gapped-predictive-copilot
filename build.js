#!/usr/bin/env node
/**
 * ISRO NOC Copilot — Vercel Build Script
 * Builds all 3 frontend apps and merges outputs:
 *   frontend/dist/         → served at /
 *   phase1-dashboard/dist/ → served at /ph1/
 *   phase6-dashboard/dist/ → served at /ph6/
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

function run(cmd, cwd = ROOT) {
  console.log(`\n🔨 Running: ${cmd} (in ${path.relative(ROOT, cwd) || '.'})`);
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

function copyDir(src, dest) {
  console.log(`📦 Copying ${path.relative(ROOT, src)} → ${path.relative(ROOT, dest)}`);
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Step 1: Install & build frontend (landing page + main dashboard)
console.log('\n🚀 Step 1/3: Building Frontend (landing page)...');
run('npm install', path.join(ROOT, 'frontend'));
run('npm run build', path.join(ROOT, 'frontend'));

// Step 2: Install & build Phase 1-5 dashboard
console.log('\n🚀 Step 2/3: Building Phase 1-5 NOC Dashboard...');
run('npm install', path.join(ROOT, 'phase1-dashboard'));
run('npm run build', path.join(ROOT, 'phase1-dashboard'));

// Step 3: Install & build Phase 6 self-healing dashboard
console.log('\n🚀 Step 3/3: Building Phase 6 Self-Healing Dashboard...');
run('npm install', path.join(ROOT, 'phase6-dashboard'));
run('npm run build', path.join(ROOT, 'phase6-dashboard'));

// Step 4: Merge all into frontend/dist
console.log('\n📁 Step 4/4: Merging all builds into frontend/dist/...');
const outDir = path.join(ROOT, 'frontend', 'dist');

// Copy phase1-dashboard dist → frontend/dist/ph1/
const ph1Out = path.join(ROOT, 'phase1-dashboard', 'dist');
copyDir(ph1Out, path.join(outDir, 'ph1'));

// Copy phase6-dashboard dist → frontend/dist/ph6/
const ph6Out = path.join(ROOT, 'phase6-dashboard', 'dist');
copyDir(ph6Out, path.join(outDir, 'ph6'));

console.log('\n✅ Build complete! Output structure:');
console.log('  frontend/dist/        → https://your-app.vercel.app/');
console.log('  frontend/dist/ph1/    → https://your-app.vercel.app/ph1/');
console.log('  frontend/dist/ph6/    → https://your-app.vercel.app/ph6/');
