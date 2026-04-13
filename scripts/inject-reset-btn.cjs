const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

const target = /<div class="actions-row"[^>]*>[\s\S]*?<button id="btn-save-user"[^>]*>([\s\S]*?)<\/button>[\s\S]*?<\/div>/;

const replacement = `<div class="actions-row" style="margin-top: 20px; display: flex; justify-content: space-between; align-items: center;">
                     <button id="btn-reset-user" class="btn-danger">Resetear Usuario</button>
                     <button id="btn-save-user" class="btn-primary" style="padding: 10px 25px; border-radius: 8px;">Guardar Cambios</button>
                  </div>`;

if (target.test(content)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Button injected successfully.');
} else {
    console.log('Target not found.');
}
