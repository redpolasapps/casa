// Cada mañana: descarga la previsión (Open-Meteo, zona aproximada del barrio) y le pide a Gemini
// un consejo de ropa para un niño de 4 años (ir al cole y volver) y un resumen del día. Escribe tiempo.json.
// Sin dependencias: Node 20+.  Variables: GEMINI_API_KEY (obligatoria), ENTRADA / SALIDA (opcional, "08:00" / "17:00").
import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";

// Todo lo propio de cada casa está en config.js (el mismo archivo que usa el panel)
const CFG = await (async () => { try { const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(await readFile(new URL("../config.js", import.meta.url), "utf8"), ctx); return ctx.window.CONFIG || {}; } catch { return {}; } })();
const LAT = CFG.lat ?? 41.44, LON = CFG.lon ?? 2.19; // zona aproximada, nunca la dirección
const ZONA = CFG.zona || "Europe/Madrid", CIUDAD = CFG.ciudad || "Barcelona", EDAD = CFG.edad || 4;
const ENTRADA = CFG.entrada || "08:00", ENTRADA_HASTA = CFG.entradaHasta || ENTRADA, SALIDA = CFG.salida || "17:00";
const MODELOS = [process.env.GEMINI_MODEL || "gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest"];
const log = (...a) => console.log("[tiempo]", ...a);
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
const aMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };

// Dos tandas al día, a las horas de config.js ("actualizar"): mañana (con las cenas) y tarde (antes de ir a buscarle).
// GitHub lanza esto cada media hora; solo trabaja si toca y esa tanda no está hecha hoy.
const HORAS = (CFG.actualizar && CFG.actualizar.length ? CFG.actualizar : ["05:40", "15:40"]).map(aMin);
const AHORA = aMin(new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()));
const TANDA = AHORA >= (HORAS[1] ?? 720) - 10 ? "tarde" : "manana";
if (process.env.PROGRAMADO === "1") {
  const desde = TANDA === "tarde" ? HORAS[1] : HORAS[0];
  const ok = AHORA >= desde - 10 && AHORA < desde + 180;
  let previo = null; try { previo = JSON.parse(await readFile(new URL("../tiempo.json", import.meta.url), "utf8")); } catch {}
  if (!ok || (previo && previo.fecha === hoy && previo.tanda === TANDA)) { log(`Nada que hacer (tanda ${TANDA}: ${ok ? "ya hecha" : "aún no toca"})`); process.exit(0); }
}

async function gemini(prompt) {
  const key = process.env.GEMINI_API_KEY; if (!key) throw new Error("Falta GEMINI_API_KEY");
  let err;
  for (const modelo of MODELOS) for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.4 } }),
        signal: AbortSignal.timeout(60000),
      });
      const t = await r.text();
      if (r.status === 404) { err = new Error(modelo + " 404"); break; }
      if (!r.ok) throw new Error(`${modelo}: HTTP ${r.status} ${t.slice(0, 200)}`);
      const out = (JSON.parse(t).candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      log("Gemini:", modelo); return JSON.parse(out.replace(/^```(json)?|```$/g, "").trim());
    } catch (e) { err = e; log("Fallo:", e.message); await new Promise((r) => setTimeout(r, 4000 * i)); }
  }
  throw err;
}

