// Selector de categoría, único para el popup (en el formulario de "Extraer") y la
// vista previa (en una ventana). Modos "🔍 Buscar" (lista que filtra mientras se
// escribe, con flechas y Enter) y "☰ Por niveles" (tres listas en cascada),
// "↻ Actualizar" y las categorías usadas recientemente. Guarda en storage.local las
// claves recentCategories (rutas "P / S / T") y categoryMode.
// crearSelector(...) arma el selector dentro de la página; elegirCategoria(...) lo
// muestra en una ventana. La categoría elegida tiene la forma
// { principal, secundaria, terciaria, codigo, ruta }. Solo acepta una categoría del
// catálogo (con código): sin código el Excel no la usaría.
// Todo se arma con textContent.
import { getCategories, refreshCategories, searchCategories, categoryLabel, findCategory, normalizeText, sourceLabel } from './categories.js';
import { el } from './dom.js';

const MAX_RECIENTES = 15;
let instancias = 0;

const catDe = c => ({ principal: c.primaria, secundaria: c.secundaria, terciaria: c.terciaria, codigo: c.codigo, ruta: categoryLabel(c) });

// Resalta (con <mark>) las partes del texto que coinciden, ignorando tildes.
function resaltar(texto, terminos) {
  const frag = document.createDocumentFragment();
  if (!terminos.length) { frag.append(texto); return frag; }
  let norm = '';
  const mapa = [];
  for (let i = 0; i < texto.length; i++) {
    for (const ch of texto[i].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()) { norm += ch; mapa.push(i); }
  }
  const marcado = new Array(texto.length).fill(false);
  for (const t of terminos) {
    for (let i = norm.indexOf(t); i !== -1; i = norm.indexOf(t, i + t.length)) {
      for (let k = i; k < i + t.length; k++) marcado[mapa[k]] = true;
    }
  }
  let buf = '';
  let on = false;
  const volcar = () => {
    if (!buf) return;
    frag.append(on ? el('mark', { textContent: buf }) : buf);
    buf = '';
  };
  for (let i = 0; i < texto.length; i++) {
    if (marcado[i] !== on) { volcar(); on = marcado[i]; }
    buf += texto[i];
  }
  volcar();
  return frag;
}

// La ruta usada pasa al principio de las recientes.
export async function recordarCategoria(ruta) {
  const { recentCategories = [] } = await chrome.storage.local.get('recentCategories');
  const k = normalizeText(ruta);
  await chrome.storage.local.set({ recentCategories: [ruta, ...recentCategories.filter(c => normalizeText(c) !== k)].slice(0, MAX_RECIENTES) });
}

