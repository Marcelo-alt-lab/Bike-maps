import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CSV_PATH = path.join(ROOT_DIR, 'CICLOVIAS EXISTENTES.csv');
const OUT_PATH = path.join(ROOT_DIR, 'data.js');

const DISTRICT_COORDS = {
  'ATE': { lat: -12.0260, lng: -76.9185, zona: 'Lima Este' },
  'BARRANCO': { lat: -12.1492, lng: -77.0219, zona: 'Lima Centro-Sur' },
  'BREÑA': { lat: -12.0583, lng: -77.0531, zona: 'Lima Centro' },
  'CHORRILLOS': { lat: -12.1856, lng: -77.0125, zona: 'Lima Sur' },
  'EL AGUSTINO': { lat: -12.0467, lng: -76.9997, zona: 'Lima Este' },
  'INDEPENDENCIA': { lat: -11.9900, lng: -77.0545, zona: 'Lima Norte' },
  'JESUS MARIA': { lat: -12.0758, lng: -77.0497, zona: 'Lima Centro' },
  'LA MOLINA': { lat: -12.0825, lng: -76.9422, zona: 'Lima Este' },
  'LA VICTORIA': { lat: -12.0695, lng: -77.0186, zona: 'Lima Centro' },
  'LIMA CERCADO': { lat: -12.0464, lng: -77.0428, zona: 'Lima Centro' },
  'LINCE': { lat: -12.0847, lng: -77.0358, zona: 'Lima Centro' },
  'LOS OLIVOS': { lat: -11.9735, lng: -77.0715, zona: 'Lima Norte' },
  'LURIN': { lat: -12.2736, lng: -76.8692, zona: 'Lima Sur' },
  'MAGDALENA DEL MAR': { lat: -12.0928, lng: -77.0706, zona: 'Lima Centro' },
  'MIRAFLORES': { lat: -12.1211, lng: -77.0297, zona: 'Lima Centro-Sur' },
  'PACHACAMAC': { lat: -12.2261, lng: -76.8594, zona: 'Lima Sur' },
  'PUEBLO LIBRE': { lat: -12.0778, lng: -77.0633, zona: 'Lima Centro' },
  'PUNTA HERMOSA': { lat: -12.3336, lng: -76.8244, zona: 'Balnearios del Sur' },
  'PUNTA NEGRA': { lat: -12.3653, lng: -76.7967, zona: 'Balnearios del Sur' },
  'RIMAC': { lat: -12.0258, lng: -77.0339, zona: 'Lima Centro' },
  'SAN BARTOLO': { lat: -12.3886, lng: -76.7794, zona: 'Balnearios del Sur' },
  'SAN BORJA': { lat: -12.0994, lng: -76.9978, zona: 'Lima Centro-Sur' },
  'SAN ISIDRO': { lat: -12.0977, lng: -77.0365, zona: 'Lima Centro-Sur' },
  'SAN JUAN DE LURIGANCHO': { lat: -11.9950, lng: -76.9990, zona: 'Lima Este' },
  'SAN JUAN DE MIRAFLORES': { lat: -12.1631, lng: -76.9686, zona: 'Lima Sur' },
  'SAN LUIS': { lat: -12.0747, lng: -76.9969, zona: 'Lima Centro' },
  'SAN MARTIN DE PORRES': { lat: -12.0085, lng: -77.0815, zona: 'Lima Norte' },
  'SAN MIGUEL': { lat: -12.0775, lng: -77.0919, zona: 'Lima Centro' },
  'SANTA ANITA': { lat: -12.0442, lng: -76.9711, zona: 'Lima Este' },
  'SANTA MARIA DEL MAR': { lat: -12.4044, lng: -76.7753, zona: 'Balnearios del Sur' },
  'SANTIAGO DE SURCO': { lat: -12.1380, lng: -76.9885, zona: 'Lima Centro-Sur' },
  'SURQUILLO': { lat: -12.1117, lng: -77.0128, zona: 'Lima Centro-Sur' },
  'VILLA EL SALVADOR': { lat: -12.2133, lng: -76.9425, zona: 'Lima Sur' },
  'VILLA MARIA DEL TRIUNFO': { lat: -12.1636, lng: -76.9358, zona: 'Lima Sur' }
};

