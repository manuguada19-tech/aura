/* ================================================================
   AURA · Seed de stickers predefinidos por pack       V564
   ---------------------------------------------------------------
   Se ejecuta al migrar la fase 1. Crea (si no existen) 4 packs
   con stickers reales alojados en el CDN público de Twemoji.
   Twemoji está bajo licencia CC-BY 4.0 (compatible con uso comercial
   con atribución en la app).

   Packs incluidos:
     1) aura-classic   (Oro)      → corazones, likes, romance
     2) aura-fun       (Gratis)   → caritas, risas, gestos
     3) aura-party     (Oro)      → fiesta, música, celebración
     4) aura-premium   (Platino)  → estrellas, joyas, exclusivos

   Cada sticker se referencia por su codepoint hex de Unicode:
     https://twemoji.maxcdn.com/v/latest/72x72/{codepoint}.png
   Como alternativa usa jsdelivr:
     https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/{codepoint}.png
   Usamos jsdelivr por estabilidad.
   ================================================================ */
"use strict";

const CDN = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72";
const url = (cp) => `${CDN}/${cp}.png`;

const PACKS = [
  {
    slug: "aura-classic",
    name: "Aura Clásicos",
    min_plan: "gold",
    sort_order: 1,
    cover: "2764",
    stickers: [
      { slug: "corazon-rojo",       cp: "2764",       keywords: "amor, corazon, love, te quiero" },
      { slug: "corazon-flechado",   cp: "1f498",      keywords: "cupido, flechazo, enamorar" },
      { slug: "corazon-brillante",  cp: "1f496",      keywords: "amor, brillante, ilusion" },
      { slug: "corazon-latiendo",   cp: "1f493",      keywords: "corazon, latido, emocion" },
      { slug: "besos",              cp: "1f618",      keywords: "beso, kiss, muack" },
      { slug: "enamorado",          cp: "1f60d",      keywords: "enamorado, love, guapo, guapa" },
      { slug: "sonrojado",          cp: "1f60a",      keywords: "sonrojado, timido, cute" },
      { slug: "abrazo",             cp: "1f917",      keywords: "abrazo, hug, apapachar" },
      { slug: "rosa",               cp: "1f339",      keywords: "rosa, flor, regalo, romantico" },
      { slug: "ramo",               cp: "1f490",      keywords: "ramo, flores, boda, aniversario" },
      { slug: "anillo",             cp: "1f48d",      keywords: "anillo, pedida, matrimonio" },
      { slug: "chispa",             cp: "2728",       keywords: "chispa, magia, especial" },
    ],
  },
  {
    slug: "aura-fun",
    name: "Aura Diversión",
    min_plan: "free",
    sort_order: 2,
    cover: "1f602",
    stickers: [
      { slug: "risa-llorando",  cp: "1f602", keywords: "risa, jaja, lol" },
      { slug: "carcajada",      cp: "1f923", keywords: "carcajada, muerto de risa" },
      { slug: "sonrisa",        cp: "1f60a", keywords: "sonrisa, contento, feliz" },
      { slug: "guino",          cp: "1f609", keywords: "guiño, wink, complicidad" },
      { slug: "pensativo",      cp: "1f914", keywords: "pensando, dudando, hmm" },
      { slug: "sorprendido",    cp: "1f62e", keywords: "sorpresa, wow, oh" },
      { slug: "gafas-sol",      cp: "1f60e", keywords: "cool, gafas, sol, chulo" },
      { slug: "aplauso",        cp: "1f44f", keywords: "aplauso, bravo, ovacion" },
      { slug: "pulgar-arriba",  cp: "1f44d", keywords: "like, ok, aprobado, mola" },
      { slug: "ok-mano",        cp: "1f44c", keywords: "ok, perfecto, vale" },
      { slug: "fuego",          cp: "1f525", keywords: "fuego, caliente, buenisimo" },
      { slug: "100",            cp: "1f4af", keywords: "cien, perfecto, top" },
    ],
  },
  {
    slug: "aura-party",
    name: "Aura Fiesta",
    min_plan: "gold",
    sort_order: 3,
    cover: "1f389",
    stickers: [
      { slug: "confeti",       cp: "1f389", keywords: "fiesta, confeti, celebracion" },
      { slug: "bola-disco",    cp: "1faa9", keywords: "disco, fiesta, baile" },
      { slug: "copa-champan",  cp: "1f942", keywords: "brindis, champan, celebrar" },
      { slug: "cocteles",      cp: "1f378", keywords: "cocktail, copa, bar" },
      { slug: "cerveza",       cp: "1f37b", keywords: "cerveza, brindis, tapeo" },
      { slug: "tarta",         cp: "1f382", keywords: "cumple, tarta, aniversario" },
      { slug: "musica",        cp: "1f3b5", keywords: "musica, cancion, playlist" },
      { slug: "microfono",     cp: "1f3a4", keywords: "karaoke, canta, microfono" },
      { slug: "auriculares",   cp: "1f3a7", keywords: "musica, auriculares, dj" },
      { slug: "bailar-mujer",  cp: "1f483", keywords: "bailar, mujer, fiesta" },
      { slug: "bailar-hombre", cp: "1f57a", keywords: "bailar, hombre, disco" },
      { slug: "fuegos",        cp: "1f386", keywords: "fuegos artificiales, celebrar" },
    ],
  },
  {
    slug: "aura-premium",
    name: "Aura Platino",
    min_plan: "platinum",
    sort_order: 4,
    cover: "1f48e",
    stickers: [
      { slug: "diamante",      cp: "1f48e", keywords: "diamante, joya, premium, top" },
      { slug: "corona",        cp: "1f451", keywords: "corona, reina, rey, vip" },
      { slug: "estrella",      cp: "2b50",  keywords: "estrella, favorita, top" },
      { slug: "estrella-fugaz",cp: "1f320", keywords: "estrella, deseo, magia" },
      { slug: "trofeo",        cp: "1f3c6", keywords: "trofeo, ganador, campeon" },
      { slug: "medalla",       cp: "1f947", keywords: "medalla, oro, ganador" },
      { slug: "cohete",        cp: "1f680", keywords: "cohete, exito, subir, top" },
      { slug: "candado-corazon",cp: "1f49f",keywords: "corazon, candado, exclusivo" },
      { slug: "arcoiris",      cp: "1f308", keywords: "arcoiris, unico, especial" },
      { slug: "unicornio",     cp: "1f984", keywords: "unicornio, magico, unico" },
      { slug: "regalo",        cp: "1f381", keywords: "regalo, sorpresa, cumple" },
      { slug: "corazon-plata", cp: "1fa77", keywords: "corazon, plata, elegante" },
    ],
  },
];

