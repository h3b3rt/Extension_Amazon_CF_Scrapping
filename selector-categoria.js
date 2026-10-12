// Selector de categoría en una ventana (vista previa): mismo comportamiento que el del
// popup antes de extraer. Modos "🔍 Buscar" (lista que filtra mientras se escribe, con
// flechas y Enter) y "☰ Por niveles" (tres listas en cascada), "↻ Actualizar" y las
// categorías usadas recientemente. Comparte con el popup las claves recentCategories
// (rutas "P / S / T") y categoryMode.
// elegirCategoria({ titulo, subtitulo, actual }) → Promise<cat | null>, con cat igual
// al del popup: { principal, secundaria, terciaria, codigo, ruta }. Solo acepta una
// categoría del catálogo (con código): sin código el Excel no la usaría.
// Con `limpiar: true` muestra además "Quitar categoría", que resuelve { limpiar: true }.
// Todo se arma con textContent.
import { getCategories, refreshCategories, searchCategories, categoryLabel, findCategory, normalizeText, sourceLabel } from './categories.js';

const MAX_RECIENTES = 15;
const el = (tag, props = {}, ...hijos) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...hijos.filter(h => h != null && h !== ''));
  return e;
};

export const catDe = c => ({ principal: c.primaria, secundaria: c.secundaria, terciaria: c.terciaria, codigo: c.codigo, ruta: categoryLabel(c) });

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

async function recordar(ruta) {
  const { recentCategories = [] } = await chrome.storage.local.get('recentCategories');
  const k = normalizeText(ruta);
  await chrome.storage.local.set({ recentCategories: [ruta, ...recentCategories.filter(c => normalizeText(c) !== k)].slice(0, MAX_RECIENTES) });
}

