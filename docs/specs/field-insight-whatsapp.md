# Field insight — WhatsApp coordination (Jul 2026)

**Status: design proposal** — Figma: page *Back Office - Junio 30* → section *"Insight de campo · WhatsApp · Jul 11"*. Not yet implemented.

## Source

A volunteer (Venus) coordinating supplies to centros reports that real coordination happens in WhatsApp groups using ad-hoc structured templates:

```
PARA SOLICITAR COMIDAS:
Lugar / Hora / Cantidad de comidas: 300
Ubicación (nombre del lugar y GPS): CAVA restaurante, calle Cecilio Acosta.
  Misma calle de Tributo café…
Contacto de quien recibe: juan perez +58 412-…
```

Needs span **comida, medicinas, kit higiene, camas** — not only medical. Receivers span centros de acopio, refugios (formales e informales), centros improvisados, zonas.

## Gaps this closes

1. Items carry no **quantity**; every field template does ("Cantidad: 15/300").
2. Categories are **hospital departments only** (quirófano, farmacia…); no way to express food/hygiene/bedding.
3. Lista carries no **reception contact** — the field template always names quien recibe + teléfono + a landmark.

## Changes

### 1. Quantity per item (optional)

- **Data**: `lista_item.quantity int null` (positive; unit is implied by the item name, e.g. "Comidas calientes × 300"). Need-bucket only; ignored for excess.
- **Editor**: each selected item row gets a quantity pill — filled ("× 200") when set, ghost "+ Cantidad" when not. Tap → numeric input.
- **Donor detail / dashboard**: item pill renders " × 300" right-aligned, muted, after the name. Absent quantity renders exactly as today.

### 2. Non-medical categories + donor category filter

Today `supply_category` has backend plumbing but **no UI face**: no filter control renders on `/listas` (the `?category=` param + `arrayContains` query exist unused), the insumo selector is flat (área facet dropped), and centers never pick a category — it derives from the catalog supply at publish. This change gives the facet its face at the same time it goes non-medical.

- **Enum** `supply_category` — append (never reorder): `food`, `water`, `hygiene`, `bedding`.
- **Labels** (`categoryLabel`): Alimentos, Agua, Higiene, Camas y cobijas.
- **Catalog**: add non-medical insumos (Comidas calientes, Agua potable, Kits de higiene, Cobijas, Colchonetas, Ropa de cama…). Dev via seed; **prod needs a data migration with INSERTs** (seed is destructive, dev-only).
- **Donor filter — new UI**: category **chip row** on `/listas` (Figma: *Categorías v2 · filtro donante*), not a `FilterSelect` dropdown — ~8 options, one tap, scannable. Options come from a new query: distinct categories present in active listas (mirror of the cities query). Selecting Alimentos shows **listas containing ≥1 food item** — the filter narrows centers, not items within a lista.
- **Custom (free-text) items — category picker**: customs used to sink into dormant `general`, invisible to the filter. New: when a center creates a custom insumo in the selector ("Crear «comidas calientes»"), an inline chip row appears under the created row — "¿En qué categoría va?" with Alimentos / Agua / Higiene / Camas y cobijas / Medicinas / **Otros (default)** (Figma: *6 · Selector · categoría para insumo libre*). One optional tap; skipping keeps `Otros` (= `general`). Data: the publish action already maps catalog items → `supply.category`; customs now carry the picked enum value instead of hardcoded `general`. Catalog rows never show the picker.
- **Copy pass**: "centros de salud (verificados)" → "centros (verificados)" on landing hero + `/listas` meta description. Identity of the product widens from medical-only to supply-relief.

### 3. Reception contact on the lista

New optional group in the create/edit flow, below "Nota para los donantes":

- **Quién recibe** — `reception_contact_name varchar(80) null`
- **Teléfono de quien recibe** — `reception_contact_phone` (E.164 via `normalizeVePhone`), null
- **Punto de referencia** — `reception_landmark varchar(120) null` ("Misma calle del café Tributo")

Donor detail: Dirección card gains two lines — "Punto de referencia: …" and "Recibe: {nombre} · {tel}". Phone is tap-to-call/WhatsApp. Prefill name/phone from the last published lista.

**Privacy note**: reception phone is published to an anonymous public surface. Make the field explicitly opt-in with helper copy ("visible públicamente"); default empty.

### Center types (deferred — language only)

