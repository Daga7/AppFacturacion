# Revisión de Arquitectura — El Bodegón de la Tecnología

> Revisión realizada el 2026-06-25 por Claude Sonnet 4.6 actuando como arquitecto de software senior.

---

# Estado general del proyecto

## Resumen

**El Bodegón de la Tecnología** es un sistema de facturación e inventario multi-sucursal pensado para una tienda de tecnología. Permite gestionar una jerarquía `Company → Branch → (Usuarios / Clientes / Productos) → Ventas / Préstamos`, con roles diferenciados (ADMIN, SUPERVISOR, CASHIER) y autenticación JWT con rotación de refresh tokens. El frontend es una PWA instalable con diseño dark y navegación responsiva.

## Nivel de avance aproximado

| Capa | Avance | Detalle |
|---|---|---|
| Backend - Auth | ~90% | Login, refresh, `/me`. Falta rate limiting y hardening |
| Backend - Products | ~10% | Controlador montado, servicio es un stub |
| Backend - Categories / Inventory / Sales / Reports | ~0% | Directorios vacíos, ni registrados en `AppModule` |
| Frontend - Auth/Layout | ~95% | Completo y responsivo |
| Frontend - Inventario | ~80% | UI completa, llama a APIs que aún no existen en el backend |
| Frontend - Facturación | ~60% | Solo listado de ventas, sin flujo de creación |
| Frontend - Informes | ~75% | UI completa con 4 cards, llama endpoints inexistentes |
| Dominio / Schema | ~100% | Modelo bien definido, robusto |
| PWA | ~70% | Configurada, falta offline fallback y estrategia clara |

**Avance global estimado: ~35–40%**. La base es sólida; el cuello de botella es el backend.

## Puntos fuertes de la arquitectura

- **Modelo de dominio bien pensado.** La jerarquía `Company → Branch → entidades` es correcta para multi-tenant y escala bien.
- **Auth production-grade.** JWT de corta vida (15min) con rotación de refresh tokens almacenados en BD, `bcrypt` para contraseñas.
- **Frontend desacoplado.** El cliente `api.ts` encapsula toda la lógica HTTP, incluyendo el reintento automático tras 401.
- **Stack moderno y coherente.** NestJS/Prisma/React/Tailwind v4/Zustand son opciones actuales sin over-engineering.
- **Diseño responsivo de entrada.** El sidebar drawer mobile/desktop está resuelto desde el inicio.

---

# Aspectos positivos

**Decisiones de arquitectura:**
- `PrismaModule` global (`@Global()`) es la decisión correcta: evita importarlo en cada módulo sin perder trazabilidad.
- `ValidationPipe` con `whitelist: true` y `transform: true` desde el arranque es la configuración recomendada para NestJS.
- El esquema de `InventoryMovement` con tipos enumerados (`SALE`, `RETURN`, `BRANCH_TRANSFER`…) da trazabilidad completa del stock sin auditoría externa.
- `Sale.invoiceNumber` único por `[branchId, invoiceNumber]` es correcta para numerar facturas por sucursal.
- `Inventory` con `@@unique([branchId, productId])` previene duplicados a nivel de BD.
- Refresh tokens guardados en BD permiten revocación real (algo que JWT puro no puede hacer).

**Organización de carpetas:**
- La convención `feature/controller + service + module + dto/ + entities/` es la estándar de NestJS CLI y facilita la incorporación de nuevos desarrolladores.
- Separación limpia `backend/` / `frontend/` sin acoplamiento de monorepo innecesario.
- `src/lib/` en el frontend para utilidades (`api.ts`, `constants.ts`) y `src/stores/` para estado global.

**Calidad del código:**
- Prettier + ESLint configurados en ambos proyectos con reglas consistentes.
- TypeScript estricto en frontend (`noUnusedLocals`, `verbatimModuleSyntax`).
- El `api.ts` del frontend es elegante: 53 líneas que manejan auth, refresh y errores.
- El `Layout.tsx` implementa el patrón de sidebar compartido correctamente con un solo nodo `sidebar` renderizado en dos posiciones (desktop fijo / mobile drawer).

