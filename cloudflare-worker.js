// Intermediario para el panel de casa: descarga calendarios .ics (Google, iCloud, Outlook)
// y se los pasa al panel con permiso CORS. No guarda nada.
// Cómo usarlo: Cloudflare → Workers & Pages → Create → Worker → pega este código → Deploy.
// Copia la dirección del worker (https://<nombre>.<tu-cuenta>.workers.dev) en ⚙️ Ajustes del panel.

const HOSTS_PERMITIDOS = [
  "calendar.google.com",
  "icloud.com",            // p01-calendarws.icloud.com, etc.
  "outlook.office365.com",
  "outlook.live.com",
];

function cors(resp) {
  const h = new Headers(resp.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  h.set("Access-Control-Allow-Headers", "*");
  h.set("Cache-Control", "no-store");
  return new Response(resp.body, { status: resp.status, headers: h });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    const url = new URL(request.url);
    let destino = url.searchParams.get("url");
    if (!destino) return cors(new Response("Falta ?url=", { status: 400 }));
    destino = destino.replace(/^webcal:\/\//i, "https://");
    let d;
    try { d = new URL(destino); } catch { return cors(new Response("URL no válida", { status: 400 })); }
    const ok = d.protocol === "https:" && HOSTS_PERMITIDOS.some((h) => d.hostname === h || d.hostname.endsWith("." + h));
    if (!ok) return cors(new Response("Solo se permiten calendarios de Google, iCloud u Outlook", { status: 403 }));
    const r = await fetch(d.toString(), { headers: { "User-Agent": "panel-casa/1.0" }, cf: { cacheTtl: 300, cacheEverything: true } });
    const texto = await r.text();
    if (!r.ok || texto.indexOf("BEGIN:VCALENDAR") < 0) return cors(new Response("No es un calendario (" + r.status + ")", { status: 502 }));
    return cors(new Response(texto, { status: 200, headers: { "Content-Type": "text/calendar; charset=utf-8" } }));
  },
};
