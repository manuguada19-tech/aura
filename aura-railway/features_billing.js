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
  if (k === "subscription" || pago.subscription_id) {
    return pago.plan_code
      ? `Suscripción Aura · plan ${pago.plan_code}${pago.period ? " (" + (pago.period === "yearly" ? "anual" : "mensual") + ")" : ""}`
      : "Suscripción Aura";
  }
  if (k === "reads_pack") return "Pack de lecturas de chat";
  if (k === "credits") return "Créditos Aura";
  if (k) return `Servicio Aura · ${k}`;
  return "Servicio Aura";
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
    await conn.query("INSERT IGNORE INTO invoice_counters (series, year, seq) VALUES (?,?,0)", [emisor.serie, anio]);
    await conn.query("UPDATE invoice_counters SET seq = LAST_INSERT_ID(seq + 1) WHERE series=? AND year=?", [emisor.serie, anio]);
    const [[{ seq }]] = await conn.query("SELECT LAST_INSERT_ID() AS seq");
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
      const [[extra]] = await pool.query("SELECT kind FROM payments WHERE id=? LIMIT 1", [id]);
      if (extra && extra.kind) pago.kind = extra.kind;
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

    let emitida = null;
    try {
      emitida = await asignaNumero(pool, pago, emisor, snapshotDatos);
    } catch (e) {
      console.error("[billing] no se pudo asignar número de factura:", e && e.message);
      return res.status(500).json({ error: "invoice_number_failed" });
    }

    // Regla (b): si la factura ya estaba emitida, manda lo congelado.
    const usa = emitida && emitida.snapshot && emitida.snapshot.emisor ? emitida.snapshot : snapshotDatos;
    const esFactura = !!(emitida && emitida.number);

    let aviso = "";
    if (!esFactura) {
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

    const datos = {
      titulo: esFactura ? "FACTURA" : "JUSTIFICANTE DE PAGO",
      numero: esFactura ? emitida.number : "",
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
    const nombre = (esFactura ? "factura-" + emitida.number : "justificante-pago-" + pago.id) + ".pdf";
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
  __test: { datosEmisor, emisorCompleto, desglosa, conceptoDe, eur, construyePdf, asignaNumero, informeHtml },
};
