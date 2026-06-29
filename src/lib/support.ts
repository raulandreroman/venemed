/**
 * Support contact — single source of truth for the "Contactar a soporte" links
 * (used by /centro/en-revision and /centro/rechazado).
 *
 * TODO: PLACEHOLDER number — replace with the real VeneMed support WhatsApp.
 */
export const SUPPORT_PHONE = "582441234567"; // E.164 digits, no "+"

/** WhatsApp deep link to support, optionally prefilled with a message. */
export function supportWhatsappHref(
  message = "Hola, necesito ayuda con mi centro en VeneMed.",
): string {
  return `https://wa.me/${SUPPORT_PHONE}?text=${encodeURIComponent(message)}`;
}
