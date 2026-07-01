import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppBar } from "@/components/ui";

export const metadata: Metadata = {
  title: "Privacidad y seguridad · VeneMed",
  description:
    "Cómo VeneMed protege a donantes y centros: navegación anónima, sin rastreadores, y la identidad de las personas de los centros nunca es pública.",
};

// Static content — safe to prerender and cache aggressively.
export const dynamic = "force-static";

const UPDATED = "30 de junio de 2026";

// TODO(#31): placeholder — no real contact/privacy inbox exists yet. Replace
// with a monitored address before promoting the policy (it's also the
// data-deletion request channel).
const CONTACT_EMAIL = "contacto@ejemplo.com";

export default function PrivacidadPage() {
  return (
    <>
      <AppBar title="Privacidad y seguridad" backHref="/" />
      <main className="flex flex-1 flex-col gap-6 px-6 pb-16 pt-6">
        <div>
          <h1 className="text-[22px] font-bold leading-7 text-neutral-900">
            Tu seguridad es lo primero
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-neutral-600">
            VeneMed existe para que la ayuda llegue rápido sin poner en riesgo a
            nadie. Aquí te explicamos, sin letra pequeña, qué información
            manejamos y cómo la protegemos.
          </p>
          <p className="mt-2 text-xs text-neutral-400">
            Última actualización: {UPDATED}
          </p>
        </div>

        {/* Key promise */}
        <div className="rounded-2xl border border-accent-border bg-accent-subtle p-5">
          <p className="text-[15px] font-semibold leading-6 text-neutral-900">
            Los donantes son anónimos. La identidad de las personas de los
            centros nunca es pública.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-700">
            Solo se publica lo necesario para que las donaciones lleguen: qué se
            necesita y a dónde llevarlo. Los teléfonos y las personas detrás de
            cada centro se mantienen privados.
          </p>
        </div>

        <Section title="Si eres donante: eres anónimo">
          <ul className="flex flex-col gap-2">
            <Bullet>No necesitas cuenta ni registrarte.</Bullet>
            <Bullet>No te pedimos nombre, teléfono ni correo.</Bullet>
            <Bullet>
              No usamos rastreadores, ni cookies publicitarias, ni herramientas
              de analítica como Google Analytics.
            </Bullet>
            <Bullet>No guardamos tu dirección IP.</Bullet>
            <Bullet>
              Ver y compartir solicitudes no deja ningún rastro tuyo en nuestros
              sistemas.
            </Bullet>
          </ul>
        </Section>

        <Section title="Si tu centro se registra: qué pedimos y por qué">
          <ul className="flex flex-col gap-2">
            <Bullet>
              <strong className="font-semibold text-neutral-900">
                Correo electrónico:
              </strong>{" "}
              solo para darte acceso con un código de verificación. Es tu forma
              de iniciar sesión — no usamos contraseñas.
            </Bullet>
            <Bullet>
              <strong className="font-semibold text-neutral-900">
                Teléfono de contacto (WhatsApp, opcional):
              </strong>{" "}
              solo para coordinar la entrega de las donaciones. Puedes dejarlo en
              blanco.
            </Bullet>
            <Bullet>
              <strong className="font-semibold text-neutral-900">
                Persona responsable y cargo (opcional):
              </strong>{" "}
              para verificar que el centro es real antes de activarlo.
            </Bullet>
            <Bullet>
              <strong className="font-semibold text-neutral-900">
                Datos del centro:
              </strong>{" "}
              nombre, ciudad, dirección y horario, para que los donantes sepan a
              dónde llevar la ayuda.
            </Bullet>
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-neutral-600">
            Solo pedimos lo mínimo necesario para que las donaciones lleguen.
          </p>
        </Section>

        <Section title="Qué es público y qué es privado">
          <div className="flex flex-col gap-3">
            <div className="rounded-xl bg-neutral-50 p-4">
              <p className="text-sm font-semibold text-neutral-900">
                Público (a propósito)
              </p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-600">
                El nombre del centro, la ciudad, la dirección de entrega, el
                horario y lo que se necesita. Es público para que cualquier
                donante pueda llegar sin tener que contactar a nadie.
              </p>
            </div>
            <div className="rounded-xl bg-neutral-50 p-4">
              <p className="text-sm font-semibold text-neutral-900">
                Privado (nunca se muestra)
              </p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-600">
                El correo de acceso y el teléfono de contacto del centro, el
                nombre y cargo de la persona responsable, y cualquier dato de
                acceso. Esta información solo la usa el equipo de moderación de
                VeneMed para verificar centros.
              </p>
            </div>
          </div>
        </Section>

        <Section title="Lo que NO hacemos">
          <ul className="flex flex-col gap-2">
            <Bullet>No vendemos ni compartimos datos con fines comerciales.</Bullet>
            <Bullet>No mostramos publicidad.</Bullet>
            <Bullet>No rastreamos a los donantes.</Bullet>
            <Bullet>No guardamos las direcciones IP de quienes navegan.</Bullet>
            <Bullet>
              No publicamos el teléfono ni la identidad de las personas de los
              centros.
            </Bullet>
          </ul>
        </Section>

        <Section title="Cómo protegemos tus datos">
          <ul className="flex flex-col gap-2">
            <Bullet>
              Acceso con verificación por código (OTP) — sin contraseñas que se
              puedan filtrar o adivinar.
            </Bullet>
            <Bullet>Protección contra bots y accesos automatizados.</Bullet>
            <Bullet>Cifrado en tránsito (HTTPS) y en reposo.</Bullet>
            <Bullet>
              Acceso restringido: cada centro solo puede ver y editar sus
              propios datos.
            </Bullet>
            <Bullet>
              Tus datos se alojan en infraestructura internacional, fuera de
              Venezuela.
            </Bullet>
            <Bullet>
              No registramos información personal en nuestros registros técnicos.
            </Bullet>
            <Bullet>
              Usamos monitoreo de errores para mantener el servicio en línea, sin
              datos personales: no guarda teléfonos, direcciones IP ni graba tu
              pantalla.
            </Bullet>
          </ul>
        </Section>

        <Section title="Proveedores que hacen funcionar la plataforma">
          <p className="text-sm leading-relaxed text-neutral-600">
            Para operar usamos servicios de infraestructura reconocidos
            (alojamiento web, base de datos y envío de códigos por correo
            electrónico), alojados fuera de Venezuela. Solo reciben lo mínimo
            necesario para funcionar y están sujetos a sus propias protecciones
            de seguridad. No compartimos datos con terceros para ningún otro
            fin.
          </p>
        </Section>

        <Section title="Tú tienes el control">
          <ul className="flex flex-col gap-2">
            <Bullet>
              Puedes editar los datos de tu centro cuando quieras desde tu
              panel.
            </Bullet>
            <Bullet>
              Puedes pausar la recepción de donaciones en cualquier momento.
            </Bullet>
            <Bullet>
              Puedes solicitar la eliminación total de tu centro y de tus datos.
            </Bullet>
          </ul>
        </Section>

        <Section title="Cambios y contacto">
          <p className="text-sm leading-relaxed text-neutral-600">
            Si actualizamos esta política, cambiaremos la fecha de arriba.
            ¿Tienes dudas o quieres eliminar tus datos? Escríbenos a{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-semibold text-accent"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
      {children}
    </section>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm leading-relaxed text-neutral-600">
      <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-neutral-300" />
      <span>{children}</span>
    </li>
  );
}