`center_type` is feature-flagged off and never surfaced (registration, donor list, admin all skip it). No enum work now. The copy pass in §2 (drop "de salud") is what actually welcomes refugios/acopios/centros improvisados. Revisit the enum only if/when the type filter ships.

## Explicitly out of scope

- Dated one-off requests ("06/Julio, 1:00pm") — conflicts with the evergreen lista model; freshness nudges already cover recency.
- Pick-up/delivery coordination between donor and center — stays in WhatsApp; VeneMed's job is the trustworthy, always-current lista + contact handoff.
- Share-lista-as-image (already pitched to Venus) — tracked separately.

## Catalog v2 (prerequisite for the filter)

Prod today: **6 supplies, several miscategorized** (Acetaminofén → `pediatrics`, Gasas → `general`). The category filter is only as good as the catalog, and the picker for customs only fires when the catalog misses — so coverage is the feature.

Rules: one home category per item (no duplicates across categories); names short, searchable, es-VE; the search-first flat selector means the list can be long without UI cost. Fix the 6 existing prod rows' categories in the same data migration.

### Alimentos (`food`)
Comidas preparadas · Arroz · Pasta · Harina de maíz precocida · Granos (caraotas, lentejas) · Atún y sardinas enlatadas · Leche en polvo · Fórmula infantil · Compotas y alimentos para bebés · Aceite comestible · Azúcar · Sal · Café · Galletas y alimentos no perecederos

### Agua (`water`)
Agua potable embotellada · Botellones de agua · Pastillas potabilizadoras · Filtros de agua · Bidones y envases para agua

### Higiene (`hygiene`)
Kits de higiene personal · Jabón de baño · Champú · Pasta y cepillos de dientes · Toallas sanitarias · Pañales infantiles · Papel higiénico · Toallas · Alcohol en gel · Detergente · Cloro y desinfectante · Bolsas de basura

### Camas y cobijas (`bedding`)
Colchonetas · Cobijas y mantas · Sábanas · Almohadas · Hamacas · Carpas y toldos · Mosquiteros

### Farmacia (`pharmacy`)
Acetaminofén 500 mg · Ibuprofeno 400 mg · Amoxicilina 500 mg · Antibióticos pediátricos (suspensión) · Sales de rehidratación oral · Loratadina (antialérgico) · Antihipertensivos · Insulina · Multivitamínicos · Vitaminas prenatales · Alcohol isopropílico · Solución antiséptica (povidona) · Agua oxigenada

### Emergencias (`emergency`)
Suero fisiológico 500 ml · Solución Ringer lactato · Jeringas estériles · Catéteres IV · Equipos de venoclisis · Gasas estériles · Vendas · Esparadrapo · Guantes de nitrilo · Mascarillas quirúrgicas · Kits de sutura · Férulas · Collarines cervicales · Ampollas de adrenalina

### Quirófano (`surgical`)
Guantes quirúrgicos estériles · Suturas · Hojas de bisturí · Campos quirúrgicos estériles · Batas quirúrgicas · Compresas estériles

### Hospitalización (`inpatient`)
Sábanas clínicas · Sondas Foley · Bolsas recolectoras de orina · Termómetros · Tensiómetros · Oxímetros de pulso · Nebulizadores · Sillas de ruedas · Muletas · Colchones antiescaras

### Pediatría (`pediatrics`)
Acetaminofén pediátrico (jarabe) · Suero oral pediátrico · Teteros y biberones · Vitaminas pediátricas · Pañitos húmedos

### Adultos mayores (`geriatrics`)
Pañales para adulto · Suplementos nutricionales (Ensure) · Andaderas · Bastones · Cremas para escaras

~85 items.

**Provenance**: drafted from the field WhatsApp templates + standard relief-kit lists (WHO IEHK, UNICEF hygiene kit, Sphere) — then checked against prod's actual free-text customs (Jul 2026: Comida ×2, Agua, Agua Mineral, Colchonetas, Sábanas, Productos de Limpieza, ibuprofeno, Formol). Every prod custom except Formol maps into the draft — centers were already forcing non-medical needs through free text. Before the prod migration: medical half → clinical review; non-medical half → Venus (she offered exactly this).

## 4. Sharing — options sheet + WhatsApp text