const METADATA = {
  titulo: 'Ciclovías Existentes en Lima Metropolitana - [Municipalidad Metropolitana de Lima - MML]',
  url: 'https://www.datosabiertos.gob.pe/dataset/ciclovias-existentes',
  descripcion: 'En Lima Metropolitana existen 323.43 km de Ciclovías a lo largo de 34 distritos, las cuales se dividen en: Ciclovías implementadas en vías metropolitanas que suman 232.96 km y en vías locales que son 99.47 km; asimismo, la información detalla la extensión, el tramo de la vía y el distrito donde se ubica la Ciclovías.',
  notaVerificacion: 'Nota de verificación: El documento oficial de metadatos indica 323.43 km en la descripción, pero el desglose que él mismo reporta (232.96 km en vías metropolitanas + 99.47 km en vías locales) y la suma exacta de los 335 tramos del CSV dan 332.43 km (probable transposición de dígitos 323.43 vs 332.43).',
  entidad: 'Municipalidad Metropolitana de Lima - MML',
  fuente: 'Gerencia de Movilidad',
  etiquetas: 'Gobernabilidad',
  fechaCreacion: '2023-12-05',
  frecuenciaActualizacion: 'La información se Actualizará Anualmente',
  ultimaActualizacion: '2023-12-05, 20:00 (UTC-05:00)',
  version: '1.0',
  licencia: 'Open Data Commons Attribution License',
  idioma: 'Español',
  nivelAcceso: 'Público',
  tipoRecurso: 'Dataset',
  formato: 'CSV',
  cobertura: 'Perú, 2023',
  correoContacto: 'Branny.rivera@munlima.gob.pe',
  fechaCorteCsv: '2023-11-23'
};

const DATA_DICTIONARY = [
  {
    variable: 'DEPARTAMENTO',
    descripcion: 'Departamento donde se encuentra ubicada la entidad',
    tipoDato: 'Texto',
    tamano: 4,
    recursoRelacionado: '',
    informacionAdicional: 'En mayúscula'
  },
  {
    variable: 'PROVINCIA',
    descripcion: 'Provincia donde se encuentra ubicada la entidad',
    tipoDato: 'Texto',
    tamano: 4,
    recursoRelacionado: '',
    informacionAdicional: 'En mayúscula'
  },
  {
    variable: 'DISTRITO',
    descripcion: 'Distrito donde se encuentra ubicada la entidad',
    tipoDato: 'Texto',
    tamano: 4,
    recursoRelacionado: '',
    informacionAdicional: 'En mayúscula'
  },
  {
    variable: 'UBIGEO',
    descripcion: 'Código de ubicación geográfica según el INEI',
    tipoDato: 'Numérico',
    tamano: 6,
    recursoRelacionado: 'Catálogo del INEI',
    informacionAdicional: 'Link: https://account.geodir.co/recursos/ubigeo-inei-peru.html',
    link: 'https://account.geodir.co/recursos/ubigeo-inei-peru.html'
  },
  {
    variable: 'CANTIDAD',
    descripcion: 'Código de la cantidad de Ciclovías',
    tipoDato: 'Texto',
    tamano: 4,
    recursoRelacionado: '',
    informacionAdicional: 'En mayúscula'
  },
  {
    variable: 'NOMBRE_CICLOVIA',
    descripcion: 'Nombre de la Ciclovía',
    tipoDato: 'Texto',
    tamano: 60,
    recursoRelacionado: '',
    informacionAdicional: '-'
  },
  {
    variable: 'TRAMO',
    descripcion: 'Tramo de la Ciclovía',
    tipoDato: 'Texto',
    tamano: 104,
    recursoRelacionado: '',
    informacionAdicional: '-'
  },
  {
    variable: 'DISTRITO_CICLOVIA',
    descripcion: 'Distrito de la Ciclovía',
    tipoDato: 'Texto',
    tamano: 23,
    recursoRelacionado: '',
    informacionAdicional: 'En mayúscula'
  },
  {
    variable: 'TIPO_DE_VIA',
    descripcion: 'Si es Metropolitana o Local',
    tipoDato: 'Texto',
    tamano: 13,
    recursoRelacionado: '',
    informacionAdicional: 'En mayúscula',
    nota: 'En el CSV la columna se llama TIPO_VIA'
  },
  {
    variable: 'LONGITUD_KM',
    descripcion: 'Longitud de la Ciclovía en KM',
    tipoDato: 'Numérico',
    tamano: 4,
    recursoRelacionado: '',
    informacionAdicional: '-'
  },
  {
    variable: 'FECHA_CORTE',
    descripcion: 'Fecha en que se realizó el corte de información',
    tipoDato: 'Numérico',
    tamano: 8,
    recursoRelacionado: '',
    informacionAdicional: 'Formato: aaaammdd'
  }
];

