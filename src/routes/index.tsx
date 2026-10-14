import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, QrCode, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/painel" });
  },
  head: () => ({
    meta: [
      { title: "PayCrew — Escala, ponto e pagamento de freelancers de eventos" },
      {
        name: "description",
        content:
          "Do cadastro do evento ao Pix do freelancer: escale a equipe, registre ponto por QR Code, feche as horas e pague — tudo em um só sistema.",
      },
      {
        property: "og:title",
        content: "PayCrew — Escala, ponto e pagamento de freelancers de eventos",
      },
      {
        property: "og:description",
        content:
          "Sistema para agências de eventos gerenciarem equipes freelancers: escala, check-in em campo, fechamento de horas e pagamento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

const BLOCOS = [
  {
    icone: CalendarDays,
    titulo: "Evento e escala",
    texto:
      "Monte equipes, escale freelancers por diária ou por hora e acompanhe as confirmações.",
  },
  {
    icone: QrCode,
    titulo: "Ponto em campo",
    texto:
      "Check-in e check-out por QR Code, com selfie e localização quando a agência exigir.",
  },
  {
    icone: Wallet,
    titulo: "Fechamento e Pix",
    texto:
      "Horas líquidas calculadas dos pontos aprovados, aprovação e pagamento na chave Pix.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <span className="text-sm font-semibold tracking-tight">PayCrew</span>
          <Button asChild size="sm">
            <Link to="/auth">Entrar</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-16">
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Do primeiro convite ao Pix do freelancer, sem planilha.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground">
          PayCrew é o sistema operacional das agências de eventos: escala da
          equipe, ponto em campo, fechamento de horas e pagamento, no mesmo
          fluxo.
        </p>
        <Button asChild className="mt-8">
          <Link to="/auth">
            Começar agora <ArrowRight className="size-4" />
          </Link>
        </Button>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {BLOCOS.map((b) => (
            <section
              key={b.titulo}
              className="rounded-md border border-border bg-card p-4"
            >
              <b.icone className="size-5 text-primary" aria-hidden />
              <h2 className="mt-3 text-sm font-semibold text-foreground">
                {b.titulo}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{b.texto}</p>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
