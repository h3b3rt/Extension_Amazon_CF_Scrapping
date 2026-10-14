// "Descargar Excel" desde una página de la extensión (popup y vista previa).
import { getConfig } from './config.js';
import { exportList } from './export.js';
import { getJobs, sinFamilia } from './jobs.js';
import { familiasConfig } from './sites.js';

// Con productos sin familia verificada (Amazon de grupos con variaciones, Kate Spade
// siempre), la exportación va a la cola del service worker, que la verifica antes de
// descargar (puede tardar minutos): devuelve { encolada: { pendientes, posicion } }.
// Si no hay nada que verificar, descarga en el momento y devuelve el resumen de exportList.
export async function descargarLista(collected, groups, categories, nombre = '') {
  const config = await getConfig();
  const pendientes = familiasConfig(config) ? sinFamilia(collected, groups, config).length : 0;
  if (!pendientes) return exportList(collected, groups, config, categories, nombre);
  const st = await getJobs();
  if ([st.actual, ...st.cola].some(j => j?.tipo === 'exportar')) throw new Error('Ya hay una exportación en curso o en la cola.');
  const r = await chrome.runtime.sendMessage({ type: 'enqueue', job: { tipo: 'exportar', nombreGrupo: 'Exportar Excel', fileName: nombre } });
  if (!r || r.error) throw new Error(`No se pudo iniciar la exportación${r?.error ? `: ${r.error}` : '.'}`);
  return { encolada: { pendientes, posicion: r.posicion } };
}

// Aviso de una exportación que quedó en la cola (`donde`: lo que se puede cerrar).
export function encoladaTxt({ pendientes, posicion }, donde = 'este popup') {
  const minutos = Math.max(1, Math.round(pendientes * 3.5 / 60));
  return `Antes de descargar se verificará la familia de ${pendientes} producto${pendientes === 1 ? '' : 's'} (unos ${minutos} min)${posicion ? ', al terminar la extracción en curso' : ''}.\nPuedes cerrar ${donde}: el Excel se descargará solo.`;
}
