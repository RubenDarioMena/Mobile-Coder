/* Puente con el envoltorio Android.
 * El envoltorio inyecta `MobileCoderAndroid` solo en las páginas de la propia app
 * (WebViewCompat.addWebMessageListener con el origen https://appassets.androidplatform.net).
 * Cada petición es un mensaje JSON { id, accion, ...datos }; la respuesta llega por onmessage con el mismo id:
 * { id, ok: true, datos } o { id, ok: false, error }. El código del usuario corre en Workers y no lo ve. */
(() => {
  "use strict";
  const MC = (window.MC = window.MC || {});
  const nativo = window.MobileCoderAndroid;
  const esperando = new Map();
  let siguiente = 0;
  if (nativo) {
    nativo.onmessage = (ev) => {
      let r;
      try { r = JSON.parse(ev.data); } catch { return; }
      const p = esperando.get(r.id);
      if (!p) return;
      esperando.delete(r.id);
      if (r.ok) p.resolver(r.datos); else p.rechazar(Object.assign(Error(r.error || "Error del envoltorio"), { codigo: r.codigo }));
    };
  }
  MC.puente = {
    disponible: !!nativo,
    pedir(accion, datos = {}) {
      if (!nativo) return Promise.reject(Error("Sin envoltorio Android"));
      const id = ++siguiente;
      return new Promise((resolver, rechazar) => {
        esperando.set(id, { resolver, rechazar });
        nativo.postMessage(JSON.stringify({ id, accion, ...datos }));
      });
    },
  };
})();
