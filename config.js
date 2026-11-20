// =====================================================================
//  CONFIGURACIÓN DE ESTA CASA — es el ÚNICO archivo que hay que cambiar.
//  (Lo usan el panel del iPad y el consejo del tiempo de cada día.)
// =====================================================================
window.CONFIG = {
  ciudad: "Barcelona",          // solo la ciudad, NUNCA la dirección
  lat: 41.44,                   // coordenadas APROXIMADAS del barrio (2 decimales)
  lon: 2.19,
  zona: "Europe/Madrid",        // zona horaria (España peninsular y Baleares: Europe/Madrid; Canarias: Atlantic/Canary)
  edad: 4,                      // años del peque
  entrada: "08:00",             // el cole empieza a entrar...
  entradaHasta: "09:00",        // ...hasta esta hora
  salida: "17:00",              // hora de ir a buscarle
  worker: "https://calendarios.v-m-garciaortega.workers.dev"  // intermediario de Cloudflare para leer los calendarios
};
