import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  ClipboardCheck,
  Contact,
  ExternalLink,
  FileBarChart,
  FileText,
  FlaskConical,
  LifeBuoy,
  LogOut,
  Menu,
  PiggyBank,
  Radio,
  Settings,
  Shield,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

import { useState, type ComponentType, type ReactNode } from "react";

import { useSessao } from "@/hooks/use-sessao";
import { supabase } from "@/integrations/supabase/client";
import { ROTULO_PAPEL, type Capacidade } from "@/lib/dominio";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface ItemNav {
  to: string;
  label: string;
  icone: ComponentType<{ className?: string }>;
  capacidade?: Capacidade;
  mobile?: boolean;
  categoria?: "operacao" | "cadastros" | "financeiro" | "config" | "plataforma";
}

const NAV: ItemNav[] = [
  { to: "/painel", label: "Painel", icone: Building2, mobile: true, categoria: "operacao" },
  {
    to: "/eventos",
    label: "Eventos",
    icone: CalendarDays,
    capacidade: "eventos.gerenciar",
    mobile: true,
    categoria: "operacao",
  },
  {
    to: "/operacao",
    label: "Operação / Ponto",
    icone: Radio,
    capacidade: "operacao.supervisionar",
    mobile: true,
    categoria: "operacao",
  },
  {
    to: "/fechamento",
    label: "Fechamento",
    icone: ClipboardCheck,
    capacidade: "fechamento.aprovar",
    mobile: true,
    categoria: "operacao",
  },
  {
    to: "/clientes",
    label: "Clientes",
    icone: Contact,
    capacidade: "cadastros.gerenciar",
    categoria: "cadastros",
  },
  {
    to: "/freelancers",
    label: "Freelancers",
    icone: Users,
    capacidade: "cadastros.gerenciar",
    categoria: "cadastros",
  },
  {
    to: "/equipe",
    label: "Equipe e acessos",
    icone: Users,
    capacidade: "configuracoes.gerenciar",
    categoria: "cadastros",
  },
  {
    to: "/saldo",
    label: "Saldo em conta",
    icone: PiggyBank,
    capacidade: "financeiro.gerenciar",
    categoria: "financeiro",
  },
  {
    to: "/financeiro",
    label: "Financeiro & Pix",
    icone: Wallet,
    capacidade: "financeiro.gerenciar",
    categoria: "financeiro",
  },
  {
    to: "/documentos-fiscais",
    label: "Documentos fiscais",
    icone: FileText,
    capacidade: "financeiro.gerenciar",
    categoria: "financeiro",
  },
  {
    to: "/plano",
    label: "Plano e faturas",
    icone: FileBarChart,
    capacidade: "configuracoes.gerenciar",
    categoria: "financeiro",
  },
  {
    to: "/relatorios",
    label: "Relatórios & CSV",
    icone: FileBarChart,
    capacidade: "relatorios.ver",
    categoria: "financeiro",
  },
  {
    to: "/configuracoes",
    label: "Configurações",
    icone: Settings,
    capacidade: "configuracoes.gerenciar",
    categoria: "config",
  },
];

const NAV_PLATAFORMA: (ItemNav & { somenteMaster?: boolean })[] = [
  {
    to: "/suporte",
    label: "Suporte PayCrew",
    icone: LifeBuoy,
    mobile: true,
    categoria: "plataforma",
  },
  {
    to: "/admin",
    label: "Admin PayCrew",
    icone: Shield,
    somenteMaster: true,
    mobile: true,
    categoria: "plataforma",
  },
  {
    to: "/acessos-teste",
    label: "Acessos de teste",
    icone: FlaskConical,
    somenteMaster: true,
    categoria: "plataforma",
  },
];