// Selector dentro de la página. `actual`: ruta o código a proponer; `recientes` y
// `modo` (search | browse) vienen de storage.local. `onEnter`: Enter con la lista
// cerrada (sin él, el Enter no hace nada: nunca envía el formulario). `onEscape`: Esc
// con la lista cerrada. `soloAlEscribir` (popup): con el campo vacío no se abre la
// lista (ni las recientes) al entrar en él; solo al escribir o con las flechas.
// El catálogo se entrega con cargar(): mientras no llega, dice "Cargando categorías…".
export function crearSelector({ actual = '', recientes = [], modo = 'search', onEnter = null, onEscape = null, soloAlEscribir = false } = {}) {
  const id = `sc${++instancias}`;
  let catalogo = null;
  const estado = { modo: modo === 'browse' ? 'browse' : 'search', elegida: null, lista: [], activa: -1, apagado: false, mensaje: null };

  const input = el('input', { className: 'sc-input', type: 'text', autocomplete: 'off', spellcheck: false, placeholder: 'Escribe para buscar: ollas, audífonos, CF0101…' });
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-label', 'Buscar categoría');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', `${id}-lista`);
  const lista = el('ul', { className: 'sc-list', id: `${id}-lista`, hidden: true });
  lista.setAttribute('role', 'listbox');
  const niveles = [1, 2, 3].map(() => el('select', { className: 'sc-select' }));
  const nombresNivel = ['Principal', 'Secundaria', 'Terciaria'];
  niveles.forEach((s, i) => s.setAttribute('aria-label', `Categoría ${nombresNivel[i].toLowerCase()}`));
  const pista = el('div', { className: 'sc-hint' });
  pista.setAttribute('aria-live', 'polite');
  const bBuscar = el('button', { type: 'button', className: 'sc-tab', textContent: '🔍 Buscar' });
  const bNiveles = el('button', { type: 'button', className: 'sc-tab', textContent: '☰ Por niveles' });
  const bActualizar = el('button', { type: 'button', className: 'sc-refresh', textContent: '↻ Actualizar', title: 'Descargar la lista de categorías más reciente' });
  const grupoBuscar = el('div', { className: 'sc-group' }, input, lista);
  const grupoNiveles = el('div', { className: 'sc-group sc-levels' },
    ...niveles.map((s, i) => el('label', {}, el('span', { textContent: nombresNivel[i] }), s)));
  const nodo = el('div', { className: 'sc-picker' },
    el('div', { className: 'sc-tabs' }, bBuscar, bNiveles, el('div', { className: 'grow' }), bActualizar),
    grupoBuscar, grupoNiveles, pista);
  const items = () => catalogo?.items || [];

  // ---- pista bajo el campo: un mensaje (error, resultado de Actualizar) o el código ----
  const pintarPista = () => {
    let t = estado.mensaje?.texto || '';
    if (!t && !estado.apagado) {
      if (!catalogo) t = 'Cargando categorías…';
      else if (estado.elegida) t = `Código: ${estado.elegida.codigo}`;
      else if (!items().length) t = 'Aún no hay categorías cargadas. Pulsa "↻ Actualizar".';
    }
    pista.textContent = t;
    pista.className = `sc-hint${estado.mensaje?.tipo ? ` ${estado.mensaje.tipo}` : ''}`;
  };
  const avisar = (texto = '', tipo = 'error') => {
    estado.mensaje = texto ? { texto, tipo } : null;
    pintarPista();
  };
  const elegir = c => {
    estado.elegida = c;
    estado.mensaje = null;
    pintarPista();
  };

  // ---- modo Buscar ----
  const entradas = () => {
    const escrito = estado.elegida && input.value === categoryLabel(estado.elegida) ? '' : input.value.trim();
    if (escrito) return { q: escrito, grupos: [{ titulo: '', items: searchCategories(items(), escrito, 50) }] };
    const usadas = recientes.map(r => findCategory(items(), r)).filter(Boolean);
    return { q: '', grupos: usadas.length ? [{ titulo: 'Usadas recientemente', items: usadas }] : [], vacio: usadas.length ? '' : `Escribe para buscar entre ${items().length} categorías.` };
  };
  const marcarActiva = () => {
    lista.querySelectorAll('[role=option]').forEach(li => {
      const on = li.dataset.i === String(estado.activa);
      li.classList.toggle('active', on);
      li.setAttribute('aria-selected', String(on));
      if (on) li.scrollIntoView?.({ block: 'nearest' });
    });
    if (estado.activa >= 0) input.setAttribute('aria-activedescendant', `${id}-op${estado.activa}`);
    else input.removeAttribute('aria-activedescendant');
  };
  const abrirLista = abierta => { lista.hidden = !abierta; input.setAttribute('aria-expanded', String(abierta)); };
  const elegirDeLista = i => {
    const c = estado.lista[i];
    if (!c) return;
    input.value = categoryLabel(c);
    abrirLista(false);
    elegir(c);
  };
  const pintarLista = (forzar = false) => {
    if (!catalogo || estado.apagado) return abrirLista(false);
    const { q, grupos, vacio = '' } = entradas();
    if (soloAlEscribir && !q && !forzar) return abrirLista(false);
    estado.lista = grupos.flatMap(g => g.items);
    const terminos = normalizeText(q).split(' ').filter(t => t && t !== '/');
    const nodos = [];
    let i = 0;
    for (const g of grupos) {
      if (g.titulo) nodos.push(el('li', { className: 'group', textContent: g.titulo }));
      for (const c of g.items) {
        const n = i++;
        const li = el('li', { id: `${id}-op${n}` },
          el('span', { className: 'path' }, resaltar(`${c.primaria} / ${c.secundaria} / `, terminos), el('b', {}, resaltar(c.terciaria, terminos))),
          el('span', { className: 'code' }, resaltar(c.codigo, terminos)));
        li.setAttribute('role', 'option');
        li.dataset.i = n;
        // mousedown: elegir antes de que el campo pierda el foco.
        li.addEventListener('mousedown', e => { e.preventDefault(); elegirDeLista(n); });
        li.addEventListener('mousemove', () => { if (estado.activa !== n) { estado.activa = n; marcarActiva(); } });
        nodos.push(li);
      }
    }
    if (!estado.lista.length && items().length) {
      const t = q ? 'Sin resultados. Prueba con otra palabra o con el código.' : vacio;
      if (t) nodos.push(el('li', { className: 'empty', textContent: t }));
    }
    lista.replaceChildren(...nodos);
    estado.activa = q && estado.lista.length ? 0 : -1;
    marcarActiva();
    abrirLista(nodos.length > 0);
  };
  input.addEventListener('input', () => {
    if (estado.elegida && input.value !== categoryLabel(estado.elegida)) elegir(null);
    else avisar('');
    pintarLista();
  });
  input.addEventListener('focus', () => pintarLista());
  input.addEventListener('blur', () => setTimeout(() => abrirLista(false), 120));
  input.addEventListener('keydown', e => {
    const abierta = !lista.hidden;
    const n = estado.lista.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!abierta) return pintarLista(true);
      if (!n) return;
      const paso = e.key === 'ArrowDown' ? 1 : -1;
      estado.activa = estado.activa < 0 ? (paso > 0 ? 0 : n - 1) : (estado.activa + paso + n) % n;
      marcarActiva();
    } else if (e.key === 'Enter') {
      // Nunca envía el formulario: la extracción empieza solo con el botón.
      e.preventDefault();
      if (abierta && estado.activa >= 0) elegirDeLista(estado.activa);
      else if (onEnter) onEnter();
    } else if (e.key === 'Escape' && abierta) {
      e.preventDefault();
      e.stopPropagation();
      abrirLista(false);
    }
  });
  nodo.addEventListener('keydown', e => {
    if (e.key === 'Escape' && onEscape && !e.defaultPrevented) { e.preventDefault(); onEscape(); }
  });

  // ---- modo Por niveles ----
  const unicos = arr => [...new Set(arr)].sort((a, b) => a.localeCompare(b, 'es'));
  const llenar = (sel, valores, valor, vacio) => {
    sel.replaceChildren(el('option', { value: '', textContent: vacio }), ...valores.map(v => el('option', { value: v, textContent: v })));
    sel.value = valores.includes(valor) ? valor : '';
    sel.disabled = estado.apagado || !valores.length;
  };
  const pintarNiveles = (c = estado.elegida) => {
    const [n1, n2, n3] = niveles;
    llenar(n1, unicos(items().map(x => x.primaria)), c?.primaria, 'Elige…');
    llenar(n2, n1.value ? unicos(items().filter(x => x.primaria === n1.value).map(x => x.secundaria)) : [], c?.secundaria, n1.value ? 'Elige…' : 'Elige primero la principal');
    llenar(n3, n2.value ? unicos(items().filter(x => x.primaria === n1.value && x.secundaria === n2.value).map(x => x.terciaria)) : [], c?.terciaria, n2.value ? 'Elige…' : 'Elige primero la secundaria');
  };
  niveles.forEach((sel, i) => sel.addEventListener('change', () => {
    const [a, b, c] = niveles.map(s => s.value);
    pintarNiveles({ primaria: a, secundaria: i >= 1 ? b : '', terciaria: i >= 2 ? c : '' });
    const hallada = items().find(x => x.primaria === niveles[0].value && x.secundaria === niveles[1].value && x.terciaria === niveles[2].value) || null;
    elegir(hallada);
    input.value = hallada ? categoryLabel(hallada) : '';
    // Avanzar al siguiente nivel en cuanto se elige uno.
    if (i < 2 && sel.value && !niveles[i + 1].disabled) niveles[i + 1].focus();
  }));

  const enfocar = () => {
    if (estado.apagado) return;
    if (estado.modo === 'browse') (niveles.find(s => !s.value && !s.disabled) || niveles[2]).focus();
    else { input.focus(); input.select(); }
  };
  const ponerModo = (m, foco = true) => {
    estado.modo = m === 'browse' && items().length ? 'browse' : 'search';
    bNiveles.disabled = !items().length;
    bNiveles.title = items().length ? '' : 'Disponible cuando haya categorías cargadas';
    for (const [b, on] of [[bBuscar, estado.modo === 'search'], [bNiveles, estado.modo === 'browse']]) {
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    grupoBuscar.hidden = estado.modo !== 'search';
    grupoNiveles.hidden = estado.modo !== 'browse';
    abrirLista(false);
    // Lo elegido en un modo se ve en el otro.
    if (estado.modo === 'browse') pintarNiveles();
    else if (estado.elegida) input.value = categoryLabel(estado.elegida);
    if (foco) enfocar();
  };
  bBuscar.addEventListener('click', () => { ponerModo('search'); chrome.storage.local.set({ categoryMode: 'search' }); });
  bNiveles.addEventListener('click', () => { ponerModo('browse'); chrome.storage.local.set({ categoryMode: 'browse' }); });

  // Catálogo nuevo (al abrir, al llegar la lista fresca o tras "Actualizar"): se
  // conserva lo elegido si sigue existiendo, o lo escrito si coincide con una ruta.
  const cargar = c => {
    const primera = !catalogo;
    catalogo = c;
    if (estado.elegida) estado.elegida = items().find(x => x.codigo === estado.elegida.codigo) || null;
    else if (primera && actual) estado.elegida = findCategory(items(), actual);
    else if (input.value) estado.elegida = findCategory(items(), input.value);
    if (estado.elegida && (primera || !input.value)) input.value = categoryLabel(estado.elegida);
    ponerModo(estado.modo, false);
    if (c.error && !items().length) avisar(`No se pudieron cargar las categorías: ${c.error}`);
    else pintarPista();
    if (document.activeElement === input) pintarLista();
  };
  bActualizar.addEventListener('click', async () => {
    bActualizar.disabled = true;
    bActualizar.textContent = '↻ Actualizando…';
    const c = await refreshCategories();
    cargar(c);
    bActualizar.disabled = false;
    bActualizar.textContent = '↻ Actualizar';
    if (c.error) {
      const respaldo = c.items.length ? ` Se sigue usando la lista anterior (${c.items.length} categorías).` : '';
      avisar(`⚠ No se pudo actualizar.${respaldo}\n${c.error}`);
    } else {
      avisar(`✓ ${c.items.length} categorías actualizadas (${sourceLabel(c.source)}).`, 'ok');
    }
  });

  // "No llenar categoría" (popup): campos desactivados y sin pista.
  const apagar = on => {
    estado.apagado = on;
    estado.mensaje = null;
    input.disabled = on;
    abrirLista(false);
    if (estado.modo === 'browse') pintarNiveles();
    pintarPista();
  };

  // Categoría elegida: { ok, cat } o { ok: false, error } con el motivo.
  const leer = () => {
    const c = estado.elegida || (estado.modo === 'search' ? findCategory(items(), input.value) : null);
    if (c) return { ok: true, cat: catDe(c) };
    if (estado.modo === 'browse') return { ok: false, error: 'Completa los tres niveles: principal, secundaria y terciaria.' };
    if (!input.value.trim()) return { ok: false, error: 'Escribe o elige una categoría.' };
    return { ok: false, error: 'Elige una categoría de la lista.' };
  };

  ponerModo(estado.modo, false);
  pintarPista();
  return { nodo, cargar, leer, avisar, enfocar, apagar, catalogo: () => catalogo };
}

