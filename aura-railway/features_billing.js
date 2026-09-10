/* =====================================================================
   AURA — V933 · Los dos botones muertos de facturación e informes
   ---------------------------------------------------------------------
   Dos botones del panel prometían un documento y no lo daban:

     1. "🧾 Factura" en cada fila de Pagos (public/admin.js) abría
        /api/payments/:id/invoice. Esa ruta NO existía en ningún fichero
        del servidor. El comentario del panel decía "endpoint estándar":
        quien lo escribió supuso que existía. Se abría una pestaña con un
        404 (y sin ?adminToken, así que ni llegaba: 401 en la puerta).
     2. "📥 Descargar informe PDF" en Estadísticas abría
        /api/stats/report.pdf, que tampoco existía.

   Los detectó una auditoría de V933, no la de V931: aquella sólo miraba
   llamadas fetch(), y estas dos navegan con window.open. Clase entera de
   agujero que se había escapado.

   ---------------------------------------------------------------------
   LO QUE IMPORTA DE ESTE MÓDULO: la numeración.

   payments.invoice_no ya existe, pero lo genera genInvoiceNo()
   (server.js) como INV-AAAAMM-<8 hex ALEATORIOS>. Como referencia interna
   del cobro está bien. Como número de factura NO sirve: una factura se
   numera de forma correlativa dentro de su serie y sin saltos. Por eso
   aquí hay una numeración propia (invoice_counters + payment_invoices) y
   el invoice_no se imprime aparte, como "referencia del cobro".

   Tres reglas que este módulo no se salta:

   a) Si faltan los datos fiscales del emisor (nombre y NIF), el documento
      NO se llama factura: sale como JUSTIFICANTE DE PAGO, lo dice dentro,
      y NO consume número de serie. Un papel que dice "Factura" sin NIF ni
      numeración es peor que no tener papel.
   b) El número se asigna UNA vez y se guarda con una copia congelada de
      los datos (snapshot). Si mañana cambias de dirección o de tipo de
      IVA, las facturas ya emitidas siguen diciendo lo que decían. Una
      factura emitida no se reescribe.
   c) La asignación va en transacción con SELECT ... FOR UPDATE sobre la
      fila del pago, para que dos descargas simultáneas no gasten dos
      números (un hueco en la serie es un problema, no un detalle).

   LO QUE ESTE MÓDULO NO HACE, y hay que decirlo:
     · No emite facturas rectificativas. Un pago reembolsado sale marcado
       como REEMBOLSADO, y si ya tenía factura emitida se muestra su
       número; la rectificativa la tiene que emitir tu asesoría, con su
       serie propia. Automatizarlo sin saber tu régimen sería inventar.
     · No decide tu tipo de IVA ni tu régimen (OSS, exenciones,
       inversión del sujeto pasivo). Lee lo que configures en el panel.
     · No factura a nombre de empresa del cliente: la app no guarda NIF ni
       dirección de los usuarios (users sólo tiene name, email, city,
       country, phone). Sale como factura simplificada con nombre y
       correo. Si un cliente pide factura completa, esos datos hay que
       pedírselos, y hoy no hay dónde guardarlos.
   ===================================================================== */
"use strict";

const PDFDocument = require("pdfkit");