**Escalabilidad:**
- Arquitectura multi-tenant por diseño (Company → Branch) desde el inicio, no añadida a posteriori.
- Prisma con adapter `pg` directo, preparado para connection pooling externo (Supabase pgBouncer).

**Mantenibilidad:**
- Los módulos NestJS están aislados, fácil añadir nuevos sin tocar los existentes.
- El store de Zustand es compacto y sin magia: fácil de depurar.

---

# Oportunidades de mejora

## Alta prioridad

**Backend — Bug crítico en ProductsController**
`@Param('id')` pasa un `string` UUID pero el service recibe `+id` (`parseInt`). Todos los endpoints de products que usen `:id` fallarán silenciosamente o devolverán `NaN`. Las IDs en el schema son UUIDs (`String`), no números enteros.

```ts
// Actual (incorrecto):
findOne(@Param('id') id: string) { return this.productsService.findOne(+id); }

// Correcto:
findOne(@Param('id') id: string) { return this.productsService.findOne(id); }
```

**Backend — CORS abierto en producción**
`origin: true` permite cualquier origen. Para producción debe restringirse a los dominios reales:
```ts
app.enableCors({ origin: ['https://tu-dominio.com'], credentials: true });
```

**Backend — Sin rate limiting en auth**
`POST /auth/login` y `POST /auth/refresh` no tienen throttling. Sin límite de intentos, el endpoint de login es vulnerable a fuerza bruta. Añadir `@nestjs/throttler`.

**Backend — `CreateProductDto` vacío**
El DTO no tiene ningún campo ni validación. Cualquier body pasa la `ValidationPipe`. Todos los DTOs de entidades que aún no están implementadas necesitan sus campos con decoradores `class-validator`.

**Backend — `JWT_SECRET` sin validación al arranque**
Si `JWT_SECRET` no está en `.env`, el valor es `undefined` pero TypeScript lo tipea como `string` por el `!`. El servidor arranca sin error y firma tokens con `undefined` como secreto. Usar `@nestjs/config` con validación de esquema (Joi o Zod) para validar variables de entorno al inicio.

**Backend — `JwtStrategy.validate()` hace un query a la BD en cada petición autenticada**
Cada request protegido consulta `prisma.user.findUnique`. Con muchos usuarios concurrentes esto escala mal. La información del payload JWT (`sub`, `role`) ya es suficiente para la mayoría de guards; la consulta a BD debería ser opcional.

**Seguridad — Tokens en `localStorage`**
Los tokens almacenados en `localStorage` son accesibles desde cualquier script en la página (XSS). En una aplicación de facturación, la alternativa correcta son `httpOnly cookies` para el refresh token. El access token en memoria (no persistido) es el patrón recomendado. Es un cambio mayor que vale la pena planear.

**Frontend — `handleDeleteProduct` sin manejo de error** (`Inventario.tsx:98`)
```ts
const handleDeleteProduct = async (id: string) => {
  if (!confirm("Eliminar producto?")) return;
  await api.delete(`/products/${id}`);  // sin try-catch
  loadProducts();
};
```
Si el DELETE falla (producto con ventas asociadas), el error se pierde silenciosamente.

**Frontend — El selector de rol en Login es UX engañosa**
El rol seleccionado en la pantalla de login no influye en la petición. El backend valida credenciales independientemente. Un usuario podría seleccionar "ADMIN" e ingresar credenciales de "CASHIER" y acceder. Debería eliminarse el selector o darle un propósito real.

**Frontend — Sin flujo de creación de ventas**
`Facturacion.tsx` solo lista ventas existentes. El módulo de facturación sin capacidad de crear ventas no cumple su propósito principal.

## Media prioridad

