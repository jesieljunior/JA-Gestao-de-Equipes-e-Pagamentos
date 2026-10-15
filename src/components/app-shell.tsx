import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  ClipboardCheck,
  Contact,
  FileText,
  FileBarChart,
  FlaskConical,
  LifeBuoy,
  LogOut,
  PiggyBank,
  Radio,
  Settings,
  Shield,
  Users,
  Wallet,
} from "lucide-react";

import type { ComponentType, ReactNode } from "react";

import { useSessao } from "@/hooks/use-sessao";
import { supabase } from "@/integrations/supabase/client";
import { ROTULO_PAPEL, type Capacidade } from "@/lib/dominio";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ItemNav {
  to: string;
  label: string;
  icone: ComponentType<{ className?: string }>;
  capacidade?: Capacidade;
  mobile?: boolean;
}

const NAV: ItemNav[] = [
  { to: "/plano", label: "Plano e uso", icone: FileBarChart, capacidade: "configuracoes.gerenciar" },
  { to: "/painel", label: "Painel", icone: Building2, mobile: true },
  {
    to: "/saldo",
    label: "Saldo",
    icone: PiggyBank,
    capacidade: "financeiro.gerenciar",
  },

  {
    to: "/eventos",
    label: "Eventos",
    icone: CalendarDays,
    capacidade: "eventos.gerenciar",
    mobile: true,
  },
  {
    to: "/operacao",
    label: "Operação",
    icone: Radio,
    capacidade: "operacao.supervisionar",
    mobile: true,
  },
  {
    to: "/fechamento",
    label: "Fechamento",
    icone: ClipboardCheck,
    capacidade: "fechamento.aprovar",
    mobile: true,
  },
  {
    to: "/financeiro",
    label: "Financeiro",
    icone: Wallet,
    capacidade: "financeiro.gerenciar",
    mobile: true,
  },
  {
    to: "/clientes",
    label: "Clientes",
    icone: Contact,
    capacidade: "cadastros.gerenciar",
  },
  {
    to: "/freelancers",
    label: "Freelancers",
    icone: Users,
    capacidade: "cadastros.gerenciar",
  },
  {
    to: "/equipe",
    label: "Equipe e acessos",
    icone: Users,
    capacidade: "configuracoes.gerenciar",
  },
  {
    to: "/documentos-fiscais",
    label: "Documentos fiscais",
    icone: FileText,
    capacidade: "financeiro.gerenciar",
  },
  {
    to: "/relatorios",
    label: "Relatórios",
    icone: FileBarChart,
    capacidade: "relatorios.ver",
  },
  {
    to: "/configuracoes",
    label: "Configurações",
    icone: Settings,
    capacidade: "configuracoes.gerenciar",
  },
];

const NAV_PLATAFORMA: (ItemNav & { somenteMaster?: boolean })[] = [
  { to: "/suporte", label: "Suporte PayCrew", icone: LifeBuoy, mobile: true },
  { to: "/admin", label: "Admin PayCrew", icone: Shield, somenteMaster: true, mobile: true },
  { to: "/acessos-teste", label: "Acessos de teste", icone: FlaskConical, somenteMaster: true },
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

  const temContextoPlataforma = contexto.hasPlatformContext || ehEquipePlataforma;

  const itens = [
    ...NAV.filter((i) => contexto.hasOrganizationContext && (!i.capacidade || pode(i.capacidade))),
    ...NAV_PLATAFORMA.filter((i) => (i.somenteMaster ? ehAdminMaster : temContextoPlataforma)),
  ];
  const itensMobile = itens.filter((i) => i.mobile).slice(0, 5);

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="hidden bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="border-b border-sidebar-border px-4 py-4">
          <p className="text-sm font-semibold tracking-tight">PayCrew</p>
          <p className="truncate text-xs text-sidebar-foreground/60">
            {temContextoPlataforma ? "Plataforma PayCrew" : sessao?.empresa?.nome ?? "Operação e pagamento de equipes"}
          </p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {itens.map((item) => {
            const ativo = pathname.startsWith(item.to);
            const Icone = item.icone;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2 rounded-sm px-2.5 py-2 text-sm transition-colors",
                  ativo
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icone className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-sidebar-border px-4 py-3 text-xs text-sidebar-foreground/70">
          <p className="truncate font-medium text-sidebar-foreground">{sessao?.usuario.nome}</p>
          <p className="truncate">
            {sessao?.papeis.map((p) => ROTULO_PAPEL[p]).join(" · ") || "Sem papel"}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-full justify-start px-2 text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent"
            onClick={sair}
          >
            <LogOut className="size-3.5" /> Sair
          </Button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col pb-16 lg:pb-0">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
                {titulo}
              </h1>
              {descricao ? (
                <p className="truncate text-sm text-muted-foreground">{descricao}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {acoes}
              <Button
                size="sm"
                variant="ghost"
                className="lg:hidden"
                onClick={sair}
                aria-label="Sair"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-4 lg:px-6 lg:py-6">{children}</main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid border-t border-border bg-background lg:hidden"
        style={{ gridTemplateColumns: `repeat(${itensMobile.length || 1}, minmax(0, 1fr))` }}
      >
        {itensMobile.map((item) => {
          const ativo = pathname.startsWith(item.to);
          const Icone = item.icone;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-[11px]",
                ativo ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icone className="size-5" />
              <span className="truncate px-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
