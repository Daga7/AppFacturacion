import { useRegisterSW } from "virtual:pwa-register/react";
import { primaryBtnCls } from "./ui/inputs";

// Cada cuánto se pregunta si hay una versión nueva mientras la app sigue
// abierta (la tablet o el computador del local pueden pasar el día sin
// cerrarla).
const UPDATE_CHECK_MS = 30 * 60 * 1000;

// Aviso de versión nueva. La app instalada trabaja con su propia copia
// (service worker) y no cambia sola: cuando se publica una versión nueva
// aparece este aviso y se actualiza al tocar el botón. Recargar no borra lo
// registrado sin internet (vive en IndexedDB).
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const check = () => {
        if (!navigator.onLine || registration.installing) return;
        registration.update().catch(() => {
          // Sin conexión o servidor sin responder: se reintenta más tarde.
        });
      };
      setInterval(check, UPDATE_CHECK_MS);
      // Al volver a la app (p. ej. después de usar otra) se revisa enseguida.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 sm:left-auto sm:right-4 sm:w-96 z-[60] bg-slate-900 border border-brand/40 rounded-xl p-4 shadow-xl flex items-center gap-3">
      <p className="text-sm text-white flex-1">Hay una versión nueva de la app.</p>
      <button onClick={() => void updateServiceWorker(true)} className={primaryBtnCls}>
        Actualizar
      </button>
    </div>
  );
}