export async function elegirCategoria({ titulo = 'Asignar categoría', subtitulo = '', actual = '', limpiar = false } = {}) {
  const { categoryMode = 'search', recentCategories = [] } = await chrome.storage.local.get(['categoryMode', 'recentCategories']);
  let catalogo = { items: [] };
  const estado = { modo: categoryMode === 'browse' ? 'browse' : 'search', elegida: null, lista: [], activa: -1 };

  // ---- ventana ----
  const input = el('input', { className: 'sc-input', type: 'text', autocomplete: 'off', placeholder: 'Escribe parte del nombre o el código (ej. audífonos)' });
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  const lista = el('ul', { className: 'sc-list', hidden: true });
  lista.setAttribute('role', 'listbox');
  const niveles = [1, 2, 3].map(n => el('select', { className: 'sc-select' }));
  niveles.forEach((s, i) => s.setAttribute('aria-label', `Nivel ${i + 1}`));
  const pista = el('div', { className: 'sc-hint' });
  const bBuscar = el('button', { type: 'button', className: 'sc-tab', textContent: '🔍 Buscar' });
  const bNiveles = el('button', { type: 'button', className: 'sc-tab', textContent: '☰ Por niveles' });
  const bActualizar = el('button', { type: 'button', className: 'sc-refresh', textContent: '↻ Actualizar', title: 'Descargar la lista de categorías más reciente' });
  const grupoBuscar = el('div', { className: 'sc-group' }, input, lista);
  const grupoNiveles = el('div', { className: 'sc-group sc-levels' },
    ...niveles.map((s, i) => el('label', {}, el('span', { textContent: ['Principal', 'Secundaria', 'Terciaria'][i] }), s)));
  const cancelar = el('button', { type: 'button', className: 'ghost', textContent: 'Cancelar' });
  const bLimpiar = limpiar ? el('button', { type: 'button', className: 'ghost sc-clear', textContent: '✕ Quitar categoría', title: 'Dejar sin categoría (se elige en la plantilla)' }) : null;
  const aceptar = el('button', { type: 'button', className: 'primary', textContent: 'Asignar categoría' });
  const modal = el('div', { className: 'modal sc-modal' },
    el('h3', { className: 'sc-title', textContent: titulo }),
    subtitulo ? el('p', { className: 'sc-sub', textContent: subtitulo }) : null,
    el('div', { className: 'sc-tabs' }, bBuscar, bNiveles, el('div', { className: 'grow' }), bActualizar),
    grupoBuscar, grupoNiveles, pista,
    el('div', { className: 'actions' }, bLimpiar, el('div', { className: 'grow' }), cancelar, aceptar));
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', titulo);
  const overlay = el('div', { className: 'overlay sc-overlay' }, modal);
  document.body.append(overlay);

  // ---- pista bajo el campo ----
  const ponerPista = (msg = '', tipo = '') => {
    let t = msg;
    if (!t && estado.elegida) t = `Código: ${estado.elegida.codigo}`;
    if (!t && !catalogo.items.length) t = 'Cargando categorías…';
    pista.textContent = t;
    pista.className = `sc-hint${tipo ? ` ${tipo}` : ''}`;
  };
  const elegir = c => {
    estado.elegida = c;
    aceptar.disabled = !c;
    ponerPista();
  };

  // ---- modo Buscar ----
  const entradas = () => {
    const escrito = estado.elegida && input.value === categoryLabel(estado.elegida) ? '' : input.value.trim();
    if (escrito) return { q: escrito, grupos: [{ titulo: '', items: searchCategories(catalogo.items, escrito, 50) }] };
    const recientes = recentCategories.map(r => findCategory(catalogo.items, r)).filter(Boolean);
    return { q: '', grupos: recientes.length ? [{ titulo: 'Usadas recientemente', items: recientes }] : [], vacio: recientes.length ? '' : `Escribe para buscar entre ${catalogo.items.length} categorías.` };
  };
  const marcarActiva = () => {
    lista.querySelectorAll('[role=option]').forEach(li => {
      const on = li.dataset.i === String(estado.activa);
      li.classList.toggle('active', on);
      li.setAttribute('aria-selected', String(on));
      if (on) li.scrollIntoView?.({ block: 'nearest' });
    });
  };
  const abrirLista = abierta => { lista.hidden = !abierta; input.setAttribute('aria-expanded', String(abierta)); };
  const elegirDeLista = i => {
    const c = estado.lista[i];
    if (!c) return;
    input.value = categoryLabel(c);
    abrirLista(false);
    elegir(c);
  };
  const pintarLista = () => {
    const { q, grupos, vacio = '' } = entradas();
    estado.lista = grupos.flatMap(g => g.items);
    const terminos = normalizeText(q).split(' ').filter(t => t && t !== '/');
    const nodos = [];
    let i = 0;
    for (const g of grupos) {
      if (g.titulo) nodos.push(el('li', { className: 'group', textContent: g.titulo }));
      for (const c of g.items) {
        const n = i++;
        const li = el('li', {},
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
    if (!estado.lista.length && catalogo.items.length) {
      const t = q ? 'Sin resultados. Prueba con otra palabra o con el código.' : vacio;
      if (t) nodos.push(el('li', { className: 'empty', textContent: t }));
    }
    lista.replaceChildren(...nodos);
    estado.activa = q && estado.lista.length ? 0 : -1;
    marcarActiva();
    abrirLista(nodos.length > 0);
  };
  input.addEventListener('input', () => {
    if (estado.elegida && input.value !== categoryLabel(estado.elegida)) elegir(findCategory(catalogo.items, input.value));
    pintarLista();
  });
  input.addEventListener('focus', pintarLista);
  input.addEventListener('blur', () => setTimeout(() => abrirLista(false), 120));
  input.addEventListener('keydown', e => {
    const abierta = !lista.hidden;
    const n = estado.lista.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!abierta) return pintarLista();
      if (!n) return;
      const paso = e.key === 'ArrowDown' ? 1 : -1;
      estado.activa = estado.activa < 0 ? (paso > 0 ? 0 : n - 1) : (estado.activa + paso + n) % n;
      marcarActiva();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (abierta && estado.activa >= 0) elegirDeLista(estado.activa);
      else if (estado.elegida) aceptar.click();
    } else if (e.key === 'Escape' && abierta) {
      e.preventDefault();
      e.stopPropagation();
      abrirLista(false);
    }
  });

  // ---- modo Por niveles ----
  const unicos = arr => [...new Set(arr)].sort((a, b) => a.localeCompare(b, 'es'));
  const llenar = (sel, valores, valor, vacio) => {
    sel.replaceChildren(el('option', { value: '', textContent: vacio }), ...valores.map(v => el('option', { value: v, textContent: v })));
    sel.value = valores.includes(valor) ? valor : '';
    sel.disabled = !valores.length;
  };
  const pintarNiveles = (c = estado.elegida) => {
    const [n1, n2, n3] = niveles;
    const items = catalogo.items;
    llenar(n1, unicos(items.map(x => x.primaria)), c?.primaria, 'Elige…');
    llenar(n2, n1.value ? unicos(items.filter(x => x.primaria === n1.value).map(x => x.secundaria)) : [], c?.secundaria, n1.value ? 'Elige…' : '—');
    llenar(n3, n2.value ? unicos(items.filter(x => x.primaria === n1.value && x.secundaria === n2.value).map(x => x.terciaria)) : [], c?.terciaria, n2.value ? 'Elige…' : '—');
  };
  niveles.forEach((sel, i) => sel.addEventListener('change', () => {
    const [a, b, c] = niveles.map(s => s.value);
    const parcial = { primaria: a, secundaria: i >= 1 ? b : '', terciaria: i >= 2 ? c : '' };
    pintarNiveles(parcial);
    const hallada = catalogo.items.find(x => x.primaria === niveles[0].value && x.secundaria === niveles[1].value && x.terciaria === niveles[2].value) || null;
    elegir(hallada);
    if (hallada) input.value = categoryLabel(hallada);
  }));

  const ponerModo = (modo, foco = true) => {
    estado.modo = modo === 'browse' && catalogo.items.length ? 'browse' : 'search';
    bBuscar.classList.toggle('on', estado.modo === 'search');
    bNiveles.classList.toggle('on', estado.modo === 'browse');
    bBuscar.setAttribute('aria-pressed', String(estado.modo === 'search'));
    bNiveles.setAttribute('aria-pressed', String(estado.modo === 'browse'));
    grupoBuscar.hidden = estado.modo !== 'search';
    grupoNiveles.hidden = estado.modo !== 'browse';
    if (estado.modo === 'browse') pintarNiveles();
    if (foco) (estado.modo === 'search' ? input : niveles.find(s => !s.value && !s.disabled) || niveles[2]).focus();
  };
  bBuscar.addEventListener('click', () => { ponerModo('search'); chrome.storage.local.set({ categoryMode: 'search' }); });
  bNiveles.addEventListener('click', () => { ponerModo('browse'); chrome.storage.local.set({ categoryMode: 'browse' }); });

  const cargar = c => {
    catalogo = c;
    bNiveles.disabled = !catalogo.items.length;
    if (!estado.elegida && actual) {
      const a = findCategory(catalogo.items, actual);
      if (a) { input.value = categoryLabel(a); elegir(a); }
    }
    if (estado.elegida) estado.elegida = catalogo.items.find(x => x.codigo === estado.elegida.codigo) || null;
    ponerModo(estado.modo, false);
    ponerPista(c.error && !c.items.length ? `No se pudieron cargar las categorías: ${c.error}` : '', c.error && !c.items.length ? 'error' : '');
  };
  bActualizar.addEventListener('click', async () => {
    bActualizar.disabled = true;
    ponerPista('Actualizando…');
    const c = await refreshCategories();
    cargar(c);
    bActualizar.disabled = false;
    ponerPista(c.error ? `No se pudo actualizar: ${c.error}. Se usa la lista guardada.` : `Lista actualizada (${c.items.length} categorías, ${sourceLabel(c.source)}).`, c.error ? 'error' : 'ok');
  });

  elegir(null);
  ponerModo(estado.modo, false);
  ponerPista();
  cargar(await getCategories());
  ponerModo(estado.modo);

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
      const c = estado.elegida || findCategory(catalogo.items, input.value);
      if (!c) return ponerPista('Elige una categoría de la lista.', 'error');
      await recordar(categoryLabel(c));
      fin(catDe(c));
    });
  });
}
