// Lista de prueba inventada: grupos y productos de los 5 sitios, con casos de aviso.
export const groups = {
  g1: { id: 'g1', nombre: 'Audífonos', fecha: '2026-10-06T10:00:00Z', origen: 'https://www.amazon.com/s?k=audifonos', variaciones: true, guiaTalla: false, categoria: 'Electrónica' },
  g2: { id: 'g2', nombre: 'Labiales', fecha: '2026-10-06T10:05:00Z', origen: 'https://www.sephora.com/brand/x', variaciones: false, guiaTalla: true },
  g3: { id: 'g3', nombre: 'Bolsos', fecha: '2026-10-06T10:10:00Z', origen: 'https://www.katespade.com/handbags', variaciones: true, guiaTalla: true },
};
const cat = { codCategoria: 'CF010101', categoria: 'Electrónica', categoriaSecundaria: 'Audio', categoriaTerciaria: 'Audífonos' };
export const collected = {
  B0AAA00001: { asin: 'B0AAA00001', ecomerce: 'Amazon', nombre: 'Audífonos <b>X</b> & co', marca: 'Sony', precio: '19.99', imagen: 'https://m.media-amazon.com/images/I/a.jpg', link: 'https://www.amazon.com/dp/B0AAA00001', grupo: 'g1', familia: 'P1', ...cat },
  B0AAA00002: { asin: 'B0AAA00002', ecomerce: 'Amazon', nombre: 'Audífonos X rojo', marca: 'Sony', precio: '19.99', imagen: 'https://m.media-amazon.com/images/I/a.jpg', link: 'https://www.amazon.com/dp/B0AAA00002', grupo: 'g1', familia: 'P1', ...cat },
  B0AAA00003: { asin: 'B0AAA00003', ecomerce: 'Amazon', nombre: 'Laptop (Renewed)', precio: '', imagen: '', link: 'https://www.amazon.com/dp/B0AAA00003', grupo: 'g1', ...cat },
  B0AAA00004: { asin: 'B0AAA00004', ecomerce: 'Amazon', nombre: 'Cable', precio: '5', imagen: 'https://m.media-amazon.com/images/I/c.jpg', link: 'https://www.amazon.com/dp/B0AAA00004', grupo: 'g1', familia: 'P4', familiaAviso: 'Familia sin verificar', ...cat },
  'sephora:P123456': { asin: 'P123456', variante: '2345678', ecomerce: 'Sephora', nombre: 'Lipstick', marca: 'Rare', precio: '22', imagen: 'https://www.sephora.com/i.jpg', link: 'https://www.sephora.com/product/lip-P123456?skuId=2345678', grupo: 'g2' },
  'sephora:sin': { asin: '', ecomerce: 'Sephora', nombre: 'Sin SKU', link: 'https://www.sephora.com/x', grupo: 'g2' },
  'katespade:KD120': { asin: 'KD120', ecomerce: 'Kate Spade', nombre: 'Bolso', marca: 'Kate Spade', precio: '199', imagen: 'https://www.katespade.com/a.jpg', link: 'https://www.katespade.com/products/x/KD120-960.html', grupo: 'g3', familia: 'KD120,KN974', ...cat },
  'katespade:KN974': { asin: 'KN974', ecomerce: 'Kate Spade', nombre: 'Bolso 2', link: 'https://www.katespade.com/products/y/KN974-001.html', grupo: 'g3', familia: 'KD120,KN974', ...cat },
  'katespade:KO585': { asin: 'KO585', ecomerce: 'Kate Spade', nombre: 'Bolso 3', link: 'https://www.katespade.com/products/z/KO585-001.html', grupo: 'g3', ...cat },
  'michaelkors:MK-1': { asin: 'MK-1', ecomerce: 'Michael Kors', nombre: 'Reloj', link: 'https://www.michaelkors.com/x/MK-1.html', grupo: 'g1', ...cat },
  'marcjacobs:H001': { asin: 'H001', ecomerce: 'Marc Jacobs', nombre: 'Bucket', link: 'https://www.marcjacobs.com/us-en/x/H001.html', grupo: 'g1', ...cat },
};
