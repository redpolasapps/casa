# Casa

Panel para el iPad de la cocina: tiempo, cenas y calendario.

- `index.html`: el panel (funciona en el Safari de iOS 12).
- `tiempo.json`: consejo de ropa que escribe Gemini cada mañana (`scripts/tiempo.mjs`, `.github/workflows/tiempo.yml`).
- `cloudflare-worker.js`: intermediario para leer calendarios .ics (Google, iCloud). Los enlaces de los calendarios se guardan solo en cada aparato.
