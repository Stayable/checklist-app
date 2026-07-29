import type { Metadata } from "next";
import { consentCopy, POLICY_VERSION } from "@/lib/consent-copy";

export const metadata: Metadata = {
  title: "Messaging Disclosures — Stayable Operations",
};

export default function MessagingDisclosuresPage() {
  const enConsent = consentCopy("en");
  const esConsent = consentCopy("es");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        {/* English Section */}
        <section className="mb-12">
          <h1 className="text-2xl font-bold text-slate-900">
            Messaging from Stayable
          </h1>

          <div className="mt-6 space-y-4 text-slate-700">
            <div>
              <h2 className="font-semibold text-slate-900">Who receives messages</h2>
              <p className="mt-1 text-sm">
                Staff and contractors who opt in during account setup.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-slate-900">How to opt in</h2>
              <p className="mt-1 text-sm">
                By ticking the consent box on a personal invitation link. Consent is
                optional and is not required to create your account or to be assigned
                work.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-slate-900">Message types</h2>
              <p className="mt-1 text-sm">
                Work assignments, job details, and urgent callouts.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-slate-900">Frequency</h2>
              <p className="mt-1 text-sm">
                Typically 0–10 messages per week, depending on job volume.
              </p>
            </div>

            <div>
              <p className="text-sm">
                Message and data rates may apply.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-slate-900">HELP and STOP</h2>
              <p className="mt-1 text-sm">
                Reply <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">HELP</code> for help or{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">STOP</code> to opt out at any time.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-slate-900">Data protection</h2>
              <p className="mt-1 text-sm">
                We do not sell, rent, or share mobile numbers with third parties for
                marketing. Numbers are used only to send the messages described here.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-slate-900">Legal</h2>
              <p className="mt-1 text-sm">
                See our{" "}
                <a
                  href="https://rentstayable.com/terms-conditions"
                  className="text-navy underline hover:text-navy/80"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Terms and Conditions
                </a>
                {" "}and{" "}
                <a
                  href="https://rentstayable.com/privacy-policy"
                  className="text-navy underline hover:text-navy/80"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy Policy
                </a>
                .
              </p>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <p className="text-xs font-mono text-slate-600">
                {enConsent}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Policy version {POLICY_VERSION}
              </p>
            </div>
          </div>
        </section>

        {/* Spanish Section */}
        <section className="border-t border-slate-200 pt-12">
          <h1 className="text-2xl font-bold text-slate-900">
            Mensajería de Stayable
          </h1>

          <div className="mt-6 space-y-4 text-slate-700">
            <div>
              <h2 className="font-semibold text-slate-900">Quién recibe mensajes</h2>
              <p className="mt-1 text-sm">
                Personal y contratistas que opten por participar durante la
                configuración de la cuenta.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-slate-900">Cómo optar por participar</h2>
              <p className="mt-1 text-sm">
                Marcando la casilla de consentimiento en un enlace de invitación
                personal. El consentimiento es opcional y no es necesario para crear su
                cuenta ni para recibir asignaciones de trabajo.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-slate-900">Tipos de mensajes</h2>
              <p className="mt-1 text-sm">
                Asignaciones de trabajo, detalles de trabajos y llamadas urgentes.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-slate-900">Frecuencia</h2>
              <p className="mt-1 text-sm">
                Normalmente de 0 a 10 mensajes por semana, según el volumen de
                trabajo.
              </p>
            </div>

            <div>
              <p className="text-sm">
                Pueden aplicarse tarifas de mensajes y datos.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-slate-900">HELP y STOP</h2>
              <p className="mt-1 text-sm">
                Responda <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">HELP</code> para obtener ayuda o{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">STOP</code> para darse de baja en cualquier
                momento.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-slate-900">Protección de datos</h2>
              <p className="mt-1 text-sm">
                No vendemos, alquilamos ni compartimos números celulares con terceros
                para marketing. Los números se utilizan únicamente para enviar los
                mensajes descritos aquí.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-slate-900">Legal</h2>
              <p className="mt-1 text-sm">
                Consulte nuestros{" "}
                <a
                  href="https://rentstayable.com/terms-conditions"
                  className="text-navy underline hover:text-navy/80"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Términos y Condiciones
                </a>
                {" "}y{" "}
                <a
                  href="https://rentstayable.com/privacy-policy"
                  className="text-navy underline hover:text-navy/80"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Política de Privacidad
                </a>
                .
              </p>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <p className="text-xs font-mono text-slate-600">
                {esConsent}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Versión de política {POLICY_VERSION}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