/* ---------------------------------------------------------------- */
/* Esquema                                                          */
/* ---------------------------------------------------------------- */
async function migrate(pool) {
  // Contador correlativo por serie y año. La PK (series, year) es lo que
  // hace atómico el incremento junto al UPDATE ... LAST_INSERT_ID().
  await pool.query(`CREATE TABLE IF NOT EXISTS invoice_counters (
    series VARCHAR(12) NOT NULL,
    year INT NOT NULL,
    seq INT NOT NULL DEFAULT 0,
    PRIMARY KEY (series, year)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Facturas emitidas. Una por pago como máximo (PK en payment_id), con el
  // número congelado y una copia de los datos con los que se emitió.
  await pool.query(`CREATE TABLE IF NOT EXISTS payment_invoices (
    payment_id INT NOT NULL,
    series VARCHAR(12) NOT NULL,
    year INT NOT NULL,
    seq INT NOT NULL,
    number VARCHAR(40) NOT NULL,
    issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    snapshot MEDIUMTEXT NOT NULL,
    PRIMARY KEY (payment_id),
    UNIQUE KEY uk_numero (number),
    UNIQUE KEY uk_serie (series, year, seq)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  /* V934 · Rectificativas.
     Una factura emitida NO se toca: eso es lo que la hace válida. Cuando algo
     está mal se emite un documento NUEVO que dice a qué factura se refiere y
     por qué. Por eso esto es una tabla aparte y no un UPDATE sobre la de
     arriba, y por eso NO lleva PK en payment_id: un mismo pago puede acabar
     con más de una rectificativa (se rectifica, y luego se rectifica la
     rectificación). El número vive en su propia serie, con el mismo contador
     atómico de invoice_counters. */
  await pool.query(`CREATE TABLE IF NOT EXISTS payment_invoice_rectifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT NOT NULL,
    rectifies VARCHAR(40) NOT NULL,
    series VARCHAR(12) NOT NULL,
    year INT NOT NULL,
    seq INT NOT NULL,
    number VARCHAR(40) NOT NULL,
    mode VARCHAR(20) NOT NULL,
    reason VARCHAR(300) NOT NULL,
    issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    snapshot MEDIUMTEXT NOT NULL,
    UNIQUE KEY uk_rect_numero (number),
    UNIQUE KEY uk_rect_serie (series, year, seq),
    INDEX idx_rect_pago (payment_id),
    INDEX idx_rect_origen (rectifies)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  /* V934 · Concepto libre, para los cobros que no vienen de Stripe (una
     transferencia, un cobro en mano). Se añade con el patrón idempotente de
     server.js:2232: si la columna ya está, MySQL protesta y se ignora. */
  for (const stmt of [
    "ALTER TABLE payments ADD COLUMN concept VARCHAR(190) NULL",
  ]) { try { await pool.query(stmt); } catch {} }
}

/* ---------------------------------------------------------------- */
/* Datos del emisor (ajustes editables desde el panel)              */
/* ---------------------------------------------------------------- */
function datosEmisor(getSetting) {
  const g = (k, fb) => String(getSetting(k, fb) == null ? fb : getSetting(k, fb)).trim();
  return {
    nombre: g("billing.issuer_name", ""),
    nif: g("billing.issuer_tax_id", ""),
    direccion: g("billing.issuer_address", ""),
    poblacion: g("billing.issuer_city_zip", ""),
    pais: g("billing.issuer_country", "España"),
    email: g("billing.issuer_email", ""),
    serie: (g("billing.series", "A") || "A").toUpperCase().slice(0, 12),
    /* V934 · Serie propia para las rectificativas: si compartieran serie con
       las facturas normales, cada corrección movería el correlativo de éstas. */
    serieRect: (g("billing.series_rect", "R") || "R").toUpperCase().slice(0, 12),
    tipoIva: Number(g("billing.tax_rate", "21")) || 0,
    ivaIncluido: g("billing.prices_include_tax", "true") !== "false",
    notaIva: g("billing.tax_note", ""),
    pie: g("billing.legal_footer", ""),
  };
}

// La regla (a): sin nombre ni NIF no hay factura.
function emisorCompleto(e) {
  return !!(e.nombre && e.nif);
}

/* ---------------------------------------------------------------- */
/* Desglose de importes                                             */
/* ---------------------------------------------------------------- */
/* Se trabaja en céntimos enteros para que base + IVA sea EXACTAMENTE el
   total y no un 0,01 de diferencia por redondeo. */
function desglosa(importe, tipoIva, ivaIncluido) {
  const cent = Math.round(Number(importe || 0) * 100);
  const tipo = Number(tipoIva) || 0;
  if (!tipo) return { base: cent, iva: 0, total: cent };
  if (ivaIncluido) {
    const base = Math.round(cent / (1 + tipo / 100));
    return { base, iva: cent - base, total: cent };
  }
  const iva = Math.round((cent * tipo) / 100);
  return { base: cent, iva, total: cent + iva };
}

/* Sólo caracteres de WinAnsi: la Helvetica del PDF no tiene flechas ni
   comillas tipográficas raras, y lo que no está en la tabla sale como un
   garabato. El € sí está (0x80), comprobado. */
const eur = (cent, moneda) => {
  const n = (cent / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const m = String(moneda || "EUR").toUpperCase();
  return m === "EUR" ? n + " €" : n + " " + m;
};

const fechaEs = (d) => {
  const f = d ? new Date(d) : new Date();
  return `${String(f.getDate()).padStart(2, "0")}/${String(f.getMonth() + 1).padStart(2, "0")}/${f.getFullYear()}`;
};

// Concepto legible a partir de payments.kind / la suscripción.
function conceptoDe(pago) {
  const k = String(pago.kind || "").toLowerCase();
  /* V934 · Un cobro manual trae su concepto escrito a mano: manda ése, que es
     el único que describe la operación de verdad. */
  if (pago.concept) return String(pago.concept).slice(0, 190);
  if (k === "subscription" || pago.subscription_id) {
    return pago.plan_code
      ? `Suscripción Aura · plan ${pago.plan_code}${pago.period ? " (" + (pago.period === "yearly" ? "anual" : "mensual") + ")" : ""}`
      : "Suscripción Aura";
  }
  if (k === "reads_pack") return "Pack de lecturas de chat";
  if (k === "credits") return "Créditos Aura";
  /* V934 · boost_pack faltaba y caía en el genérico de abajo, así que en la
     factura salía «Servicio Aura · boost_pack», con el nombre interno de la
     columna dentro de un documento fiscal. */
  if (k === "boost_pack") return "Pack de Boost";
  if (k === "manual") return "Servicio Aura";
  if (k) return `Servicio Aura · ${k}`;
  return "Servicio Aura";
}

/* ---------------------------------------------------------------- */
/* V934 · Pagos de datos de demostración                            */
/* ---------------------------------------------------------------- */
/* El seed de server.js:2430 mete 15 pagos falsos con estados completed /
   pending / refunded para que el panel no se vea vacío en una instalación
   nueva. Si esas filas siguen en la base, pulsar «Factura» sobre una de ellas
   emitiría un número fiscal REAL por una venta que no existió, y eso no se
   arregla borrando: habría que rectificar.

   Se distinguen con certeza por el formato del invoice_no:
     · el seed escribe   INV-2026-02841   → año de 4 cifras y 5 dígitos
     · genInvoiceNo hace INV-202609-AB12CD34 → AÑOMES (6 cifras) y 8 hex
   Ningún cobro real puede tener la forma del seed, así que no hay falsos
   positivos. El borrador sí se deja ver (es un borrador); lo que se niega es
   gastar un número. */
function esPagoDeDemostracion(pago) {
  return /^INV-\d{4}-\d{5}$/.test(String(pago && pago.invoice_no || ""));
}

/* ---------------------------------------------------------------- */
/* Asignación del número fiscal — regla (b) y regla (c)             */
/* ---------------------------------------------------------------- */
/* Devuelve { number, issued_at, snapshot, nueva } o null si a este pago no
   le corresponde factura todavía (datos incompletos o pago no cobrado).

   El FOR UPDATE sobre payment_invoices con una PK que aún no existe toma
   un gap lock en InnoDB, y eso es lo que serializa dos descargas
   simultáneas del mismo pago: la segunda espera, ve la fila ya escrita y
   NO gasta un segundo número. Sin esto la serie tendría huecos. */
/* V934 · El incremento del contador, en su propia función porque ahora lo usan
   DOS emisores de números: la factura y la rectificativa. Duplicarlo sería
   pedir que un día se arreglara sólo en uno de los dos sitios.
   Va sobre `conn`, no sobre el pool: tiene que ir en la MISMA transacción que
   el INSERT del documento, o el número quedaría gastado sin factura. */
async function siguienteSeq(conn, serie, anio) {
  await conn.query("INSERT IGNORE INTO invoice_counters (series, year, seq) VALUES (?,?,0)", [serie, anio]);
  await conn.query("UPDATE invoice_counters SET seq = LAST_INSERT_ID(seq + 1) WHERE series=? AND year=?", [serie, anio]);
  const [[fila]] = await conn.query("SELECT LAST_INSERT_ID() AS seq");
  return Number(fila.seq);
}

async function asignaNumero(pool, pago, emisor, snapshotDatos) {
  const [yaRows] = await pool.query(
    "SELECT payment_id, series, year, seq, number, issued_at, snapshot FROM payment_invoices WHERE payment_id=? LIMIT 1",
    [pago.id]
  );
  if (yaRows.length) {
    const r = yaRows[0];
    let snap = {};
    try { snap = JSON.parse(r.snapshot); } catch {}
    return { number: r.number, issued_at: r.issued_at, snapshot: snap, nueva: false };
  }
  // V934 · Un pago del seed de demostración no gasta número JAMÁS.
  if (esPagoDeDemostracion(pago)) return null;
  // Sólo se emite factura de un cobro efectivo y con datos fiscales.
  if (!emisorCompleto(emisor) || String(pago.status) !== "completed") return null;

  const anio = new Date(pago.created_at || Date.now()).getFullYear();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [dentro] = await conn.query(
      "SELECT number, issued_at, snapshot FROM payment_invoices WHERE payment_id=? FOR UPDATE",
      [pago.id]
    );
    if (dentro.length) {
      await conn.commit();
      let snap = {};
      try { snap = JSON.parse(dentro[0].snapshot); } catch {}
      return { number: dentro[0].number, issued_at: dentro[0].issued_at, snapshot: snap, nueva: false };
    }
    const seq = await siguienteSeq(conn, emisor.serie, anio);
    const numero = `${emisor.serie}-${anio}-${String(seq).padStart(4, "0")}`;
    const snapshot = JSON.stringify(snapshotDatos);
    await conn.query(
      "INSERT INTO payment_invoices (payment_id, series, year, seq, number, snapshot) VALUES (?,?,?,?,?,?)",
      [pago.id, emisor.serie, anio, seq, numero, snapshot]
    );
    await conn.commit();
    return { number: numero, issued_at: new Date(), snapshot: snapshotDatos, nueva: true };
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }
}

/* ---------------------------------------------------------------- */
/* V934 · Rectificativas                                            */
/* ---------------------------------------------------------------- */
/* Aquí está la corrección de fondo de este lote: NO se puede «editar» una
   factura emitida. La numeración correlativa y el snapshot congelado son
   exactamente lo que la hace válida; reescribirla la invalidaría y además
   dejaría al cliente con dos papeles distintos con el mismo número.

   Lo que sí se puede es emitir un documento nuevo que diga a qué factura se
   refiere y qué corrige. Dos formas, y las dos se usan de verdad:

     · anulacion   → la factura original se deja sin efecto entera. Los
                     importes van en NEGATIVO, que es lo que permite que la
                     suma del ejercicio cuadre sin borrar nada.
     · sustitucion → la operación era correcta pero algún dato no (el nombre
                     del cliente, el concepto, el importe). Se emite con los
                     datos corregidos y el total corregido.

   La rectificativa lleva SU PROPIA serie (por defecto «R») para no meter
   agujeros ni saltos en la serie de las facturas normales. */
async function emiteRectificativa(pool, { pago, original, emisor, modo, motivo, cambios }) {
  const anio = new Date().getFullYear();
  const serie = emisor.serieRect;
  const base0 = Number(original.snapshot && original.snapshot.base) || 0;
  const iva0 = Number(original.snapshot && original.snapshot.iva) || 0;
  const total0 = Number(original.snapshot && original.snapshot.total) || 0;
  const moneda = (original.snapshot && original.snapshot.moneda) || pago.currency || "EUR";

  let base = -base0, iva = -iva0, total = -total0;
  let concepto = `Anulación de la factura ${original.number}`;
  let cliente = (original.snapshot && original.snapshot.cliente) || {};
  if (modo === "sustitucion") {
    // Si no se toca el importe, se rehace con el mismo total que el original.
    const d = cambios.total_cent != null
      ? desglosa(Number(cambios.total_cent) / 100, emisor.tipoIva, true)
      : { base: base0, iva: iva0, total: total0 };
    base = d.base; iva = d.iva; total = d.total;
    concepto = cambios.concepto || (original.snapshot && original.snapshot.concepto) || conceptoDe(pago);
    cliente = {
      nombre: cambios.cliente_nombre || cliente.nombre,
      email: cambios.cliente_email || cliente.email,
    };
  }

  const snapshot = {
    emisor, concepto, moneda, base, iva, total,
    tipoIva: emisor.tipoIva,
    cliente,
    rectifica: original.number,
    modo, motivo,
    fecha_pago: (original.snapshot && original.snapshot.fecha_pago) || pago.created_at,
    referencia: pago.invoice_no || null,
  };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const seq = await siguienteSeq(conn, serie, anio);
    const numero = `${serie}-${anio}-${String(seq).padStart(4, "0")}`;
    await conn.query(
      `INSERT INTO payment_invoice_rectifications
         (payment_id, rectifies, series, year, seq, number, mode, reason, snapshot)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [pago.id, original.number, serie, anio, seq, numero, modo, motivo, JSON.stringify(snapshot)]
    );
    await conn.commit();
    return { number: numero, issued_at: new Date(), snapshot, modo, motivo };
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }
}

/* V934 · Lectura pura de la factura ya emitida.
   Es casi el mismo SELECT que abre asignaNumero, y está a propósito separado:
   el camino del BORRADOR no debe poder escribir ni por accidente, y la forma
   más sólida de garantizarlo es que no llame a la función que escribe. Si
   mañana alguien cambia asignaNumero, esta función seguirá sin gastar
   números, que es justo lo que se le pide. */
async function facturaEmitida(pool, paymentId) {
  const [rows] = await pool.query(
    "SELECT number, issued_at, snapshot FROM payment_invoices WHERE payment_id=? LIMIT 1",
    [paymentId]
  );
  if (!rows.length) return null;
  let snap = {};
  try { snap = JSON.parse(rows[0].snapshot); } catch {}
  return { number: rows[0].number, issued_at: rows[0].issued_at, snapshot: snap, nueva: false };
}

/* El número que le TOCARÍA, sin gastarlo. Sólo para el borrador: entre esta
   lectura y la emisión real puede colarse otra factura, así que se enseña
   como previsión y así se dice en el documento. */
async function numeroPrevisto(pool, serie, anio) {
  try {
    const [[c]] = await pool.query(
      "SELECT seq FROM invoice_counters WHERE series=? AND year=? LIMIT 1", [serie, anio]);
    const seq = (c ? Number(c.seq) : 0) + 1;
    return `${serie}-${anio}-${String(seq).padStart(4, "0")}`;
  } catch { return ""; }
}

// Rectificativas ya emitidas de un pago, en orden de emisión.
async function rectificativasDe(pool, paymentId) {
  const [rows] = await pool.query(
    `SELECT number, rectifies, mode, reason, issued_at, snapshot
       FROM payment_invoice_rectifications WHERE payment_id=? ORDER BY id ASC`,
    [paymentId]
  );
  return rows.map((r) => {
    let snap = {};
    try { snap = JSON.parse(r.snapshot); } catch {}
    return { number: r.number, rectifies: r.rectifies, mode: r.mode, reason: r.reason, issued_at: r.issued_at, snapshot: snap };
  });
}

/* ---------------------------------------------------------------- */
/* El PDF                                                           */
/* ---------------------------------------------------------------- */
/* Devuelve un Buffer. Sin compresión sólo en las pruebas, para poder leer
   el texto de dentro y comprobar que dice lo que tiene que decir. */
function construyePdf(datos, opciones = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      compress: opciones.compress === false ? false : true,
      info: { Title: datos.titulo + (datos.numero ? " " + datos.numero : ""), Author: datos.emisor.nombre || "Aura" },
    });
    const trozos = [];
    doc.on("data", (t) => trozos.push(t));
    doc.on("end", () => resolve(Buffer.concat(trozos)));
    doc.on("error", reject);

    const G = "#111111", GRIS = "#666666", LINEA = "#dddddd";
    const ANCHO = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const X = doc.page.margins.left;

    /* V934 · Marca de agua del borrador. Va PRIMERO, antes de cualquier texto,
       porque en un PDF lo que se dibuja después queda encima: así el contenido
       se lee sin estorbo y la marca no se puede recortar sin recortar la
       página. Un borrador impreso tiene que ser inconfundible incluso en
       fotocopia en blanco y negro, de ahí el tamaño. */
    if (datos.marcaAgua) {
      doc.save();
      doc.rotate(-38, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.font("Helvetica-Bold").fontSize(52).fillColor("#e5e7eb")
        .text(datos.marcaAgua, 0, doc.page.height / 2 - 40, { width: doc.page.width, align: "center" });
      doc.restore();
      doc.fillColor(G);
    }

    // --- Cabecera: emisor a la izquierda, tipo de documento a la derecha ---
    doc.fillColor(G).font("Helvetica-Bold").fontSize(16).text(datos.emisor.nombre || "Aura", X, doc.y);
    doc.font("Helvetica").fontSize(9).fillColor(GRIS);
    for (const linea of [
      datos.emisor.nif ? "NIF: " + datos.emisor.nif : "",
      datos.emisor.direccion,
      datos.emisor.poblacion,
      datos.emisor.pais,
      datos.emisor.email,
    ]) if (linea) doc.text(linea, X, doc.y, { width: ANCHO * 0.55 });

    const yCab = doc.page.margins.top;
    doc.font("Helvetica-Bold").fontSize(18).fillColor(G)
      .text(datos.titulo, X + ANCHO * 0.55, yCab, { width: ANCHO * 0.45, align: "right" });
    doc.font("Helvetica").fontSize(10).fillColor(GRIS);
    if (datos.numero) doc.text("Nº " + datos.numero, X + ANCHO * 0.55, doc.y, { width: ANCHO * 0.45, align: "right" });
    doc.text("Fecha: " + datos.fecha, X + ANCHO * 0.55, doc.y, { width: ANCHO * 0.45, align: "right" });
    /* V934 · Una rectificativa que no diga a qué factura se refiere no sirve:
       es el dato que permite emparejarlas en la contabilidad. */
    if (datos.rectifica) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(G)
        .text("Rectifica a la factura " + datos.rectifica, X + ANCHO * 0.55, doc.y + 3, { width: ANCHO * 0.45, align: "right" });
      doc.font("Helvetica").fontSize(9).fillColor(GRIS);
    }
    /* Y en la factura original, si ya fue rectificada, hay que verlo al abrirla:
       si no, se sigue usando un documento que ya está corregido. */
    if (datos.rectificadaPor) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#b91c1c")
        .text("Rectificada por " + datos.rectificadaPor, X + ANCHO * 0.55, doc.y + 3, { width: ANCHO * 0.45, align: "right" });
      doc.font("Helvetica").fontSize(9).fillColor(GRIS);
    }
    if (datos.sello) {
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#b91c1c")
        .text(datos.sello, X + ANCHO * 0.55, doc.y + 4, { width: ANCHO * 0.45, align: "right" });
    }

    doc.moveDown(2.2);
    doc.moveTo(X, doc.y).lineTo(X + ANCHO, doc.y).strokeColor(LINEA).stroke();
    doc.moveDown(1);

    // --- Aviso cuando NO es una factura (regla a) ---
    if (datos.aviso) {
      const yA = doc.y;
      doc.rect(X, yA, ANCHO, 34).fillColor("#fff7ed").fill();
      doc.fillColor("#9a3412").font("Helvetica-Bold").fontSize(9)
        .text(datos.aviso, X + 10, yA + 8, { width: ANCHO - 20 });
      doc.y = yA + 42;
      doc.fillColor(G);
    }

    // --- Cliente ---
    doc.font("Helvetica-Bold").fontSize(10).fillColor(G).text("Cliente", X, doc.y);
    doc.font("Helvetica").fontSize(10).fillColor(GRIS);
    doc.text(datos.cliente.nombre || "—", X, doc.y);
    if (datos.cliente.email) doc.text(datos.cliente.email, X, doc.y);
    if (datos.cliente.lugar) doc.text(datos.cliente.lugar, X, doc.y);
    doc.moveDown(1.4);

    // --- Tabla del concepto ---
    const colConcepto = ANCHO * 0.52, colNum = ANCHO * 0.16;
    let y = doc.y;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(G);
    doc.text("Concepto", X, y, { width: colConcepto });
    doc.text("Base", X + colConcepto, y, { width: colNum, align: "right" });
    doc.text(`IVA ${datos.tipoIva}%`, X + colConcepto + colNum, y, { width: colNum, align: "right" });
    doc.text("Total", X + colConcepto + colNum * 2, y, { width: colNum, align: "right" });
    y = doc.y + 4;
    doc.moveTo(X, y).lineTo(X + ANCHO, y).strokeColor(LINEA).stroke();
    y += 8;
    doc.font("Helvetica").fontSize(10).fillColor(G);
    doc.text(datos.concepto, X, y, { width: colConcepto - 8 });
    const yFin = doc.y;
    doc.text(datos.base, X + colConcepto, y, { width: colNum, align: "right" });
    doc.text(datos.iva, X + colConcepto + colNum, y, { width: colNum, align: "right" });
    doc.text(datos.total, X + colConcepto + colNum * 2, y, { width: colNum, align: "right" });
    doc.y = Math.max(yFin, y + 14);

    y = doc.y + 6;
    doc.moveTo(X + colConcepto, y).lineTo(X + ANCHO, y).strokeColor(LINEA).stroke();
    y += 8;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(G);
    doc.text("TOTAL", X + colConcepto, y, { width: colNum * 2, align: "right" });
    doc.text(datos.total, X + colConcepto + colNum * 2, y, { width: colNum, align: "right" });
    doc.moveDown(2);

    // --- Pie: forma de cobro, referencias y notas ---
    doc.font("Helvetica").fontSize(9).fillColor(GRIS);
    const pie = [
      datos.formaPago ? "Forma de cobro: " + datos.formaPago : "",
      datos.referencia ? "Referencia interna del cobro: " + datos.referencia : "",
      // V934 · El motivo es obligatorio en una rectificativa, así que se imprime.
      datos.motivo ? "Motivo de la rectificación: " + datos.motivo : "",
      datos.notaIva,
      datos.pieLegal,
    ];
    for (const linea of pie) if (linea) { doc.text(linea, X, doc.y, { width: ANCHO }); doc.moveDown(0.3); }
    doc.moveDown(0.8);
    doc.fontSize(8).fillColor("#999999")
      .text("Documento generado por Aura el " + datos.generado, X, doc.y, { width: ANCHO });

    doc.end();
  });
}

