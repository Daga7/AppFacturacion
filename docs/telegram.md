# Vinculación con Telegram

El sistema permite vincular la cuenta de un usuario con un chat de Telegram
mediante un código único de un solo uso:

1. En la app (menú **Vincular Telegram**), el usuario genera un código, p. ej. `TG-8F2A91` (vence en 15 minutos).
2. Abre el bot del negocio en Telegram y envía: `/vincular TG-8F2A91`.
3. Telegram llama a nuestro webhook (`POST /telegram/webhook`); el backend
   comprueba que el código existe y no ha vencido, obtiene el `chat_id`, lo
   guarda en la cuenta del usuario y marca la vinculación como verificada.
4. El bot responde "✅ Telegram vinculado correctamente a la cuenta X".

Nadie puede vincularse a otra cuenta sin tener acceso al sistema, porque el
código solo se genera estando autenticado y muere al usarse.

## Configuración del bot (una sola vez)

1. **Crear el bot**: habla con [@BotFather](https://t.me/BotFather) en
   Telegram → `/newbot` → elige nombre y username. Guarda el **token**.

2. **Variables de entorno** en Render (y en `backend/.env` para local):

   ```
   TELEGRAM_BOT_TOKEN=123456789:AAF...     # token de BotFather (obligatorio para que el bot responda)
   TELEGRAM_BOT_USERNAME=MiBodegonBot      # sin @; se muestra en la pantalla de vinculación
   TELEGRAM_WEBHOOK_SECRET=una-clave-larga # opcional pero recomendado
   ```

3. **Registrar el webhook** (una sola vez, desde cualquier terminal):

   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://appfacturacion-1.onrender.com/telegram/webhook" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```

   Para verificar: `curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"`

## Endpoints

| Método | Ruta | Auth | Qué hace |
|---|---|---|---|
| POST | `/telegram/link-code` | JWT | Genera el código del usuario logueado |
| GET | `/telegram/status` | JWT | Estado de la vinculación |
| POST | `/telegram/unlink` | JWT | Desvincula la cuenta |
| POST | `/telegram/webhook` | pública* | Recibe los mensajes del bot |

\* Si `TELEGRAM_WEBHOOK_SECRET` está configurado, el webhook ignora
peticiones que no traigan el header `X-Telegram-Bot-Api-Secret-Token`
correcto (Telegram lo envía automáticamente al registrarlo con
`secret_token`).

## Notificaciones automáticas de caja

Con el bot configurado, el sistema envía automáticamente a los **chats
autorizados** (usuarios ADMIN y SUPERVISOR con Telegram vinculado):

- **🔓 Apertura de caja**: sede, quién la abrió, base inicial, fecha y hora.
- **🔒 Cierre de caja**: sede, fecha/hora y el informe completo del programa
  (base, ventas, efectivo, transferencias con desglose, préstamos,
  descuentos, efectivo esperado vs contado y diferencia).

Los envíos son *best-effort*: si Telegram falla, la operación de caja no se
ve afectada. Las horas se muestran en zona `America/Bogota`.

Si algún día se quiere un bot distinto por sede, el código ya lo soporta:
basta definir `TELEGRAM_BOT_TOKEN_OCANA` / `TELEGRAM_BOT_TOKEN_AGUACHICA`
(sin tildes) y esos bots se usarán para su sede; `TELEGRAM_BOT_TOKEN` queda
como bot por defecto.
