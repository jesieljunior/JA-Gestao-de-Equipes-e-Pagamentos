import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  ExternalLink,
  QrCode,
  ShieldCheck,
  Sparkles,
  Users2,
  Wallet,
} from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user) throw redirect({ to: "/painel" });
    } catch (e) {
      if (e && typeof e === "object" && "to" in e) throw e;
    }
  },
  head: () => ({
    meta: [
      { title: "PayCrew — SaaS de Equipes, Ponto e Pagamento por Swali" },
      {
        name: "description",
        content:
          "SaaS corporativo desenvolvido pela Swali (swali.com.br) para gestão de equipes, controle de ponto com selfie e GPS, conferência e pagamento Pix para eventos.",
      },
      {
        property: "og:title",
        content: "PayCrew — SaaS de Equipes, Ponto e Pagamento por Swali",
      },
      {
        property: "og:description",
        content:
          "Plataforma empresarial Swali para agências de eventos gerenciarem equipes freelancers e CLT: escala, folha de ponto digital por QR Code e fechamento financeiro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const BLOCOS = [
  {
    icone: CalendarDays,
    titulo: "Evento e escala integrada",
    texto:
      "Monte equipes com supervisão, escale freelancers por diária ou por hora e controle confirmações em tempo real.",
  },
  {
    icone: QrCode,
    titulo: "Folha de ponto digital intuitiva",
    texto:
      "Registro no celular por QR Code com selfie, localização GPS e validação para supervisores em campo.",
  },
  {
    icone: Wallet,
    titulo: "Fechamento ágil e Pix direto",
    texto:
      "Horas líquidas apuradas das batidas aprovadas, sem duplicidade, com quitação na chave Pix cadastrada.",
  },
];

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        navigate({ to: "/painel", replace: true });
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        navigate({ to: "/painel", replace: true });
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between">
      <div>
        {/* Navigation Bar */}
        <header className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-20">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="text-base font-bold tracking-tight text-foreground">PayCrew</span>
              <a
                href="https://www.swali.com.br/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                title="Conheça a Swali"
              >
                <Sparkles className="size-3" />
                <span>Um produto Swali</span>
                <ExternalLink className="size-2.5 opacity-60" />
              </a>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex">
                <a href="https://www.swali.com.br/" target="_blank" rel="noreferrer">
                  Sobre a Swali
                </a>
              </Button>
              <Button asChild size="sm">
                <Link to="/auth">Entrar na plataforma</Link>
              </Button>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <main className="mx-auto max-w-5xl px-4 py-12 sm:py-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs text-muted-foreground mb-6">
            <ShieldCheck className="size-3.5 text-primary" />
            <span>SaaS B2B para Agências de Eventos e Produtoras</span>
          </div>

          <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl sm:leading-tight">
            Do primeiro convite ao Pix do freelancer, tudo no mesmo fluxo.
          </h1>
          <p className="mt-5 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            O <strong>PayCrew</strong> é a plataforma operacional desenvolvida pela{" "}
            <a
              href="https://www.swali.com.br/"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline decoration-primary font-semibold hover:text-primary transition-colors"
            >
              Swali
            </a>{" "}
            para eliminar planilhas e mensagens soltas: monte escalas, colete pontos pelo celular e
            faça o fechamento financeiro com segurança jurídica e auditoria.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="h-11 px-6">
              <Link to="/auth">
                Acessar agora <ArrowRight className="size-4 ml-1.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11">
              <a href="https://www.swali.com.br/" target="_blank" rel="noreferrer">
                Conhecer soluções Swali <ExternalLink className="size-3.5 ml-1.5 opacity-70" />
              </a>
            </Button>
          </div>

          {/* Cards Grid */}
          <div className="mt-16 grid gap-4 sm:grid-cols-3">
            {BLOCOS.map((b) => (
              <section
                key={b.titulo}
                className="rounded-xl border border-border bg-card p-5 shadow-xs hover:border-primary/40 transition-colors"
              >
                <div className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <b.icone className="size-5" aria-hidden />
                </div>
                <h2 className="mt-4 text-base font-semibold text-foreground">{b.titulo}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{b.texto}</p>
              </section>
            ))}
          </div>

          {/* Highlights Section */}
          <div className="mt-12 rounded-xl border border-border bg-muted/40 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Users2 className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Projetado para equipes de alto volume
                </p>
                <p className="text-xs text-muted-foreground">
                  Suporte simultâneo a modelos Freelancers (diária/hora) e funcionários CLT.
                </p>
              </div>
            </div>
            <a
              href="https://www.swali.com.br/"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1 shrink-0"
            >
              Tecnologia Swali • saiba mais <ExternalLink className="size-3" />
            </a>
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-card/60 py-8">
        <div className="mx-auto max-w-5xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">PayCrew — Gestão Operacional de Equipes</p>
            <p className="mt-0.5">
              Um produto oficial desenvolvido e mantido por{" "}
              <a
                href="https://www.swali.com.br/"
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline decoration-primary font-semibold hover:text-primary transition-colors"
              >
                Swali (swali.com.br)
              </a>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://www.swali.com.br/"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground transition-colors"
            >
              Sobre a Swali
            </a>
            <span>•</span>
            <span>Todos os direitos reservados</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