function decodeCsvBuffer(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

function build() {
  const buf = fs.readFileSync(CSV_PATH);
  const text = decodeCsvBuffer(buf).replace(/^\uFEFF/, '');

  if (text.includes('\uFFFD')) {
    throw new Error('Se encontraron caracteres de reemplazo (\\uFFFD) al decodificar el CSV.');
  }

  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('El archivo CSV no contiene registros.');
  }

  const header = lines[0].split(';').map((col) => col.trim());
  const colIndex = Object.fromEntries(header.map((col, idx) => [col, idx]));

  const requiredCols = ['UBIGEO', 'CANTIDAD', 'NOMBRE_CICLOVIA', 'TRAMO', 'DISTRITO_CICLOVIA', 'LONGITUD_KM', 'FECHA_CORTE'];
  for (const col of requiredCols) {
    if (!(col in colIndex)) {
      throw new Error(`Falta la columna requerida: ${col}`);
    }
  }
  const tipoViaCol = 'TIPO_VIA' in colIndex ? 'TIPO_VIA' : 'TIPO_DE_VIA';
  if (!(tipoViaCol in colIndex)) {
    throw new Error('Falta la columna TIPO_VIA / TIPO_DE_VIA.');
  }

  const records = [];
  const districtsSeen = new Set();
  const missingCoords = new Set();
  let totalKm = 0;
  let metroKm = 0;
  let localKm = 0;
  let replacementCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    if (cols.length !== header.length) {
      throw new Error(`Línea ${i + 1}: se esperaban ${header.length} columnas y llegaron ${cols.length}.`);
    }

    const codigo = (cols[colIndex.CANTIDAD] || '').trim();
    const nombre = (cols[colIndex.NOMBRE_CICLOVIA] || '').trim();
    const tramo = (cols[colIndex.TRAMO] || '').trim();
    const distrito = (cols[colIndex.DISTRITO_CICLOVIA] || '').trim();
    const tipoVia = (cols[colIndex[tipoViaCol]] || '').trim().toUpperCase();
    const rawKm = (cols[colIndex.LONGITUD_KM] || '').trim().replace(',', '.');
    const longitudKm = Number(parseFloat(rawKm).toFixed(2));
    const fechaCorte = (cols[colIndex.FECHA_CORTE] || '').trim();
    const ubigeo = (cols[colIndex.UBIGEO] || '').trim();

    if (Number.isNaN(longitudKm)) {
      throw new Error(`Línea ${i + 1}: LONGITUD_KM inválido (${rawKm}).`);
    }

    const joined = [codigo, nombre, tramo, distrito, tipoVia, fechaCorte, ubigeo].join(' ');
    if (joined.includes('\uFFFD')) {
      replacementCount++;
    }

    districtsSeen.add(distrito);
    if (!DISTRICT_COORDS[distrito]) {
      missingCoords.add(distrito);
    }

    const codigoNum = parseInt(codigo.replace(/\D+/g, ''), 10) || 0;
    totalKm += longitudKm;
    if (tipoVia === 'METROPOLITANA') metroKm += longitudKm;
    else localKm += longitudKm;

    records.push({
      id: i,
      codigo,
      codigoNum,
      nombre,
      tramo,
      distrito,
      tipoVia,
      longitudKm,
      fechaCorte,
      ubigeo
    });
  }

  if (missingCoords.size > 0) {
    throw new Error(`Distritos sin coordenadas: ${[...missingCoords].join(', ')}`);
  }
  if (replacementCount > 0) {
    throw new Error(`Registros con caracteres corruptos (\\uFFFD): ${replacementCount}`);
  }

  const bundle = {
    records,
    metadata: METADATA,
    dataDictionary: DATA_DICTIONARY,
    districtCoords: DISTRICT_COORDS
  };

  const output = `// Generado automáticamente por scripts/build-data.mjs desde CICLOVIAS EXISTENTES.csv\nwindow.CICLOVIAS_BUNDLE = ${JSON.stringify(bundle, null, 2)};\n`;
  fs.writeFileSync(OUT_PATH, output, 'utf8');

  console.log(`Generado: ${OUT_PATH}`);
  console.log(`Tramos: ${records.length}`);
  console.log(`Distritos: ${districtsSeen.size}`);
  console.log(`Extensión total: ${totalKm.toFixed(2)} km`);
  console.log(`Metropolitana: ${metroKm.toFixed(2)} km | Local: ${localKm.toFixed(2)} km`);
  console.log(`Distritos sin coordenadas: ${missingCoords.size}`);
  console.log(`Caracteres de reemplazo: ${replacementCount}`);
}

build();