**Backend — Sin `@Roles()` decorator exportado**
`RolesGuard` y `ROLES_KEY` existen pero no hay un decorador `@Roles()` definido con `SetMetadata`. El guard siempre permite si no hay roles requeridos. Falta crear:
```ts
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

**Backend — Sin paginación en listados**
Los endpoints de lista no tienen `limit`/`offset` ni cursor. Con inventario grande, un `findMany()` sin filtros puede traer miles de registros. El frontend ya intenta `?limit=50` en ventas pero el backend no lo procesa.

**Backend — Sin `helmet` ni cabeceras de seguridad**
No hay `helmet()` configurado. Faltan cabeceras como `X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy`.

**Backend — `PrismaService` sin `onModuleDestroy`**
El servicio se conecta en `onModuleInit` pero no llama `$disconnect()` al destruir el módulo. En tests y reinicios puede dejar conexiones abiertas.

**Backend — Seed con contraseña hardcodeada**
`seed.ts` usa `'admin123'`. Está bien para desarrollo, pero debería leer la contraseña de una variable de entorno para entornos de staging/demo.

**Frontend — Tipos duplicados entre páginas**
`Product`, `Sale`, `methodLabels` y otros están redefinidos en `Inventario.tsx`, `Facturacion.tsx` e `Informes.tsx`. Mover a `src/types/index.ts`.

**Frontend — `confirm()` para acciones destructivas**
`window.confirm()` no es estilizable, no es accesible, y no es consistente con el diseño visual. Reemplazar por un modal de confirmación propio.

**Frontend — Sin estados de carga en acciones mutantes**
Las operaciones de delete y cancel no tienen estado de carga visual. El usuario puede hacer clic varias veces y generar requests duplicados.

**Frontend — Sin búsqueda ni filtros en tablas**
Con muchos productos o ventas, las tablas sin filtro/búsqueda se vuelven inusables.

**PWA — Sin página offline fallback**
Si el usuario abre la app sin conexión y la ruta no está cacheada, verá un error genérico del navegador. El `workbox` solo cachea la app shell; falta configurar una ruta de fallback offline.

**Base de datos — Sin índices explícitos en campos de búsqueda frecuente**
`Product.barcode` tiene `@unique` (crea índice), pero campos como `Sale.createdAt`, `Inventory.branchId`, `User.branchId` sin índice explícito pueden causar full-scans en reportes.

## Baja prioridad

**NestJS — Sin `ConfigModule`**
Las variables de entorno se leen directamente con `process.env.X`. Con `@nestjs/config` se centraliza la validación y se obtiene tipado.

**NestJS — `JwtModule.register()` en vez de `registerAsync()`**
`register()` lee `process.env.JWT_SECRET` en tiempo de importación del módulo. `registerAsync()` garantiza que las variables estén disponibles si se usa `ConfigModule`.

**Frontend — Sin librería de formularios**
Los formularios usan state local y `onChange` manual. Con `react-hook-form` + Zod se gana validación declarativa, menos re-renders y mejor DX.

**Frontend — Iconos como caracteres Unicode**
`◉`, `⊞`, `⊡`, `⊟`, `⏻`, `☰` son caracteres Unicode con rendering inconsistente entre plataformas. Usar una librería de iconos SVG (Lucide, Heroicons).

**Frontend — Sin internacionalización de moneda**
Los precios se muestran con concatenación de string. Usar `Intl.NumberFormat` para formateo de moneda colombiana (COP).

**Tailwind — Tokens `brand` sin definición visible**
Se usa `bg-brand`, `text-brand-light`, `ring-brand` en múltiples componentes. Verificar que estos custom tokens estén definidos en el CSS principal (`index.css`).

**Accesibilidad — Inputs sin `<label>` asociado**
Los inputs en formularios solo tienen `placeholder`. Los botones de icono (`⏻`, `☰`) necesitan `aria-label` explícito.

---

# Funcionalidades recomendadas

1. **Creación de ventas (POS)** — Flujo completo: buscar producto por código de barras/nombre, añadir al carrito, seleccionar método de pago (puede ser mixto), asignar cliente opcional, emitir factura. Es la funcionalidad core.

2. **Gestión de préstamos (créditos)** — El modelo ya existe (`Loan`, `LoanPayment`). Pantalla para ver créditos activos, registrar abonos y marcarlos como pagados.

3. **Gestión de usuarios** — CRUD de usuarios desde el panel de ADMIN, incluyendo asignación de sucursal y rol.

4. **Transferencias de stock entre sucursales** — Ya hay `InventoryMovementType.BRANCH_TRANSFER` en el schema. Formalizar el flujo.

5. **Dashboard con KPIs en tiempo real** — El dashboard actual solo tiene links. Debería mostrar: ventas del día, caja actual, alertas de stock bajo, últimas ventas.

6. **Alertas de stock mínimo** — Notificación (badge en sidebar o push notification vía PWA) cuando un producto llega a umbral crítico.

7. **Exportación de informes** — PDF o Excel de las ventas del período. Fundamental para cierre de caja y declaraciones.

8. **Historial de movimientos por producto** — Ver el log completo de `InventoryMovement` de un producto: cuándo entró, cuándo se vendió, transferencias.

9. **Cierre de caja diario** — Resumen al final del día con total por método de pago, comparación con efectivo físico.

10. **Gestión de clientes** — CRUD de `Customer` con historial de compras y estado de créditos.

---

# Posibles problemas futuros

**Crecimiento del módulo `Inventario.tsx`** — Ya tiene 336 líneas con 3 tabs, múltiples formularios y lógica mezclada. Al añadir más funcionalidades (ajuste de stock, transferencias) se volverá inmanejable. Dividir en componentes específicos cuanto antes.

**Sin estrategia de invalidación de access tokens** — Los access tokens de 15min no se pueden invalidar antes de expirar. Si se compromete uno o se cierra sesión, el token sigue siendo válido 15 minutos.

**Módulos no registrados en `AppModule`** — Las carpetas `categories/`, `inventory/`, `loans/`, `sales/` están vacías. Cuanto más tiempo pasen sin implementarse mientras el frontend ya las llama, más divergencia habrá.

**Sin manejo de concurrencia en stock** — Cuando dos usuarios vendan el mismo producto simultáneamente puede haber condiciones de carrera en `Inventory.amount`. Usar transacciones Prisma con verificación del stock antes de decrementar.

**Crecimiento de `RefreshToken` en BD** — Tokens expirados pero no usados nunca se limpian. Falta un job de limpieza periódica.

**`Decimal` de Prisma vs `number` de TypeScript** — `Product.salePrice`, `Sale.total` etc. son `Decimal` en Prisma. Al serializar a JSON se convierten a `string`. El frontend los declara como `number`. Puede causar errores sutiles de suma/comparación.

---

# Refactorizaciones recomendadas

**1. Tipos compartidos en frontend**
Crear `frontend/src/types/index.ts` con las interfaces `Product`, `Sale`, `SaleDetail`, `Category`, `StockItem`, etc., y eliminar las definiciones duplicadas en cada página.

**2. Constantes de método de pago**
`methodLabels` está duplicado en `Facturacion.tsx` y `Informes.tsx`. Mover a `src/lib/constants.ts`.

**3. Dividir `Inventario.tsx` en componentes**
```
src/pages/Inventario/
  index.tsx
  ProductsTab.tsx
  CategoriesTab.tsx
  StockTab.tsx
  ProductForm.tsx