/* ---------------------------------------------------------------- */
/* Rutas                                                            */
/* ---------------------------------------------------------------- */
function register(app, pool, helpers) {
  const { wrap, getSetting } = helpers;

  /* ---- 1 · La factura / justificante de un pago -------------------
     El gate global de server.js ya exige admin en /api/payments/*
     (por cabecera o por ?adminToken), igual que en invoices-export. */
  app.get("/api/payments/:id/invoice", wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    if (!id) return res.status(400).json({ error: "bad_id" });

    const [rows] = await pool.query(
      `SELECT p.id, p.user_id, p.subscription_id, p.invoice_no, p.amount, p.currency,
              p.method, p.status, p.created_at,
              u.name AS user_name, u.email AS user_email, u.city AS user_city, u.country AS user_country
         FROM payments p
         LEFT JOIN users u ON u.id = p.user_id
        WHERE p.id=? LIMIT 1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: "not_found" });
    const pago = rows[0];

    // kind y el plan son opcionales: hay instalaciones sin esas columnas.
    try {
      const [[extra]] = await pool.query("SELECT kind, concept FROM payments WHERE id=? LIMIT 1", [id]);
      if (extra && extra.kind) pago.kind = extra.kind;
      if (extra && extra.concept) pago.concept = extra.concept; // V934 · cobro manual
    } catch {}
    if (pago.subscription_id) {
      try {
        const [[pl]] = await pool.query(
          `SELECT pl.code AS plan_code, s.period
             FROM subscriptions s LEFT JOIN plans pl ON pl.id = s.plan_id
            WHERE s.id=? LIMIT 1`,
          [pago.subscription_id]
        );
        if (pl) { pago.plan_code = pl.plan_code; pago.period = pl.period; }
      } catch {}
    }

    const emisor = datosEmisor(getSetting);
    const d = desglosa(pago.amount, emisor.tipoIva, emisor.ivaIncluido);
    const moneda = pago.currency || "EUR";
    const concepto = conceptoDe(pago);

    const snapshotDatos = {
      emisor, concepto, moneda,
      base: d.base, iva: d.iva, total: d.total,
      tipoIva: emisor.tipoIva,
      cliente: { nombre: pago.user_name, email: pago.user_email },
      fecha_pago: pago.created_at,
      referencia: pago.invoice_no || null,
    };

    /* V934 · ?preview=1 → BORRADOR. Mira y no toca: ni contador, ni fila, ni
       número. Es la diferencia entre revisar cómo va a quedar y emitir un
       documento fiscal, y hasta ahora sólo existía lo segundo. */
    const soloBorrador = req.query.preview === "1";
    const demo = esPagoDeDemostracion(pago);

    let emitida = null;
    if (soloBorrador) {
      emitida = await facturaEmitida(pool, id);
    } else {
      try {
        emitida = await asignaNumero(pool, pago, emisor, snapshotDatos);
      } catch (e) {
        console.error("[billing] no se pudo asignar número de factura:", e && e.message);
        return res.status(500).json({ error: "invoice_number_failed" });
      }
    }

    // Regla (b): si la factura ya estaba emitida, manda lo congelado.
    const usa = emitida && emitida.snapshot && emitida.snapshot.emisor ? emitida.snapshot : snapshotDatos;
    const esFactura = !!(emitida && emitida.number);

    let aviso = "";
    /* V934 · El pago de demostración se avisa ANTES que nada: es la única
       causa por la que se emitiría una factura de una venta inexistente. */
    if (demo) {
      aviso = "Este cobro es un dato de DEMOSTRACIÓN creado al instalar la aplicación "
        + "(se reconoce por el formato de su referencia). No corresponde a ninguna venta real, "
        + "así que NO se le va a emitir factura ni se le va a asignar número. Si quieres que "
        + "desaparezca del listado, usa «Purgar datos de demostración».";
    } else if (!esFactura) {
      if (!emisorCompleto(emisor)) {
        aviso = "Este documento NO es una factura: faltan los datos fiscales del emisor. "
          + "Rellénalos en el panel, en Pagos y Facturación, botón «Datos de facturación», y vuelve "
          + "a descargarlo: entonces se emitirá con número de serie.";
      } else if (String(pago.status) !== "completed") {
        aviso = "Este documento NO es una factura: el cobro no está completado (estado: "
          + String(pago.status) + "). Sólo se factura un cobro efectivo.";
      }
    }
    let sello = "";
    if (String(pago.status) === "refunded") {
      sello = "REEMBOLSADO";
      aviso = (aviso ? aviso + " " : "")
        + "Pago reembolsado. La factura rectificativa debe emitirla tu asesoría con su propia serie: "
        + "este documento no la sustituye.";
    }

    /* V934 · Si la factura ya está rectificada, quien abra la original tiene
       que verlo en la primera línea: si no, se sigue usando un documento que
       ya está corregido. La tabla puede no existir todavía (migración recién
       desplegada), así que la lectura va protegida. */
    let rectificadaPor = "";
    if (esFactura) {
      try {
        const rects = await rectificativasDe(pool, id);
        if (rects.length) rectificadaPor = rects.map((r) => r.number).join(", ");
      } catch {}
    }

    /* Texto del borrador. Se dice DENTRO del documento, no sólo en la pantalla
       del panel, porque un borrador impreso viaja solo. */
    let previsto = "";
    if (soloBorrador && !esFactura && !demo && emisorCompleto(emisor) && String(pago.status) === "completed") {
      previsto = await numeroPrevisto(pool, emisor.serie, new Date(pago.created_at || Date.now()).getFullYear());
      aviso = (aviso ? aviso + " " : "")
        + "BORRADOR. No se ha emitido nada y no se ha gastado ningún número: esto es sólo una vista previa. "
        + (previsto ? `Al descargarla de verdad le correspondería el número ${previsto} (previsión: si emites otra factura antes, será la siguiente). ` : "")
        + "Para emitirla, pulsa «Factura» en el panel.";
    } else if (soloBorrador && !esFactura) {
      aviso = (aviso ? aviso + " " : "") + "BORRADOR: vista previa, no se ha emitido nada.";
    }

    const datos = {
      titulo: esFactura ? "FACTURA" : "JUSTIFICANTE DE PAGO",
      numero: esFactura ? emitida.number : (previsto ? previsto + " (previsión)" : ""),
      marcaAgua: soloBorrador && !esFactura ? "BORRADOR" : "",
      rectificadaPor,
      fecha: fechaEs(usa.fecha_pago || pago.created_at),
      sello, aviso,
      emisor: usa.emisor,
      cliente: {
        nombre: usa.cliente ? usa.cliente.nombre : pago.user_name,
        email: usa.cliente ? usa.cliente.email : pago.user_email,
        lugar: [pago.user_city, pago.user_country].filter(Boolean).join(", "),
      },
      concepto: usa.concepto || concepto,
      tipoIva: usa.tipoIva != null ? usa.tipoIva : emisor.tipoIva,
      base: eur(usa.base, usa.moneda || moneda),
      iva: eur(usa.iva, usa.moneda || moneda),
      total: eur(usa.total, usa.moneda || moneda),
      formaPago: pago.method || "",
      referencia: usa.referencia || pago.invoice_no || "",
      notaIva: (usa.emisor && usa.emisor.notaIva) || "",
      pieLegal: (usa.emisor && usa.emisor.pie) || "",
      generado: new Date().toLocaleString("es-ES"),
    };

    const pdf = await construyePdf(datos, { compress: req.query.raw !== "1" });
    const nombre = (esFactura
      ? "factura-" + emitida.number
      : (soloBorrador ? "borrador-factura-pago-" + pago.id : "justificante-pago-" + pago.id)) + ".pdf";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${nombre}"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.send(pdf);
  }));

  /* ---- 2 · Aviso de qué hace falta para facturar ------------------
     Lo consume el modal del panel para decir si los datos están
     completos y qué número tocaría. Nada secreto: son tus propios
     datos fiscales, y esta ruta ya está detrás del candado de admin. */
  app.get("/api/billing/issuer-status", wrap(async (req, res) => {
    const emisor = datosEmisor(getSetting);
    const anio = new Date().getFullYear();
    let siguiente = 1, emitidas = 0;
    try {
      const [[c]] = await pool.query("SELECT seq FROM invoice_counters WHERE series=? AND year=? LIMIT 1", [emisor.serie, anio]);
      if (c) siguiente = Number(c.seq) + 1;
      const [[t]] = await pool.query("SELECT COUNT(*) n FROM payment_invoices WHERE year=?", [anio]);
      if (t) emitidas = Number(t.n);
    } catch {}
    res.json({
      ok: true,
      complete: emisorCompleto(emisor),
      missing: [!emisor.nombre ? "billing.issuer_name" : null, !emisor.nif ? "billing.issuer_tax_id" : null].filter(Boolean),
      series: emisor.serie,
      year: anio,
      next_number: `${emisor.serie}-${anio}-${String(siguiente).padStart(4, "0")}`,
      issued_this_year: emitidas,
      tax_rate: emisor.tipoIva,
      prices_include_tax: emisor.ivaIncluido,
    });
  }));

  /* ---- 2b · V934 · Estado fiscal de UN pago -----------------------
     El panel necesita saber tres cosas antes de pintar los botones: si ya
     hay factura emitida (entonces no se puede «editar», sólo rectificar), qué
     rectificativas lleva, y si el pago es de los de demostración. Sin esto el
     panel tendría que adivinarlo, y adivinar es lo que nos trajo aquí. */
  app.get("/api/payments/:id/invoice-state", wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    if (!id) return res.status(400).json({ error: "bad_id" });
    const [rows] = await pool.query(
      "SELECT id, invoice_no, amount, currency, status, created_at FROM payments WHERE id=? LIMIT 1", [id]);
    if (!rows.length) return res.status(404).json({ error: "not_found" });
    const pago = rows[0];
    const emisor = datosEmisor(getSetting);
    const anio = new Date(pago.created_at || Date.now()).getFullYear();

    let emitida = null, rects = [];
    try { emitida = await facturaEmitida(pool, id); } catch {}
    try { rects = await rectificativasDe(pool, id); } catch {}

    res.json({
      ok: true,
      payment_id: id,
      demo: esPagoDeDemostracion(pago),
      issuer_complete: emisorCompleto(emisor),
      status: pago.status,
      invoiceable: !esPagoDeDemostracion(pago) && emisorCompleto(emisor) && String(pago.status) === "completed",
      issued: emitida ? { number: emitida.number, issued_at: emitida.issued_at } : null,
      would_be: emitida ? null : await numeroPrevisto(pool, emisor.serie, anio),
      rectifications: rects.map((r) => ({ number: r.number, mode: r.mode, reason: r.reason, issued_at: r.issued_at })),
    });
  }));

  /* ---- 2c · V934 · Emitir una rectificativa -----------------------
     Aquí es donde se atiende «modificarla por si está mal», que no se puede
     hacer como una edición. Exige factura emitida y motivo escrito. */
  app.post("/api/payments/:id/invoice/rectify", wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    if (!id) return res.status(400).json({ error: "bad_id" });
    const modo = String(req.body?.mode || "").toLowerCase();
    const motivo = String(req.body?.reason || "").trim().slice(0, 300);
    if (modo !== "anulacion" && modo !== "sustitucion") {
      return res.status(400).json({ error: "bad_mode", detail: "mode debe ser 'anulacion' o 'sustitucion'" });
    }
    if (motivo.length < 3) {
      return res.status(400).json({ error: "reason_required", detail: "Una rectificativa sin motivo escrito no vale: es un dato obligatorio del documento." });
    }
    const [rows] = await pool.query(
      `SELECT p.id, p.user_id, p.invoice_no, p.amount, p.currency, p.method, p.status, p.created_at,
              u.name AS user_name, u.email AS user_email
         FROM payments p LEFT JOIN users u ON u.id = p.user_id
        WHERE p.id=? LIMIT 1`, [id]);
    if (!rows.length) return res.status(404).json({ error: "not_found" });
    const pago = rows[0];

    const original = await facturaEmitida(pool, id);
    if (!original) {
      return res.status(409).json({
        error: "not_issued",
        detail: "Este pago no tiene factura emitida, así que no hay nada que rectificar. "
          + "Si lo que descargaste fue un justificante, corrige los datos y vuelve a descargarlo: "
          + "el justificante no lleva número y no deja rastro fiscal.",
      });
    }

    const emisor = datosEmisor(getSetting);
    const cambios = {
      concepto: req.body?.concepto ? String(req.body.concepto).slice(0, 190) : null,
      cliente_nombre: req.body?.cliente_nombre ? String(req.body.cliente_nombre).slice(0, 190) : null,
      cliente_email: req.body?.cliente_email ? String(req.body.cliente_email).slice(0, 190) : null,
      total_cent: req.body?.total_cent != null && String(req.body.total_cent) !== ""
        ? Math.round(Number(req.body.total_cent)) : null,
    };
    if (cambios.total_cent != null && (!Number.isFinite(cambios.total_cent) || cambios.total_cent < 0 || cambios.total_cent > 100000000)) {
      return res.status(400).json({ error: "bad_total" });
    }

    let r;
    try {
      r = await emiteRectificativa(pool, { pago, original, emisor, modo, motivo, cambios });
    } catch (e) {
      console.error("[billing] rectificativa fallida:", e && e.message);
      return res.status(500).json({ error: "rectify_failed" });
    }
    res.json({ ok: true, number: r.number, rectifies: original.number, mode: modo });
  }));

  /* ---- 2d · V934 · El PDF de una rectificativa -------------------- */
  app.get("/api/payments/:id/rectification/:num", wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const num = String(req.params.num || "").slice(0, 40);
    if (!id || !num) return res.status(400).json({ error: "bad_id" });
    const [rows] = await pool.query(
      `SELECT number, rectifies, mode, reason, issued_at, snapshot
         FROM payment_invoice_rectifications WHERE payment_id=? AND number=? LIMIT 1`, [id, num]);
    if (!rows.length) return res.status(404).json({ error: "not_found" });
    let snap = {};
    try { snap = JSON.parse(rows[0].snapshot); } catch {}

    const moneda = snap.moneda || "EUR";
    const datos = {
      titulo: "FACTURA RECTIFICATIVA",
      numero: rows[0].number,
      rectifica: rows[0].rectifies,
      fecha: fechaEs(rows[0].issued_at),
      sello: rows[0].mode === "anulacion" ? "ANULACIÓN" : "",
      aviso: rows[0].mode === "anulacion"
        ? `Esta rectificativa deja sin efecto la factura ${rows[0].rectifies} por el total de la operación. `
          + "Los importes van en negativo a propósito: así el ejercicio cuadra sin borrar ni reescribir la factura original, que sigue existiendo."
        : `Esta rectificativa sustituye los datos de la factura ${rows[0].rectifies}. `
          + "La original sigue existiendo y no se ha modificado: es este documento el que prevalece.",
      emisor: snap.emisor || {},
      cliente: {
        nombre: snap.cliente ? snap.cliente.nombre : "",
        email: snap.cliente ? snap.cliente.email : "",
        lugar: "",
      },
      concepto: snap.concepto || "",
      tipoIva: snap.tipoIva != null ? snap.tipoIva : 0,
      base: eur(snap.base || 0, moneda),
      iva: eur(snap.iva || 0, moneda),
      total: eur(snap.total || 0, moneda),
      formaPago: "",
      referencia: snap.referencia || "",
      motivo: rows[0].reason,
      notaIva: (snap.emisor && snap.emisor.notaIva) || "",
      pieLegal: (snap.emisor && snap.emisor.pie) || "",
      generado: new Date().toLocaleString("es-ES"),
    };
    const pdf = await construyePdf(datos, { compress: req.query.raw !== "1" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="rectificativa-${rows[0].number}.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.send(pdf);
  }));

  /* ---- 2e · V934 · Borrador con los datos SIN GUARDAR -------------
     Esto es literalmente «previsualizar la factura antes de guardarla»: el
     formulario manda lo que hay escrito en sus campos y se dibuja una factura
     de ejemplo con ellos. No se guarda ningún ajuste, no se toca el contador y
     el importe es inventado (9,99) a propósito: así no se arrastra el nombre
     de un cliente real a un documento de prueba. */
  app.get("/api/billing/preview", wrap(async (req, res) => {
    const q = (k, max) => (req.query[k] != null ? String(req.query[k]).slice(0, max) : null);
    const guardado = datosEmisor(getSetting);
    const emisor = {
      nombre: q("nombre", 190) != null ? q("nombre", 190) : guardado.nombre,
      nif: q("nif", 30) != null ? q("nif", 30) : guardado.nif,
      direccion: q("direccion", 190) != null ? q("direccion", 190) : guardado.direccion,
      poblacion: q("poblacion", 190) != null ? q("poblacion", 190) : guardado.poblacion,
      pais: q("pais", 90) != null ? q("pais", 90) : guardado.pais,
      email: q("email", 190) != null ? q("email", 190) : guardado.email,
      serie: (q("serie", 12) != null ? q("serie", 12) : guardado.serie || "A").toUpperCase(),
      serieRect: guardado.serieRect,
      tipoIva: req.query.iva != null ? (Number(req.query.iva) || 0) : guardado.tipoIva,
      ivaIncluido: req.query.incluido != null ? String(req.query.incluido) !== "false" : guardado.ivaIncluido,
      notaIva: q("nota", 300) != null ? q("nota", 300) : guardado.notaIva,
      pie: q("pie", 300) != null ? q("pie", 300) : guardado.pie,
    };

    const completo = emisorCompleto(emisor);
    const d = desglosa(9.99, emisor.tipoIva, emisor.ivaIncluido);
    const anio = new Date().getFullYear();
    const previsto = completo ? await numeroPrevisto(pool, emisor.serie, anio) : "";

    const datos = {
      titulo: completo ? "FACTURA" : "JUSTIFICANTE DE PAGO",
      numero: previsto ? previsto + " (previsión)" : "",
      marcaAgua: "EJEMPLO",
      fecha: fechaEs(new Date()),
      sello: "",
      aviso: (completo
        ? "EJEMPLO con tus datos actuales del formulario. No se ha guardado ningún ajuste, no se ha emitido nada "
          + "y no se ha gastado ningún número. El importe y el cliente son inventados para que veas el formato."
        : "EJEMPLO. Faltan el nombre o el NIF, así que con estos datos NO saldría una factura, sino un justificante "
          + "de pago sin número de serie. Rellena los dos campos y vuelve a previsualizar."),
      emisor,
      cliente: { nombre: "Cliente de ejemplo", email: "cliente@ejemplo.es", lugar: "Sevilla, España" },
      concepto: "Suscripción Aura · plan premium (mensual)",
      tipoIva: emisor.tipoIva,
      base: eur(d.base, "EUR"), iva: eur(d.iva, "EUR"), total: eur(d.total, "EUR"),
      formaPago: "stripe",
      referencia: "",
      notaIva: emisor.notaIva || "",
      pieLegal: emisor.pie || "",
      generado: new Date().toLocaleString("es-ES"),
    };
    const pdf = await construyePdf(datos, { compress: req.query.raw !== "1" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="ejemplo-factura.pdf"');
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.send(pdf);
  }));

  /* ---- 2f · V934 · Cobro manual (factura a cualquier usuario) -----
     Para lo que no pasa por Stripe: una transferencia, un cobro en mano. Se
     registra como pago de verdad en la tabla payments (kind='manual') y a
     partir de ahí se previsualiza y se factura por el mismo camino que
     cualquier otro. Se hace así, y no emitiendo una factura suelta, porque una
     factura sin operación detrás no debería poder existir: el documento sale
     de un cobro registrado, no al revés.

     La referencia interna se construye con el id de la fila (MAN-AÑOMES-000123)
     y no con bytes al azar: es legible, ordenada y no mete aleatoriedad en un
     módulo cuyo trabajo es justamente no numerar al azar. */
  app.post("/api/payments/manual", wrap(async (req, res) => {
    const quien = String(req.body?.user || "").trim().slice(0, 190);
    const concepto = String(req.body?.concept || "").trim().slice(0, 190);
    const importe = Number(req.body?.amount);
    const moneda = String(req.body?.currency || "EUR").toUpperCase().slice(0, 3);
    const metodo = String(req.body?.method || "manual").trim().slice(0, 40) || "manual";
    const fecha = req.body?.date ? String(req.body.date).slice(0, 30) : null;

    if (!quien) return res.status(400).json({ error: "user_required", detail: "Indica el usuario por id o por email." });
    if (concepto.length < 3) return res.status(400).json({ error: "concept_required", detail: "El concepto es obligatorio: es lo que se lee en la factura." });
    if (!Number.isFinite(importe) || importe <= 0 || importe > 1000000) {
      return res.status(400).json({ error: "bad_amount", detail: "Importe fuera de rango." });
    }
    if (!/^[A-Z]{3}$/.test(moneda)) return res.status(400).json({ error: "bad_currency" });

    let cuando = null;
    if (fecha) {
      const t = new Date(fecha);
      if (isNaN(t.getTime())) return res.status(400).json({ error: "bad_date" });
      // Facturar con fecha futura es inventarse una operación que no ha pasado.
      if (t.getTime() > Date.now() + 24 * 3600 * 1000) {
        return res.status(400).json({ error: "future_date", detail: "No se puede registrar un cobro con fecha futura." });
      }
      cuando = t;
    }

    const [us] = /^\d+$/.test(quien)
      ? await pool.query("SELECT id, name, email FROM users WHERE id=? LIMIT 1", [parseInt(quien, 10)])
      : await pool.query("SELECT id, name, email FROM users WHERE email=? LIMIT 1", [quien]);
    if (!us.length) return res.status(404).json({ error: "user_not_found", detail: "No hay ningún usuario con ese id o email." });
    const usuario = us[0];

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [r] = await conn.query(
        `INSERT INTO payments (user_id, amount, currency, method, status, kind, concept, created_at)
         VALUES (?,?,?,?, 'completed', 'manual', ?, ?)`,
        [usuario.id, importe.toFixed(2), moneda, metodo, concepto, cuando || new Date()]
      );
      const nuevoId = r.insertId;
      const f = cuando || new Date();
      const ym = `${f.getFullYear()}${String(f.getMonth() + 1).padStart(2, "0")}`;
      const referencia = `MAN-${ym}-${String(nuevoId).padStart(6, "0")}`;
      await conn.query("UPDATE payments SET invoice_no=? WHERE id=?", [referencia, nuevoId]);
      await conn.commit();
      res.json({ ok: true, payment_id: nuevoId, invoice_no: referencia, user: { id: usuario.id, name: usuario.name, email: usuario.email } });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      console.error("[billing] cobro manual fallido:", e && e.message);
      res.status(500).json({ error: "manual_payment_failed" });
    } finally {
      conn.release();
    }
  }));

  /* ---- 3 · El informe imprimible de Estadísticas ------------------
     Cambio 1: en vez de fabricar un PDF con las gráficas dentro, se
     sirve una página A4 lista para imprimir (Ctrl+P → Guardar como
     PDF). No duplica NINGUNA consulta: pide los datos a las rutas de
     estadísticas que ya existen, así que si mañana cambia un KPI, el
     informe cambia con él y no se queda mintiendo por su cuenta. */
  app.get("/api/stats/report", wrap(async (req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.send(informeHtml());
  }));
}

/* ---------------------------------------------------------------- */
/* La página del informe                                            */
/* ---------------------------------------------------------------- */
/* Ojo con dos cosas de esta página:
   · Los valores se meten con textContent, NUNCA con innerHTML. Vienen de
     nuestra propia API, pero incluyen nombres de ciudad y de zona que
     alguien escribe a mano en el panel: con innerHTML, un nombre de
     ciudad con <script> se ejecutaría aquí dentro.
   · El adminToken viaja en la URL (como en el CSV de movimientos y en la
     copia de seguridad), así que la respuesta va con no-store, noindex y
     Referrer-Policy: no-referrer para que no se filtre por el referer. */
function informeHtml() {
  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Informe de estadísticas · Aura</title>
<style>
  :root { --tinta:#111; --suave:#666; --linea:#e5e7eb; --acento:#ec4899; }
  * { box-sizing:border-box; }
  body { margin:0; background:#f3f4f6; color:var(--tinta);
         font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .hoja { width:210mm; min-height:297mm; margin:16px auto; padding:16mm 14mm; background:#fff;
          box-shadow:0 2px 14px rgba(0,0,0,.12); }
  h1 { font-size:22px; margin:0 0 2px; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--suave);
       margin:22px 0 8px; border-bottom:1px solid var(--linea); padding-bottom:5px; }
  .sub { color:var(--suave); font-size:12px; margin:0 0 4px; }
  .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:14px; }
  .kpi { border:1px solid var(--linea); border-radius:8px; padding:10px 12px; }
  .kpi b { display:block; font-size:19px; }
  .kpi span { font-size:11px; color:var(--suave); }
  .kpi i { font-size:11px; font-style:normal; }
  .sube { color:#059669; } .baja { color:#dc2626; }
  table { width:100%; border-collapse:collapse; font-size:12.5px; }
  th, td { text-align:left; padding:5px 6px; border-bottom:1px solid var(--linea); }
  th { color:var(--suave); font-weight:600; font-size:11px; text-transform:uppercase; }
  td.n, th.n { text-align:right; }
  .barra { height:7px; background:var(--acento); border-radius:4px; display:block; }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:22px; }
  .pie { margin-top:26px; padding-top:8px; border-top:1px solid var(--linea);
         color:var(--suave); font-size:11px; }
  .barraSup { position:sticky; top:0; background:#111; color:#fff; padding:8px 14px;
              display:flex; gap:10px; align-items:center; justify-content:center; }
  .barraSup button { background:var(--acento); color:#fff; border:0; border-radius:8px;
                     padding:7px 14px; font-size:13px; cursor:pointer; }
  .barraSup span { font-size:12px; color:#bbb; }
  .aviso { background:#fff7ed; border:1px solid #fed7aa; color:#9a3412; padding:9px 11px;
           border-radius:8px; font-size:12px; margin-top:12px; }
  @media print {
    body { background:#fff; }
    .barraSup { display:none; }
    .hoja { width:auto; min-height:0; margin:0; padding:0; box-shadow:none; }
    h2 { break-after:avoid; } table { break-inside:avoid; }
    @page { size:A4; margin:14mm; }
  }
</style></head><body>
<div class="barraSup">
  <button onclick="window.print()">Imprimir / Guardar como PDF</button>
  <span>Se guarda como PDF desde el diálogo de impresión (Destino → Guardar como PDF).</span>
</div>
<div class="hoja">
  <h1>Informe de estadísticas</h1>
  <p class="sub" id="cuando">Cargando…</p>
  <div id="aviso"></div>
  <div class="kpis" id="kpis"></div>
  <h2>Tendencia de los últimos 7 días</h2>
  <table id="tabTend"></table>
  <div class="cols">
    <div><h2>Por zona</h2><table id="tabZonas"></table></div>
    <div><h2>Ciudades con más usuarios</h2><table id="tabCiudades"></table></div>
  </div>
  <div class="cols">
    <div><h2>Género</h2><table id="tabGenero"></table></div>
    <div><h2>Orientación</h2><table id="tabOrient"></table></div>
  </div>
  <p class="pie" id="pie"></p>
</div>
<script>
(function () {
  var tok = new URLSearchParams(location.search).get("adminToken") || "";
  var quiereImprimir = new URLSearchParams(location.search).get("print") === "1";

  function pide(ruta) {
    var sep = ruta.indexOf("?") >= 0 ? "&" : "?";
    return fetch(ruta + sep + "adminToken=" + encodeURIComponent(tok), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  }
  function num(v) {
    var n = Number(v || 0);
    return n.toLocaleString("es-ES", { maximumFractionDigits: 2 });
  }
  function el(tag, texto, clase) {
    var e = document.createElement(tag);
    if (texto != null) e.textContent = String(texto);
    if (clase) e.className = clase;
    return e;
  }
  function kpi(valor, etiqueta, tendencia) {
    var d = el("div", null, "kpi");
    d.appendChild(el("b", valor));
    d.appendChild(el("span", etiqueta));
    if (tendencia != null && tendencia !== "") {
      var t = Number(tendencia);
      var i = el("i", (t >= 0 ? "▲ " : "▼ ") + num(Math.abs(t)) + "% vs semana anterior",
                 t >= 0 ? "sube" : "baja");
      d.appendChild(i);
    }
    return d;
  }
  // Tabla de dos columnas con barra proporcional. Los textos van por
  // textContent: nunca innerHTML, que aquí entran nombres escritos a mano.
  function pinta(tabla, cabeceras, filas) {
    var t = document.getElementById(tabla);
    t.textContent = "";
    var thead = document.createElement("thead"), tr = document.createElement("tr");
    cabeceras.forEach(function (c, i) {
      var th = el("th", c, i > 0 ? "n" : "");
      tr.appendChild(th);
    });
    thead.appendChild(tr); t.appendChild(thead);
    var tbody = document.createElement("tbody");
    var max = 0;
    filas.forEach(function (f) { max = Math.max(max, Number(f[1] || 0)); });
    if (!filas.length) {
      var vacia = document.createElement("tr");
      var td = el("td", "Sin datos todavía");
      td.colSpan = cabeceras.length; td.style.color = "#666";
      vacia.appendChild(td); tbody.appendChild(vacia);
    }
    filas.forEach(function (f) {
      var fila = document.createElement("tr");
      fila.appendChild(el("td", f[0]));
      fila.appendChild(el("td", num(f[1]), "n"));
      var tdB = el("td", null, "n");
      if (max > 0) {
        var b = el("span", null, "barra");
        b.style.width = Math.max(2, Math.round((Number(f[1] || 0) / max) * 100)) + "%";
        b.style.marginLeft = "auto";
        tdB.appendChild(b);
      }
      fila.appendChild(tdB);
      tbody.appendChild(fila);
    });
    t.appendChild(tbody);
  }
  function aviso(texto) {
    var c = document.getElementById("aviso");
    c.textContent = "";
    if (texto) c.appendChild(el("div", texto, "aviso"));
  }

  Promise.all([
    pide("/api/stats/dashboard"),
    pide("/api/stats/zones").catch(function () { return []; }),
    pide("/api/stats/cities").catch(function () { return []; }),
    pide("/api/stats/gender").catch(function () { return []; }),
    pide("/api/stats/orientation").catch(function () { return []; })
  ]).then(function (r) {
    var d = r[0] || {}, zonas = r[1] || [], ciudades = r[2] || [], gen = r[3] || [], ori = r[4] || [];
    var ahora = new Date();
    document.getElementById("cuando").textContent =
      "Datos a " + ahora.toLocaleDateString("es-ES") + " a las " + ahora.toLocaleTimeString("es-ES");

    var k = document.getElementById("kpis");
    k.textContent = "";
    k.appendChild(kpi(num(d.total), "Usuarios registrados"));
    k.appendChild(kpi(num(d.active), "Cuentas activas"));
    k.appendChild(kpi(num(d.online), "En línea ahora"));
    k.appendChild(kpi(num(d.subscriptions), "Suscripciones"));
    k.appendChild(kpi(num(d.mrr) + " €", "MRR", d.mrr_trend));
    k.appendChild(kpi(num(d.matches), "Matches", d.matches_trend));
    k.appendChild(kpi(num(d.signups_week), "Altas esta semana", d.signups_trend));
    k.appendChild(kpi(num(d.open_reports), "Reportes abiertos"));

    pinta("tabTend", ["Métrica", "Últimos 7 días", ""], [
      ["Altas", d.signups_7d], ["Matches", d.matches_7d], ["Ingresos (€)", d.mrr_7d]
    ]);
    pinta("tabZonas", ["Zona", "Usuarios", ""], zonas.map(function (z) { return [z.zone || "—", z.c]; }));
    pinta("tabCiudades", ["Ciudad", "Usuarios", ""], ciudades.map(function (c) { return [c.name || "—", c.c]; }));
    pinta("tabGenero", ["Género", "Usuarios", ""], gen.map(function (g) { return [g.gender || "—", g.c]; }));
    pinta("tabOrient", ["Orientación", "Usuarios", ""], ori.map(function (o) { return [o.orientation || "—", o.c]; }));

    if (!Number(d.total)) aviso("Todavía no hay usuarios registrados: los ceros de este informe son reales, no un error de carga.");
    document.getElementById("pie").textContent =
      "Aura · informe generado el " + ahora.toLocaleString("es-ES") +
      " desde los datos en vivo del panel. Los importes son cobros registrados en la base de datos; " +
      "no incluyen ingresos de anuncios, que Google informa por su cuenta.";

    if (quiereImprimir) setTimeout(function () { window.print(); }, 350);
  }).catch(function (e) {
    document.getElementById("cuando").textContent = "No se pudieron cargar los datos.";
    aviso("Error al pedir las estadísticas (" + (e && e.message ? e.message : "desconocido") +
          "). Si dice 401, la sesión del panel ha caducado: vuelve a entrar y pulsa otra vez el botón.");
  });
})();
</` + `script>
</body></html>`;
}

module.exports = {
  migrate,
  register,
  __test: {
    datosEmisor, emisorCompleto, desglosa, conceptoDe, eur, construyePdf, asignaNumero, informeHtml,
    // V934
    esPagoDeDemostracion, siguienteSeq, facturaEmitida, numeroPrevisto, emiteRectificativa, rectificativasDe,
  },
};