export function AppShell({
  titulo,
  descricao,
  acoes,
  children,
}: {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  const { sessao, pode, ehAdminMaster, ehEquipePlataforma, contexto } = useSessao();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [menuAberto, setMenuAberto] = useState(false);

  const temContextoPlataforma = contexto.hasPlatformContext || ehEquipePlataforma;

  const itens = [
    ...NAV.filter((i) => contexto.hasOrganizationContext && (!i.capacidade || pode(i.capacidade))),
    ...NAV_PLATAFORMA.filter((i) => (i.somenteMaster ? ehAdminMaster : temContextoPlataforma)),
  ];

  // Quick 4 primary actions for mobile bottom bar + "Mais" button
  const itensMobileFixos = itens.filter((i) => i.mobile).slice(0, 4);

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Desktop Sidebar */}
      <aside className="hidden bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col border-r border-sidebar-border">
        {/* Brand header */}
        <div className="border-b border-sidebar-border px-4 py-4 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-base font-bold tracking-tight text-sidebar-foreground">
              PayCrew
            </span>
            <a
              href="https://www.swali.com.br/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
              title="Acesse o site oficial da Swali"
            >
              <Sparkles className="size-2.5" />
              <span>por Swali</span>
            </a>
          </div>
          <p className="truncate text-xs text-sidebar-foreground/70">
            {temContextoPlataforma
              ? "Plataforma PayCrew"
              : (sessao?.empresa?.nome ?? "Operação e pagamento de equipes")}
          </p>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {itens.map((item) => {
            const ativo =
              pathname === item.to || (item.to !== "/painel" && pathname.startsWith(item.to));
            const Icone = item.icone;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  ativo
                    ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-xs"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icone className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User profile & Swali footer */}
        <div className="border-t border-sidebar-border p-3 space-y-2 text-xs text-sidebar-foreground/70">
          <div className="px-1">
            <p className="truncate font-semibold text-sidebar-foreground">{sessao?.usuario.nome}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {sessao?.papeis.map((p) => ROTULO_PAPEL[p]).join(" · ") || "Sem papel"}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-full justify-start px-2 text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent"
            onClick={sair}
          >
            <LogOut className="size-3.5 mr-2" /> Encerrar sessão
          </Button>

          <div className="pt-2 border-t border-sidebar-border/60 text-center">
            <a
              href="https://www.swali.com.br/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Uma solução</span>
              <span className="font-semibold text-foreground underline decoration-primary/40 underline-offset-2">
                Swali
              </span>
              <ExternalLink className="size-2.5 opacity-60" />
            </a>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-h-screen flex-col pb-20 lg:pb-0">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-primary lg:hidden">
                  PayCrew
                </span>
                <span className="text-[10px] text-muted-foreground lg:hidden">
                  por{" "}
                  <a
                    href="https://www.swali.com.br/"
                    target="_blank"
                    rel="noreferrer"
                    className="underline font-medium"
                  >
                    Swali
                  </a>
                </span>
              </div>
              <h1 className="truncate text-base lg:text-lg font-bold tracking-tight text-foreground">
                {titulo}
              </h1>
              {descricao ? (
                <p className="truncate text-xs lg:text-sm text-muted-foreground">{descricao}</p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {acoes}
              <Button
                size="sm"
                variant="ghost"
                className="lg:hidden text-muted-foreground hover:text-foreground"
                onClick={sair}
                aria-label="Sair"
                title="Sair"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-4 lg:px-6 lg:py-6">{children}</main>

        {/* Global Footer with Swali branding */}
        <footer className="border-t border-border/60 py-4 px-4 text-center text-xs text-muted-foreground hidden lg:block">
          <p>
            PayCrew — Sistema Operacional de Equipes de Eventos • Desenvolvido e operado pela{" "}
            <a
              href="https://www.swali.com.br/"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline decoration-primary/50 underline-offset-2 hover:text-primary transition-colors"
            >
              Swali Tecnologia (swali.com.br)
            </a>
          </p>
        </footer>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background/98 backdrop-blur-md lg:hidden shadow-lg safe-area-pb">
        {itensMobileFixos.map((item) => {
          const ativo =
            pathname === item.to || (item.to !== "/painel" && pathname.startsWith(item.to));
          const Icone = item.icone;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors touch-manipulation",
                ativo
                  ? "text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icone className={cn("size-5", ativo && "stroke-[2.25]")} />
              <span className="truncate px-0.5">{item.label}</span>
            </Link>
          );
        })}

        {/* 5th Button: 'Mais' triggers full mobile Sheet drawer */}
        <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
          <SheetTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors touch-manipulation",
                menuAberto && "text-primary font-semibold",
              )}
            >
              <Menu className="size-5" />
              <span>Menu</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl p-0 flex flex-col">
            <SheetHeader className="border-b border-border p-4 text-left">
              <div className="flex items-center justify-between">
                <div>
                  <SheetTitle className="text-base font-bold flex items-center gap-2">
                    PayCrew
                    <span className="text-[10px] font-normal text-muted-foreground">por Swali</span>
                  </SheetTitle>
                  <p className="text-xs text-muted-foreground">
                    {sessao?.empresa?.nome ?? "Menu de navegação"}
                  </p>
                </div>
                <a
                  href="https://www.swali.com.br/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-primary underline"
                >
                  swali.com.br
                </a>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {itens.map((item) => {
                  const ativo =
                    pathname === item.to || (item.to !== "/painel" && pathname.startsWith(item.to));
                  const Icone = item.icone;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMenuAberto(false)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg border p-3 text-xs transition-colors",
                        ativo
                          ? "border-primary bg-primary/10 font-semibold text-primary"
                          : "border-border bg-card text-card-foreground hover:bg-muted",
                      )}
                    >
                      <Icone className="size-4 shrink-0 text-primary" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
                <div>
                  <p className="font-semibold text-foreground">{sessao?.usuario.nome}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {sessao?.papeis.map((p) => ROTULO_PAPEL[p]).join(" · ")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMenuAberto(false);
                    void sair();
                  }}
                >
                  <LogOut className="size-3.5 mr-1" /> Sair
                </Button>
              </div>

              <div className="p-3 rounded-lg bg-muted/60 text-center text-[11px] text-muted-foreground">
                <p>
                  PayCrew é um SaaS corporativo da{" "}
                  <a
                    href="https://www.swali.com.br/"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-foreground underline"
                  >
                    Swali Tecnologia
                  </a>
                </p>
                <p className="mt-0.5 text-[10px]">Acesse swali.com.br para saber mais</p>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  );
}
