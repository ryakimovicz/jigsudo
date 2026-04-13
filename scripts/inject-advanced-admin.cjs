const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update the Main Table Header
const oldTableHeader = `                       <th>Registrado</th>
                       <th>Acción</th>`;
const newTableHeader = `                       <th>Registrado</th>
                       <th>Actividad</th>
                       <th>Acción</th>`;
content = content.replace(oldTableHeader, newTableHeader);

// 2. Expand General Information Card
const oldGeneralInfo = `                    <label>Privacidad de Perfil</label>
                    <select id="edit-user-public">
                       <option value="true">Público</option>
                       <option value="false">Privado</option>
                    </select>
                 </div>
              </div>`;

const newGeneralInfo = `                    <label>Privacidad de Perfil</label>
                    <select id="edit-user-public">
                       <option value="true">Público</option>
                       <option value="false">Privado</option>
                    </select>
                 </div>
                 <div class="admin-input-group">
                    <label>Estado de Cuenta</label>
                    <select id="edit-user-verified">
                       <option value="true">Verificado ✅</option>
                       <option value="false">Sin verificar ⚠️</option>
                    </select>
                 </div>
                 <div class="admin-input-group">
                    <label>Miembro desde</label>
                    <input type="text" id="edit-user-reg-date" readonly style="opacity: 0.8">
                 </div>
              </div>`;
content = content.replace(oldGeneralInfo, newGeneralInfo);

// 3. Expand Stats Card with Wins & Max Streak
const oldStatsHeader = `<h4>Ajustes de RP</h4>`;
const newStatsHeader = `<h4>Estadísticas y RP</h4>
                 <div class="rp-edit-row" style="display: flex; gap: 15px; margin-bottom: 10px;">
                    <div class="admin-input-group">
                       <label>Victorias Totales</label>
                       <input type="number" id="edit-user-wins">
                    </div>
                    <div class="admin-input-group">
                       <label>Racha Máxima</label>
                       <input type="number" id="edit-user-max-streak">
                    </div>
                 </div>`;
content = content.replace(oldStatsHeader, newStatsHeader);

// 4. Add History Section at the bottom of the grid
const gridEnd = `<button id="btn-save-user" class="btn-primary" style="padding: 10px 25px; border-radius: 8px;">Guardar Cambios</button>
                 </div>
              </div>
           </div>`;

const historySection = `<button id="btn-save-user" class="btn-primary" style="padding: 10px 25px; border-radius: 8px;">Guardar Cambios</button>
                 </div>
              </div>

              <!-- Partidas Recientes (v1.6.5) -->
              <div class="edit-card glass-panel full-width" style="grid-column: span 2; margin-top: 20px;">
                 <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h4 style="margin: 0;">Historial de Partidas (Últimas 15)</h4>
                    <span id="user-last-online" style="font-size: 0.85rem; color: #a1a1aa;"></span>
                 </div>
                 <div class="admin-table-container compact">
                    <table class="admin-table compact">
                       <thead>
                          <tr>
                             <th>Fecha</th>
                             <th>Semilla</th>
                             <th>Score</th>
                             <th>Tiempo</th>
                             <th>Bono</th>
                             <th>Estado</th>
                          </tr>
                       </thead>
                       <tbody id="admin-user-history-tbody">
                          <!-- Filled by JS -->
                       </tbody>
                    </table>
                    <div id="admin-history-loader" class="loader-small hidden"></div>
                    <div id="admin-history-empty" class="empty-state hidden">No hay partidas registradas.</div>
                 </div>
              </div>
           </div>`;
content = content.replace(gridEnd, historySection);

fs.writeFileSync(filePath, content, 'utf8');
console.log('index.html updated successfully with advanced auditing fields.');
