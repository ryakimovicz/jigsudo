import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- CONFIGURATION ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'js', 'config.js');

console.log('🚀 Jigsudo Super-Bumper starting...');

/**
 * Reads config.js and returns the current version string (e.g. 1.0.3)
 */
function getCurrentVersion(content) {
  const match = content.match(/version:\s*["']v?([\d\.]+)["']/);
  return match ? match[1] : null;
}

/**
 * Recursively find all HTML files in a directory
 */
function findAllHtmlFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const filePath = path.join(dir, file.name);
    // Ignore common hidden/node directories
    if (file.name.startsWith('.') || file.name === 'node_modules') continue;

    if (file.isDirectory()) {
      findAllHtmlFiles(filePath, fileList);
    } else if (file.name.endsWith('.html')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

/**
 * Main logic
 */
async function bump() {
  try {
    // 1. Read VERSION from config.js
    if (!fs.existsSync(CONFIG_PATH)) {
      console.error(`❌ Could not find config.js at ${CONFIG_PATH}`);
      process.exit(1);
    }
    const configContent = fs.readFileSync(CONFIG_PATH, 'utf8');
    const currentVersion = getCurrentVersion(configContent);
    
    if (!currentVersion) {
      console.error('❌ Could not find version string in config.js');
      process.exit(1);
    }

    console.log(`✨ Suncing all pages to version: v${currentVersion}`);

    // 2. Find all HTML files recursively from Root
    const htmlFiles = findAllHtmlFiles(ROOT_DIR);
    console.log(`🔍 Found ${htmlFiles.length} HTML files to update.`);

    // 3. Update all ?v= tags in those files
    const versionRegex = /\?v=[\d\.\w]+/g; // Matches ?v=1.1, ?v=1.1.0, ?v=beta, etc.

    htmlFiles.forEach(file => {
      let content = fs.readFileSync(file, 'utf8');
      const updatedContent = content.replace(versionRegex, `?v=${currentVersion}`);
      
      if (content !== updatedContent) {
        fs.writeFileSync(file, updatedContent);
        const relativePath = path.relative(ROOT_DIR, file);
        console.log(`✅ Updated: ${relativePath}`);
      }
    });

    console.log(`\n🎉 Project-wide synchronization completed! All pages cache-busted to v${currentVersion}.`);

  } catch (err) {
    console.error('❌ Error during bump:', err);
    process.exit(1);
  }
}

bump();
