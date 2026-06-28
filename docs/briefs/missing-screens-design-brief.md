# VeneMed — Design Brief: Admin, Moderation & Missing Screens

> **Status**: draft. Last updated 2026-06-28.
> Brief for the designer. Scope = screens not yet in the "VenemedApp" Figma file. Context: shipping ASAP after the Venezuela earthquake — priorities are marked P0/P1.

## 1. Context & what already exists

VeneMed connects health centers (hospitals, elderly homes, children's shelters, collection centers) with donors. Centers publish *solicitudes* (time-windowed requests for supplies); donors browse anonymously and share them. Already designed in Figma:

- **Donor (public):** Landing, Solicitudes activas (list + search/filter/sort), Detalle solicitud (activa / cerrada), "Cómo ayudar" share sheet.
- **Center (back office):** Inicio, Iniciar sesión (L1), Registro (R0 → datos → verificar teléfono → en revisión → rechazado), Dashboard (vacío / lleno), Crear solicitud, Selector de insumos, Solicitud publicada, Detalle solicitud (centro), error states (datos con errores, intentos agotados, sin conexión).

**Two things drive this brief:** (1) the **admin/moderation surface is entirely undesigned** even though the flow depends on it — centers sit "en revisión" before they can publish, so someone must vet them; (2) the **offline-with-sync** decision adds new states (offline browsing, confirm-on-reconnect) that don't exist yet.

## 2. Conventions to follow

- **Reuse the UI Kit.** Same components (Card, Chip, Button, Tag, AppBar), spacing, type scale, and color language already in the file. New surfaces should feel like the same product.
- **Language:** Spanish (Venezuela), same voice as existing copy ("Vence en 8 h", "Comparte esta solicitud").
- **Viewport:** donor + center surfaces are **mobile-first, 390px**. The **admin/moderation surface should be designed desktop-first (≥1280px) + responsive** — moderators triage on a computer. *(Flagged as a decision below — confirm before starting.)*
- **Every screen needs its states.** For each, design: default, **loading**, **empty**, **error**, and where relevant **offline**. A checklist is included per screen group.
- **Status vocabulary** (drives badges/colors): centers are `pending_review` / `approved` / `rejected` / `suspended`; requests are `draft` / `active` / `paused` / `closed` / `expired`. Use consistent color coding across surfaces.

## 3. Surface A — Admin & Moderation (NEW, highest priority)

The internal tool VeneMed staff use to vet centers and keep the platform clean. **Desktop-first.**

- **A1 · Admin login** — `P0`. Staff sign-in (separate from center login). Likely phone-OTP like centers, or email — confirm with eng.
- **A2 · Moderation queue (home)** — `P0`. The default admin screen. A table/list of centers `pending_review`, newest first, with: center name, type, city, contact, submitted-ago, and quick approve/reject actions. Needs filters (status, city, type) and a count badge. This is the screen staff live in during the surge.
- **A3 · Center review detail** — `P0`. Full submitted center profile for vetting: all registration data, contact, address, any uploaded proof/credentials. Primary actions: **Approve** and **Reject (with reason)** — reason is required and surfaces to the center on their "Centro rechazado" screen. Show a moderation history/audit trail.
- **A4 · Reject reason modal** — `P0`. Required-reason capture; reusable confirm pattern.
- **A5 · Centers directory** — `P1`. All centers across statuses (approved/rejected/suspended), searchable; lets staff **suspend** a bad actor or re-review a rejection.
- **A6 · Request moderation / takedown** — `P1`. View any published `solicitud`; flag or force-close one that's inappropriate or stale. Confirm dialog with reason → writes to audit log.
- **A7 · Admin overview / metrics** — `P1`. Lightweight dashboard: pending count, active requests, centers approved this week, recent activity. Helps staff prioritize.

> **States checklist for A2/A5:** loading skeleton, empty ("no hay centros por revisar"), error (load failed + retry), and a post-action toast (approved/rejected confirmation).

## 4. Surface B — Center back-office gaps

Screens/states the center flow implies but doesn't yet have.

- **B1 · Confirm-on-reconnect ("Listo para publicar")** — `P0`, **net-new from the offline decision.** When a center drafted a request offline and connectivity returns, show the queued request for a final review before it goes live: re-validated window/time, "esto se publicará ahora", and **Confirmar / Editar** actions. Also a **sync status indicator** (e.g. "Borrador guardado · se publicará al reconectar") for the offline/queued state. This is the linchpin of the offline UX — please prioritize.
- **B2 · Request action confirms** — `P0`. Confirmation dialogs for the center's lifecycle actions on Detalle (centro): **Pausar**, **Reanudar**, **Marcar como cumplida / Cerrar**. Each: short confirm + result toast. (The detail screen exists; the action dialogs don't.)
- **B3 · Edit request** — `P1`. Editing an existing `draft` or `active` request (reuses Crear solicitud layout in an edit mode).
- **B4 · Center profile / settings** — `P1`. View/edit center info, manage staff (if multi-user), log out.
- **B5 · Dashboard list states** — `P1`. Loading, error, and the "all requests closed/expired" empty variant (distinct from the never-created "Dashboard vacío" that exists).

## 5. Surface C — Donor gaps

- **C1 · Donor offline read state** — `P0`, **net-new from the offline decision.** Banner + behavior for browsing the active list / a detail while offline: "Sin conexión · mostrando datos de hace X" with cached content still usable, and a subtle refresh-on-reconnect cue. (The center "sin conexión" screen exists; the donor *read-while-offline* experience does not.)
- **C2 · Search / filter no-results** — `P1`. Empty state for "Solicitudes activas" when search or filters return nothing.
- **C3 · Shared-link → paused/expired landing** — `P1`. When someone opens a shared link whose request is now `paused` or `expired`, what they see. (The "Detalle · Solicitud Cerrada" covers `closed`; confirm it also covers paused/expired, or design the variant.)

## 6. Cross-cutting / system screens

- **D1 · PWA install prompt / "añadir a inicio"** — `P1`. Encourage centers to install the app for repeat offline use.
- **D2 · 404 / generic error page** — `P1`. On-brand, with a route back to the active list.
- **D3 · Toast / inline notification component** — `P0` (if not already in the UI Kit). Success/error feedback used across approve, publish, pause, sync-confirm, etc.

## 7. Priority for the ASAP timeline

- **P0 (block launch):** A1, A2, A3, A4 (moderation core); B1 (confirm-on-reconnect) + B2 (action confirms); C1 (donor offline); D3 (toasts).
- **P1 (fast-follow):** A5, A6, A7; B3, B4, B5; C2, C3; D1, D2.

## 8. Decisions to confirm before starting

1. **Admin viewport** — desktop-first responsive (recommended) vs mobile like the rest? Affects layout grid for A2/A3.
2. **Admin auth** — same phone-OTP as centers, or email/password for staff?
3. **Paused/expired shared-link state** — does the existing "Cerrada" detail cover these, or are separate variants wanted?
4. **Multi-staff per center in v1** — does B4 need staff management, or single user per center for launch?

## 9. Handoff format

- Add the new screens as their own Figma sections, mirroring the existing naming (`A1 · …`, numbered).
- Use existing components/variants; extend the UI Kit rather than introducing parallel styles.
- Annotate non-obvious interactions (what each action does, which status it sets) so eng can wire them to the data model directly.
