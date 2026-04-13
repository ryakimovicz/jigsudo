const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add Badge to User Card
if (!content.includes('id="admin-user-count"')) {
    content = content.replace(
        /Gestión de Usuarios<\/h3>\s*<p>Ver perfiles, ajustar RP y gestionar estados.<\/p>/,
        'Gestión de Usuarios</h3>\n                  <p>Ver perfiles, ajustar RP y gestionar estados.</p>\n               </div>\n               <div class="module-badge" id="admin-user-count">0</div>'
    );
}

// 2. Inject User List Detail View
const userListView = `
         <!-- Detail View: User Management (v1.6.0) -->
         <div id="admin-users-list" class="admin-detail-view hidden">
            <div class="detail-header">
               <button class="detail-back-btn back-to-dashboard">← Volver</button>
               <h3>Gestión de Usuarios</h3>
               <div class="header-search">
                  <input type="text" id="admin-user-search" placeholder="Buscar por nombre...">
               </div>
            </div>
            <div class="admin-table-container">
               <table class="admin-table">
                  <thead>
                     <tr>
                        <th>Usuario</th>
                        <th>Total RP</th>
                        <th>Registrado</th>
                        <th>Acción</th>
                     </tr>
                  </thead>
                  <tbody id="admin-users-tbody">
                     <!-- Dynamic User Rows -->
                  </tbody>
               </table>
               <div id="admin-users-loader" class="loader-small hidden"></div>
               <div id="admin-users-empty" class="empty-state hidden">No se encontraron usuarios.</div>
            </div>
         </div>

         <!-- View: User Editor (v1.6.0) -->
         <div id="admin-user-edit" class="admin-detail-view hidden">
            <div class="detail-header">
               <button class="detail-back-btn back-to-users">← Lista</button>
               <h3>Editar Perfil</h3>
            </div>
            
            <div class="user-edit-grid">
               <div class="edit-card glass-panel">
                  <h4>Información General</h4>
                  <div class="admin-input-group">
                     <label>Username</label>
                     <input type="text" id="edit-user-name">
                  </div>
                  <div class="admin-input-group">
                     <label>UID (Solo lectura)</label>
                     <input type="text" id="edit-user-uid" readonly style="opacity: 0.6">
                  </div>
                  <div class="admin-input-group">
                     <label>Privacidad de Perfil</label>
                     <select id="edit-user-public">
                        <option value="true">Público</option>
                        <option value="false">Privado</option>
                     </select>
                  </div>
               </div>

               <div class="edit-card glass-panel">
                  <h4>Ajustes de RP</h4>
                  <div class="rp-edit-row" style="display: flex; gap: 15px;">
                     <div class="admin-input-group">
                        <label>Total RP</label>
                        <input type="number" step="0.001" id="edit-user-total-rp">
                     </div>
                     <div class="admin-input-group">
                        <label>Mensual RP</label>
                        <input type="number" step="0.001" id="edit-user-monthly-rp">
                     </div>
                  </div>
                  <div class="rp-edit-row" style="display: flex; gap: 15px;">
                     <div class="admin-input-group">
                        <label>Daily RP</label>
                        <input type="number" step="0.001" id="edit-user-daily-rp">
                     </div>
                     <div class="admin-input-group">
                        <label>Racha Actual</label>
                        <input type="number" id="edit-user-streak">
                     </div>
                  </div>
                  <div class="actions-row" style="margin-top: 20px; display: flex; justify-content: flex-end;">
                     <button id="btn-save-user" class="btn-primary" style="padding: 10px 25px; border-radius: 8px;">Guardar Cambios</button>
                  </div>
               </div>
            </div>
         </div>
`;

if (!content.includes('id="admin-users-list"')) {
    // Insert before </section>
    content = content.replace('      </section>', `${userListView}\n      </section>`);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('index.html updated successfully with User Management sections.');
