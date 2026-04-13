const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

// Use a more flexible regex that ignores exact space counts
const historySectionEnd = /(<div id="admin-history-empty"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>)/;

const resetDangerZone = `
               <!-- Danger Zone (v1.8.2) -->
               <div class="edit-card full-width" style="grid-column: span 2; margin-top: 40px; padding-top: 20px; border-top: 1px dashed rgba(239, 68, 68, 0.3); text-align: center;">
                  <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 15px;">Zona de Administración Crítica</p>
                  <button id="btn-reset-user" class="btn-danger" style="padding: 12px 30px; border-radius: 8px; font-size: 0.9rem;">Resetear Todos los Datos del Usuario</button>
               </div>`;

if (historySectionEnd.test(content)) {
    content = content.replace(historySectionEnd, `$1${resetDangerZone}`);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Reset button restored successfully at the bottom.');
} else {
    console.log('History section end markers not found.');
}