// Ventana con el selector (vista previa). Resuelve la categoría elegida o null
// (Cancelar, Esc, clic fuera). Con `limpiar: true` muestra además "Quitar
// categoría", que resuelve { limpiar: true }.
export async function elegirCategoria({ titulo = 'Asignar categoría', subtitulo = '', actual = '', limpiar = false } = {}) {
  const { categoryMode = 'search', recentCategories = [] } = await chrome.storage.local.get(['categoryMode', 'recentCategories']);
  const cancelar = el('button', { type: 'button', className: 'ghost', textContent: 'Cancelar' });
  const bLimpiar = limpiar ? el('button', { type: 'button', className: 'ghost sc-clear', textContent: '✕ Quitar categoría', title: 'Dejar sin categoría (se elige en la plantilla)' }) : null;
  const aceptar = el('button', { type: 'button', className: 'primary', textContent: 'Asignar categoría' });
  const selector = crearSelector({ actual, recientes: recentCategories, modo: categoryMode, onEnter: () => aceptar.click() });
  const modal = el('div', { className: 'modal sc-modal' },
    el('h3', { className: 'sc-title', textContent: titulo }),
    subtitulo ? el('p', { className: 'sc-sub', textContent: subtitulo }) : null,
    selector.nodo,
    el('div', { className: 'actions' }, bLimpiar, el('div', { className: 'grow' }), cancelar, aceptar));
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', titulo);
  const overlay = el('div', { className: 'overlay sc-overlay' }, modal);
  document.body.append(overlay);
  selector.cargar(await getCategories());
  selector.enfocar();

  return new Promise(resolve => {
    const fin = valor => {
      document.removeEventListener('keydown', esc);
      overlay.remove();
      resolve(valor);
    };
    const esc = e => { if (e.key === 'Escape') fin(null); };
    document.addEventListener('keydown', esc);
    cancelar.addEventListener('click', () => fin(null));
    bLimpiar?.addEventListener('click', () => fin({ limpiar: true }));
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) fin(null); });
    aceptar.addEventListener('click', async () => {
      const r = selector.leer();
      if (!r.ok) { selector.avisar(r.error); return selector.enfocar(); }
      await recordarCategoria(r.cat.ruta);
      fin(r.cat);
    });
  });
}
