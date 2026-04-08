import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- CONFIGURATION ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'js', 'config.js');

console.log('🚀 Jigsudo Deep-Bumper starting...');

/**
 * Reads config.js and returns the current version string (e.g. 1.0.3)
 */
function getCurrentVersion(content) {
  const match = content.match(/version:\s*["']v?([\d\.]+)["']/);
  return match ? match[1] : null;
}

/**
 * Recursively find all HTML and JS files in a directory
 */
function findAllTargetFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const filePath = path.join(dir, file.name);
    // Ignore common hidden/node directories
    if (file.name.startsWith('.') || file.name === 'node_modules') continue;

    if (file.isDirectory()) {
      findAllTargetFiles(filePath, fileList);
    } else {
      const ext = path.extname(file.name);
      if (ext === '.html' || ext === '.js') {
        fileList.push(filePath);
      }
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
      console.log(`❌ Could not find config.js at ${CONFIG_PATH}`);
      process.exit(1);
    }
    const configContent = fs.readFileSync(CONFIG_PATH, 'utf8');
    const currentVersion = getCurrentVersion(configContent);
    
    if (!currentVersion) {
      console.log('❌ Could not find version string in config.js');
      process.exit(1);
    }

    console.log(`✨ Syncing all modules to version: v${currentVersion}`);

    // 2. Find all relevant files
    const targets = findAllTargetFiles(ROOT_DIR);
    console.log(`🔍 Found ${targets.length} files to update.`);

    // 3. Define regex patterns
    // Matches ?v=1.1, ?v=1.1.0, etc. (for HTML attributes)
    const attrVersionRegex = /\?v=[\d\.\w]+/g; 
    
    // Matches static: import/from "./path.js?v=1.1.10"
    // Matches dynamic: import("./path.js?v=1.1.10")
    // Group 1: from|import, Group 2: optional space/parenthesis, Group 3: quote, Group 4: ./ or ../, Group 5: filename, Group 6: optional version, Group 7: optional matching quote (group 3 reference), Group 8: optional closing parenthesis
    const jsImportRegex = /(from|import)(\s*\(?\s*)(['"])(\.\/|\.\.\/)([^'"]+?\.js)(\?v=[\d\.\w]+)?\3(\s*\)?)?/g;

    targets.forEach(file => {
      let content = fs.readFileSync(file, 'utf8');
      let updatedContent = content;

      const ext = path.extname(file);
      
      if (ext === '.html') {
        // Update all ?v= tags in HTML (CSS, scripts, etc.)
        updatedContent = content.replace(attrVersionRegex, `?v=${currentVersion}`);
      } 
      else if (ext === '.js') {
        // Don't update config.js itself as it's the source of truth
        if (file === CONFIG_PATH) return;

        // Update all relative JS imports to include the version
        updatedContent = content.replace(jsImportRegex, (match, p1, p2, p3, p4, p5, p6, p7) => {
          // p1: keyword, p2: ( or space, p3: quote, p4: ./, p5: filename, p7: ) or none
          const closeParen = p7 || '';
          return `${p1}${p2}${p3}${p4}${p5}?v=${currentVersion}${p3}${closeParen}`;
        });
      }

      if (content !== updatedContent) {
        fs.writeFileSync(file, updatedContent);
        const relativePath = path.relative(ROOT_DIR, file);
        console.log(`✅ Updated: ${relativePath}`);
      }
    });

    console.log(`\n🎉 Project-wide Deep Sync completed! v${currentVersion} propagated.`);

  } catch (err) {
    console.error('❌ Error during bump:', err);
    process.exit(1);
  }
}

bump();