```

**4. Hook `useError` o componente `<ErrorBanner>`**
El patrón `const [error, setError] = useState<string | null>(null)` + banner se repite en 3 páginas. Extraer a un custom hook o componente reutilizable.

**5. `ProductsService` con implementación real y UUIDs**
Todos los métodos devuelven strings literales y usan `id: number`. Implementar con `PrismaService` y `id: string`.

**6. Decorador `@Roles()` junto al guard**
Crear `src/auth/roles.decorator.ts` con `@Roles()` usando `SetMetadata`, y un barrel `src/auth/index.ts` que exporte guard + decorator.

**7. `PrismaService` con `onModuleDestroy`**
```ts
async onModuleDestroy() {
  await this.$disconnect();
}
```

---

# Checklist para producción

### Backend
- [ ] Implementar módulos `Categories`, `Inventory`, `Sales`, `Reports` y registrarlos en `AppModule`
- [ ] Implementar `ProductsService` con lógica real (Prisma, UUIDs)
- [ ] Completar `CreateProductDto` / `UpdateProductDto` con validaciones `class-validator`
- [ ] Restringir CORS a dominios específicos
- [ ] Añadir `@nestjs/throttler` en endpoints de auth
- [ ] Añadir `helmet()` para cabeceras de seguridad HTTP
- [ ] Migrar a `@nestjs/config` con validación de variables de entorno al arranque
- [ ] Cambiar `JwtModule.register()` por `registerAsync()`
- [ ] Crear decorador `@Roles()` y aplicar en todos los endpoints según RBAC
- [ ] Añadir paginación en todos los endpoints de listado
- [ ] Añadir `onModuleDestroy` a `PrismaService`
- [ ] Implementar job periódico de limpieza de `RefreshToken` expirados
- [ ] Añadir índices en `schema.prisma` en campos de búsqueda frecuente (`Sale.createdAt`, `Inventory.branchId`)
- [ ] Usar transacciones en decrementos de stock para evitar condiciones de carrera
- [ ] Configurar logging estructurado
- [ ] Configurar variables de entorno en Render (no hardcodear)

### Frontend
- [ ] Implementar flujo completo de creación de ventas (POS)
- [ ] Añadir `try-catch` en `handleDeleteProduct` y demás operaciones sin manejo de error
- [ ] Reemplazar `window.confirm()` por modales de confirmación
- [ ] Añadir estados de loading en acciones mutantes (delete, cancel)
- [ ] Crear `src/types/index.ts` y eliminar tipos duplicados
- [ ] Resolver selector de rol en Login (eliminarlo o darle propósito real)
- [ ] Añadir búsqueda/filtros en tablas de productos y ventas
- [ ] Implementar paginación en listados
- [ ] Formatear moneda con `Intl.NumberFormat` (COP)
- [ ] Reemplazar iconos Unicode por SVG consistentes (Lucide o Heroicons)
- [ ] Añadir `<label>` a todos los inputs de formularios
- [ ] Verificar definición de custom tokens `brand` / `brand-light` en `index.css`

### PWA
- [ ] Crear y configurar página de fallback offline
- [ ] Probar instalación y comportamiento offline en móvil real
- [ ] Configurar `VITE_BASE_URL` en pipeline de despliegue

### Infraestructura
- [ ] Definir política de backup de base de datos
- [ ] Verificar HTTPS forzado en Render
- [ ] Definir proceso de migraciones en despliegue continuo
- [ ] Escribir tests unitarios para `AuthService` y servicios de negocio críticos

---

# Calificación

| Aspecto | Nota | Comentario |
|---|---|---|
| **Arquitectura** | **8 / 10** | Dominio bien modelado, separación correcta, decisiones técnicas acertadas |
| **Código** | **6 / 10** | Bug con `+id` en UUIDs, DTOs vacíos, stubs sin implementar, patrones inconsistentes |
| **Escalabilidad** | **6 / 10** | Multi-tenant por diseño, pero sin paginación, sin índices explícitos y DB hit por request |
| **Seguridad** | **5 / 10** | Auth robusta, pero CORS abierto, sin rate limiting, sin helmet, tokens en localStorage |
| **Rendimiento** | **5.5 / 10** | Sin caché, sin paginación, consulta a BD en cada JWT, carga paralela en Informes (bien) |
| **UX** | **7 / 10** | Diseño cohesivo y moderno, responsive desde el inicio, pero rol en login es confuso |
| **Organización** | **7.5 / 10** | Estructura clara y predecible en ambos proyectos |
| **Preparación para producción** | **3.5 / 10** | Backend ~20% implementado, varios problemas de seguridad pendientes |

---

## Opinión general

La arquitectura va por muy buen camino. Las decisiones más difíciles —el modelo de dominio multi-tenant, el sistema de auth con refresh rotation, el stack tecnológico— están bien tomadas y son decisiones que no tendrás que rehacer. Es el tipo de base sobre la que se construye bien.

El punto de fricción más importante ahora mismo es la **brecha entre el frontend y el backend**: el frontend ya tiene UI funcional para inventario, informes y facturación, pero ninguno de esos endpoints existe todavía en el backend. Hay que cerrar esa brecha pronto.

**Próximos pasos recomendados (por orden de impacto):**
1. Implementar `CategoriesModule`, `ProductsModule` real e `InventoryModule` — desbloquean el flujo de inventario completo.
2. Corregir el bug de `+id` (parseInt de UUID) en `ProductsController`.
3. Restringir CORS y añadir throttling en auth antes de cualquier despliegue público.
4. Implementar el flujo POS de creación de ventas — es el núcleo del negocio.

Con eso, el proyecto pasa de prototipo avanzado a MVP real.
