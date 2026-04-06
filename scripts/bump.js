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
    const oldVersion = getCurrentVersion(configContent);
    if (!oldVersion) {
      console.error('❌ Could not find version in config.js');
      process.exit(1);
    }

    const newVersion = incrementVersion(oldVersion);
    const today = new Date().toISOString().split('T')[0];

    console.log(`🔹 Old Version: ${oldVersion}`);
    console.log(`✨ New Version: ${newVersion}`);
    console.log(`📅 Today: ${today}`);

    // 2. Update config.js (Version and Date)
    configContent = configContent.replace(
      /version:\s*["']v?[\d\.]+["']/,
      `version: "v${newVersion}"`
    );
    configContent = configContent.replace(
      /fechaUpdate:\s*["']\d{4}-\d{2}-\d{2}["']/,
      `fechaUpdate: "${today}"`
    );
    fs.writeFileSync(CONFIG_PATH, configContent);
    console.log('✅ Updated js/config.js');

    // 3. Update index.html (All ?v= occurrences)
    let indexContent = fs.readFileSync(INDEX_PATH, 'utf8');
    // Regex matches ?v= followed by any combination of digits, dots, or placeholders like 999
    // It captures up to the closing quote or whitespace
    const versionRegex = /\?v=[\d\.\w]+/g;
    indexContent = indexContent.replace(versionRegex, `?v=${newVersion}`);
    fs.writeFileSync(INDEX_PATH, indexContent);
    console.log('✅ Updated index.html cache-busting tags');

    console.log(`\n🎉 Version bumped SUCCESSFULLY to v${newVersion}!`);
    console.log('   Now commit and upload these files to your server.');

  } catch (err) {
    console.error('❌ Error during bump:', err);
    process.exit(1);
  }
}

bump();
