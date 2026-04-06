import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- CONFIGURATION ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'js', 'config.js');
const INDEX_PATH = path.join(ROOT_DIR, 'index.html');

console.log('🚀 Jigsudo Version Bumper starting...');

/**
 * Reads config.js and returns the current version string (e.g. 1.0.3)
 */
function getCurrentVersion(content) {
  const match = content.match(/version:\s*["']v?([\d\.]+)["']/);
  return match ? match[1] : null;
}

/**
 * Increments the patch version (e.g. 1.0.3 -> 1.0.4)
 */
function incrementVersion(version) {
  const parts = version.split('.').map(Number);
  if (parts.length < 3) return version + '.1';
  parts[2] += 1;
  return parts.join('.');
}

/**
 * Main logic
 */
async function bump() {
  try {
    // 1. Read CONFIG
    let configContent = fs.readFileSync(CONFIG_PATH, 'utf8');
    const currentVersion = getCurrentVersion(configContent);
    if (!currentVersion) {
      console.error('❌ Could not find version in config.js');
      process.exit(1);
    }

    console.log(`✨ Version detected: ${currentVersion}`);

    // 2. Update index.html (All ?v= occurrences)
    let indexContent = fs.readFileSync(INDEX_PATH, 'utf8');
    const versionRegex = /\?v=[\d\.\w]+/g;
    indexContent = indexContent.replace(versionRegex, `?v=${currentVersion}`);
    fs.writeFileSync(INDEX_PATH, indexContent);
    console.log('✅ Updated index.html cache-busting tags with version ' + currentVersion);

    console.log(`\n🎉 Files synced successfully to v${currentVersion}!`);

  } catch (err) {
    console.error('❌ Error during bump:', err);
    process.exit(1);
  }
}

bump();
