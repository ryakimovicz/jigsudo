const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Restore Save button to its original isolated state (Remove Reset from there)
const oldActionsRow = /<div class="actions-row"[^>]*>[\s\S]*?<button id="btn-reset-user"[\s\S]*?<button id="btn-save-user"[\s\S]*?<\/div>/;
const restoredSaveRow = `<div class="actions-row" style="margin-top: 20px; text-align: right; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px;">
                    <button id="btn-save-user" class="btn-primary" style="padding: 10px 25px; border-radius: 8px;">Guardar Cambios</button>
                 </div>`;

if (oldActionsRow.test(content)) {
    content = content.replace(oldActionsRow, restoredSaveRow);
}

// 2. Inject Reset button at the bottom of the admin-user-edit section (after history)
const historyEndTag = `</div>\n                    <div id="admin-history-loader" class="loader-small hidden"></div>\n                    <div id="admin-history-empty" class="empty-state hidden">No hay partidas registradas.</div>\n                 </div>\n              </div>`;

const resetDangerZone = `
              <!-- Danger Zone (v1.8.1) -->
              <div class="edit-card full-width" style="margin-top: 40px; padding-top: 20px; border-top: 1px dashed rgba(239, 68, 68, 0.3); text-align: center;">
                 <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 15px;">Zona de Administración Crítica</p>
                 <button id="btn-reset-user" class="btn-danger" style="padding: 12px 30px; border-radius: 8px; font-size: 0.9rem;">Resetear Todos los Datos del Usuario</button>
              </div>`;

// We inject it inside the 1823: </div> which closes the grid or the main editor container
// Let's use a more unique marker
const editorClosingMarker = `<!-- Filled by JS -->\n                       </tbody>\n                    </table>\n                    <div id="admin-history-loader" class="loader-small hidden"></div>\n                    <div id="admin-history-empty" class="empty-state hidden">No hay partidas registradas.</div>\n                 </div>\n              </div>`;

if (content.includes(editorClosingMarker)) {
    content = content.replace(editorClosingMarker, editorClosingMarker + resetDangerZone);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Reset button moved to the Danger Zone at the bottom of the page.');
