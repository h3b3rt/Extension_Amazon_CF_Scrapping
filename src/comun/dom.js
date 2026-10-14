// Ayudas de DOM compartidas por las páginas de la extensión (popup, vista previa,
// opciones y el selector de categoría). Todo se arma con textContent: nunca innerHTML
// con datos remotos.

export const $ = id => document.getElementById(id);

// Crea un elemento con sus propiedades e hijos (se omiten los nulos y vacíos).
export const el = (tag, props = {}, ...hijos) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...hijos.filter(h => h != null && h !== ''));
  return e;
};

// "1 producto", "3 productos".
export const plural = (n, uno, varios = `${uno}s`) => `${n} ${n === 1 ? uno : varios}`;

// Mensaje en el recuadro #status de la página (cls: '', 'success' o 'error').
export function showStatus(mensaje, cls = '') {
  const status = $('status');
  status.hidden = false;
  status.className = cls;
  status.textContent = mensaje;
}