The quantity/reception data above only pays off if it reaches the WhatsApp groups where coordination happens. This section turns the bare `navigator.share`/copy-link affordance into a **share bottom-sheet** with three options, reused by every share entry point.

### 4a. The sheet ("Compartir · sheet de opciones")

`src/components/share/share-sheet.tsx` — a shared client component (the panel only; each caller keeps its own trigger button + open state). Chrome mirrors the `InsumoSelector` recipe: neutral scrim, `max-w-[390px] rounded-t-[24px]` panel, drag handle, Escape + body-scroll-lock + focus-trap. Title **"Compartir esta lista"**, caption **"Llega a los donantes donde ya se organizan."** Three option rows (40px white rounded-xl bordered icon tile + label + description + chevron; first row on `accent-subtle`), inline SVG line icons only (no emojis):

1. **Texto para WhatsApp** — "Lista formateada para difundir". Copies the prebuilt text to the clipboard (fallback: text-only `navigator.share` when clipboard is unavailable); flips the row to a **"Copiado"** state for 2 s. `recordShare(listaId, "whatsapp")`.
2. **Imagen** — "Tarjeta para estados o historias". Reuses `shareWithOptionalImage` (native share with the `/listas/[id]/story-image` PNG attached); fallback opens the story-image URL in a new tab. `recordShare(listaId, "unknown")` (no image-specific channel in the enum).
3. **Copiar enlace** — description shows the short URL (host + path). Copies the link, **"Copiado"** state. `recordShare(listaId, "copy_link")`.

The absolute URL is resolved client-side (`window.location.origin`) at open time — matching how the rest of the share surfaces resolve URLs — and the WhatsApp text is built from it.

### 4b. WhatsApp text template

`buildListaShareText(...)` in `src/lib/listas/share-text.ts` (pure, non-`"use server"`) renders — omitting any block with no data, blank line between blocks, WhatsApp `*bold*`/`_italic_` markup:

```
*LISTA DE INSUMOS*
*{Center name}* — {city}          ← " — {city}" dropped when city null

*URGENTE:*
• {item} × {quantity}             ← "× N" only when quantity set

*Necesitamos:*
• {item} …

*No aceptamos:* {excess items, comma-joined, lowercase}

*Dirección:* {addressLine} · {city}
Punto de referencia: {landmark}   ← only when set
*Recibe:* {name} · {formatVePhone(phone)}   ← only when set

Lista completa y actualizada:
{absolute URL to /listas/[id]}
_Actualizada {formatUpdatedAgo(updated_at)}_
```

Item ordering: urgent-need → non-urgent-need → excess (the donor-surface derivation), via the shared `partitionShareItems(items)` helper. Formatters (`formatVePhone`, `formatUpdatedAgo`) come from `src/lib/format.ts`.

### 4c. Wiring (three entry points)

Each server page assembles a `ShareSheetData` payload (center name + city + partitioned items + address + reception + `updatedAt`) and passes it down; the client trigger renders `<ShareSheet>`:

- **Donor detail** — `detail-body.tsx` `DetailFooter` builds the payload from `getListaById` (all fields already fetched) → `ShareCtaButton`.
- **Center dashboard** — `centro/page.tsx` builds it from `getCenterDashboardLista` (extended to select `center.addressLine` + the reception columns) + `requireCenter().centerName` → `ShareListaButton`.
- **Publicada confirm** — `publicada/page.tsx` builds it from `getCenterListaById` (extended to select `updatedAt` + reception columns) → `PublishedShare` (now opens the same sheet).

## Impact map (when implemented)

- `schema.ts` + migration: `lista_item.quantity`, 3 lista reception columns, 4 enum values.
- `publishLista` / editor action validation (custom-item category, reception fields); `lista-editor.tsx`; `insumo-selector.tsx` (category chips on custom rows).
- Donor `listas/page.tsx` (category chip row + distinct-categories query), `detail-body.tsx` (qty + Dirección lines), dashboard `lista-sections.tsx` (qty).
- `format.ts` labels; seed + prod catalog data migration; landing/`listas` copy.
- **Sharing (§4)**: `lib/listas/share-text.ts` (`buildListaShareText` + `partitionShareItems`); `components/share/share-sheet.tsx`; `share-cta-button.tsx` / `share-lista-button.tsx` / `published-share.tsx` (open the sheet); `queries.ts` (`getCenterDashboardLista` + `getCenterListaById` select address/reception/`updatedAt`).
