const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Insert "Récords y Actividad" Card
const targetAfterStats = `                    <div class="admin-input-group">
                       <label>Racha Máxima</label>
                       <input type="number" id="edit-user-max-streak">
                    </div>`;

const recordsCard = `
                 <div class="rp-edit-row" style="display: flex; gap: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px; margin-top: 10px;">
                    <div class="admin-input-group">
                       <label>Mejor Puntaje</label>
                       <input type="number" step="0.01" id="edit-user-best-score">
                    </div>
                    <div class="admin-input-group">
                       <label>Mejor Tiempo (ms)</label>
                       <input type="number" id="edit-user-best-time">
                    </div>
                    <div class="admin-input-group">
                       <label>Última Partida</label>
                       <input type="text" id="edit-user-last-played" placeholder="YYYY-MM-DD">
                    </div>
                 </div>`;

content = content.replace(targetAfterStats, targetAfterStats + recordsCard);

// 2. Insert "Acumulados Globales" Card before history
const historyCardStart = `<!-- Partidas Recientes (v1.6.5) -->`;
const accumulatedCard = `
              <!-- Acumulados Globales (v1.7.0) -->
              <div class="edit-card glass-panel" style="grid-column: span 2;">
                 <h4>Acumulados Globales</h4>
                 <div class="metrics-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px;">
                    <div class="admin-input-group">
                       <label>Partidas Jugadas</label>
                       <input type="number" id="edit-user-total-played">
                    </div>
                    <div class="admin-input-group">
                       <label>Puntaje Acum.</label>
                       <input type="number" step="0.01" id="edit-user-total-score">
                    </div>
                    <div class="admin-input-group">
                       <label>Tiempo Acum. (ms)</label>
                       <input type="number" id="edit-user-total-time">
                    </div>
                    <div class="admin-input-group">
                       <label>Errores Peaks</label>
                       <input type="number" id="edit-user-total-peaks">
                    </div>
                    <div class="admin-input-group">
                       <label>Penalizaciones</label>
                       <input type="number" id="edit-user-total-penalty">
                    </div>
                 </div>
              </div>

              <!-- Mapas de Datos JSON (v1.7.0) -->
              <div class="edit-card glass-panel">
                 <h4>Tiempos y Victorias por Etapa</h4>
                 <div class="admin-input-group">
                    <label>stageTimesAccumulated (JSON)</label>
                    <textarea id="edit-user-stage-times" rows="5" class="json-editor"></textarea>
                 </div>
                 <div class="admin-input-group">
                    <label>stageWinsAccumulated (JSON)</label>
                    <textarea id="edit-user-stage-wins" rows="5" class="json-editor"></textarea>
                 </div>
              </div>

              <div class="edit-card glass-panel">
                 <h4>Estadísticas Semanales</h4>
                 <div class="admin-input-group">
                    <label>weekdayStatsAccumulated (JSON)</label>
                    <textarea id="edit-user-weekday-stats" rows="12" class="json-editor"></textarea>
                 </div>
              </div>
`;

content = content.replace(historyCardStart, accumulatedCard + historyCardStart);

fs.writeFileSync(filePath, content, 'utf8');
console.log('index.html updated successfully with deep editing fields (v1.7.0).');