const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,uv_index&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_gusts_10m_max,uv_index_max&timezone=${encodeURIComponent(ZONA)}&forecast_days=1`;
async function bajar(u, opts = {}, intentos = 2) {
  for (let i = 1; i <= intentos; i++) {
    try { const r = await fetch(u, { ...opts, signal: AbortSignal.timeout(20000) }); if (r.ok) return await r.json(); log("HTTP", r.status, u.slice(0, 40)); }
    catch (e) { log(`Intento ${i} (${u.slice(8, 30)}):`, e.cause?.code || e.message); }
    await new Promise((r) => setTimeout(r, 4000 * i));
  }
  return null;
}
const horaMadrid = (iso) => new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const diaMadrid = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date(iso));

// 1) Open-Meteo; 2) si no responde desde GitHub, MET Norway (api.met.no)
let filas = [], resumen = "";
const w = await bajar(url);
if (w) {
  const H = w.hourly;
  for (let i = 0; i < H.time.length; i++) {
    const hh = Number(H.time[i].slice(11, 13)); if (hh < 6 || hh > 21) continue;
    filas.push(`${H.time[i].slice(11)}: ${H.temperature_2m[i]}°C (sensación ${H.apparent_temperature[i]}°C), lluvia ${H.precipitation_probability[i]}%, viento ${H.wind_speed_10m[i]} km/h con rachas de ${H.wind_gusts_10m[i]} km/h, código ${H.weather_code[i]}, UV ${H.uv_index[i]}`);
  }
  resumen = `mínima ${w.daily.temperature_2m_min[0]}°C, máxima ${w.daily.temperature_2m_max[0]}°C, lluvia máx ${w.daily.precipitation_probability_max[0]}%, rachas máx ${w.daily.wind_gusts_10m_max[0]} km/h, UV máx ${w.daily.uv_index_max[0]}`;
  log("Fuente: Open-Meteo");
} else {
  const m = await bajar(`https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${LAT}&lon=${LON}`, { headers: { "User-Agent": "panel-casa/1.0 github.com/redpolasapps/casa" } }, 3);
  if (!m) throw new Error("No se pudo descargar el tiempo (Open-Meteo ni MET Norway)");
  const ts = (m.properties?.timeseries || []).filter((t) => diaMadrid(t.time) === hoy);
  let tmin = 99, tmax = -99, pmax = 0, rmax = 0;
  for (const t of ts) {
    const h = Number(horaMadrid(t.time).slice(0, 2)); const d = t.data.instant.details; const n1 = t.data.next_1_hours || {};
    const temp = d.air_temperature, v = Math.round((d.wind_speed || 0) * 3.6), r = Math.round((d.wind_speed_of_gust || d.wind_speed || 0) * 3.6), p = n1.details?.probability_of_precipitation ?? null;
    tmin = Math.min(tmin, temp); tmax = Math.max(tmax, temp); if (p !== null) pmax = Math.max(pmax, p); rmax = Math.max(rmax, r);
    if (h < 6 || h > 21) continue;
    filas.push(`${horaMadrid(t.time)}: ${temp}°C, humedad ${d.relative_humidity}%, lluvia ${p ?? "?"}% (${n1.details?.precipitation_amount ?? 0} mm), viento ${v} km/h con rachas de ${r} km/h, cielo ${n1.summary?.symbol_code || "?"}, UV ${d.ultraviolet_index_clear_sky ?? "?"}`);
  }
  resumen = `mínima ${tmin}°C, máxima ${tmax}°C, lluvia máx ${pmax}%, rachas máx ${rmax} km/h (sin sensación térmica: estímala tú con el viento y la humedad)`;
  log("Fuente: MET Norway");
}
if (!filas.length) throw new Error("No hay datos por horas para hoy");

const ENFOQUE = TANDA === "manana"
  ? "Decide cómo vestir al niño para ir y volver del cole."
  : `Ahora es media tarde: el consejo es para IR A BUSCARLE al cole a las ${SALIDA} y el resto de la tarde (parque, vuelta a casa). Olvida la mañana. El resumen, sobre la tarde y la noche.`;

const prompt = `Eres el asistente de una familia de ${CIUDAD}. Hoy es ${hoy}. Su hijo tiene ${EDAD} años y entra al cole entre las ${ENTRADA} y las ${ENTRADA_HASTA} (sale de casa un poco antes) y sale sobre las ${SALIDA}.
Previsión por horas de hoy (hora local):
${filas.join("\n")}
Resumen: ${resumen}.

${ENFOQUE} Ten en cuenta la SENSACIÓN TÉRMICA, la LLUVIA y el VIENTO (con rachas de más de 40 km/h hace más frío y conviene cortavientos o capucha; con más de 60 km/h, avisa). Si hay mucha diferencia entre la mañana y la tarde, dilo (por ejemplo, capas que se pueda quitar).
Responde SOLO con JSON:
{"resumen":"1 frase sobre cómo será el día (cielo, temperaturas, lluvia, viento)",
 "ropa":["4 a 6 prendas o accesorios en español sencillo, SIN emojis ni palabras en inglés, solo ropa de niño real, p. ej. 'Abrigo', 'Gorro', 'Paraguas', 'Zapatillas cerradas'"],
 "consejo":"1 frase práctica y cercana (p. ej. 'Por la mañana hace frío y viento: abrígale bien; a la salida podrá ir sin abrigo')"}`;

const g = await gemini(prompt);
if (!g || !Array.isArray(g.ropa) || !g.resumen) throw new Error("Respuesta de Gemini no válida");
const datos = { fecha: hoy, tanda: TANDA, generado: new Date().toISOString(), resumen: String(g.resumen), ropa: g.ropa.slice(0, 7).map((x) => String(x).replace(/^[^\p{L}0-9¿¡(]+/u, "").replace(/^[a-z_]+:?\s+(?=\p{Lu})/u, "").trim()).filter((x) => x && !/sart[eé]n|cacerola|olla/i.test(x)), consejo: String(g.consejo || "") };
await writeFile(new URL("../tiempo.json", import.meta.url), JSON.stringify(datos, null, 1) + "\n");
log("OK:", datos.resumen);
