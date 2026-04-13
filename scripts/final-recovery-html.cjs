const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Define the correct Admin Section block
const adminSection = `      <section id="admin-section" class="admin-container hidden">
        <header class="admin-header">
           <button id="admin-back-btn" class="header-back-btn" title="Volver al Inicio">←</button>
           <h2>🛡️ Panel de Administración</h2>
        </header>
        
        <div class="admin-dashboard-grid">
           <!-- Module Card: Referee Reports -->
           <div class="admin-module-card glass-panel clickable" id="admin-module-referee">
              <div class="module-icon">🛡️</div>
              <div class="module-info">
                 <h3 data-i18n="admin_referee_title">Reportes del Árbitro</h3>
                 <p data-i18n="admin_referee_desc">Vigilancia de integridad y alertas de sospecha.</p>
              </div>
              <div class="module-badge" id="referee-alert-count">0</div>
           </div>
           
           <!-- Module Card: User Management (v1.6.0) -->
           <div class="admin-module-card glass-panel clickable" id="admin-module-users">
              <div class="module-icon">👥</div>
              <div class="module-info">
                 <h3>Gestión de Usuarios</h3>
                 <p>Ver perfiles, ajustar RP y gestionar estados.</p>
              </div>
              <div class="module-badge" id="admin-user-count">0</div>
           </div>
        </div>

        <!-- Detail View: Referee Audit -->
        <div id="admin-referee-detail" class="admin-detail-view hidden">
           <div class="detail-header">
              <button class="detail-back-btn back-to-dashboard">← Volver</button>
              <h3>Auditoría del Árbitro</h3>
              <button id="btn-refresh-reports" class="btn-refresh">🔄</button>
           </div>
           <div class="admin-table-container">
              <table class="admin-table">
                 <thead>
                    <tr>
                       <th id="header-sort-date" class="sortable">Fecha (UTC)</th>
                       <th id="header-sort-user" class="sortable">Usuario</th>
                       <th>Semilla</th>
                       <th>Nivel</th>
                       <th>Tiempo</th>
                       <th>Razón</th>
                    </tr>
                 </thead>
                 <tbody id="admin-reports-tbody">
                    <!-- Dynamic Rows -->
                 </tbody>
              </table>
              <div id="admin-reports-loader" class="loader-small hidden"></div>
              <div id="admin-reports-empty" class="empty-state">No hay reportes recientes.</div>
           </div>
        </div>

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
      </section>`;

// 2. Identify the range to replace
const sectionStart = '<section id="admin-section"';
const sectionEnd = '</section>';

const startIndex = content.indexOf(sectionStart);
if (startIndex !== -1) {
    // Find the NEXT </section> after the user management injection
    // To be safe, find the last script tag or footer as a boundary
    const footerIndex = content.indexOf('<footer');
    
    // Within [startIndex, footerIndex], find the LAST </section>
    const sectionChunk = content.substring(startIndex, footerIndex);
    const lastSectionInChunk = sectionChunk.lastIndexOf(sectionEnd);
    
    if (lastSectionInChunk !== -1) {
        const absoluteEndIndex = startIndex + lastSectionInChunk + sectionEnd.length;
        
        console.log('Replacing Admin section from', startIndex, 'to', absoluteEndIndex);
        
        const before = content.substring(0, startIndex);
        const after = content.substring(absoluteEndIndex);
        
        const newContent = before + adminSection + after;
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log('Admin section reconstructed successfully.');
    } else {
        console.log('Could not find closing section tag.');
    }
} else {
    console.log('Could not find Admin section start.');
}