/**
 * Siembra packs y stickers si no existen ya.
 * @param {*} pool mysql2 pool
 * @param {object} opts { force: boolean } → si true, borra y regenera
 */
async function seedStickers(pool, opts = {}) {
  const force = opts.force === true;
  let packsCreated = 0, stickersCreated = 0, packsUpdated = 0;

  for (const pack of PACKS) {
    const [[existing]] = await pool.query(
      "SELECT id FROM sticker_packs WHERE slug=? LIMIT 1",
      [pack.slug]
    ).then((rr) => [rr[0]]);
    let packId;
    if (existing) {
      packId = existing.id;
      if (force) {
        await pool.execute("DELETE FROM stickers WHERE pack_id=?", [packId]);
      }
      // Refresca cover si falta
      await pool.execute(
        "UPDATE sticker_packs SET name=?, min_plan=?, sort_order=?, cover_url=?, active=1 WHERE id=?",
        [pack.name, pack.min_plan, pack.sort_order, url(pack.cover), packId]
      );
      packsUpdated++;
    } else {
      const [r] = await pool.execute(
        "INSERT INTO sticker_packs (slug,name,min_plan,sort_order,cover_url,active) VALUES (?,?,?,?,?,1)",
        [pack.slug, pack.name, pack.min_plan, pack.sort_order, url(pack.cover)]
      );
      packId = r.insertId;
      packsCreated++;
    }
    // ¿Tiene stickers ya?
    const [[cnt]] = await pool.query(
      "SELECT COUNT(*) c FROM stickers WHERE pack_id=?",
      [packId]
    ).then((rr) => [rr[0]]);
    if (cnt.c > 0 && !force) continue;
    // Insert stickers
    let order = 0;
    for (const s of pack.stickers) {
      await pool.execute(
        "INSERT INTO stickers (pack_id,slug,url,keywords,sort_order) VALUES (?,?,?,?,?)",
        [packId, s.slug, url(s.cp), s.keywords, order++]
      );
      stickersCreated++;
    }
  }
  console.log(`[phase1] stickers seeded: packs_new=${packsCreated} packs_upd=${packsUpdated} stickers=${stickersCreated}`);
  return { packsCreated, packsUpdated, stickersCreated };
}

module.exports = { seedStickers, PACKS };
