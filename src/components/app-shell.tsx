import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Contact,
  CreditCard,
  ExternalLink,
  FileBarChart,
  FileText,
  FlaskConical,
  LifeBuoy,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PiggyBank,
  Radio,
  Settings,
  Shield,
  Sparkles,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useState, type ComponentType, type ReactNode } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSessao } from "@/hooks/use-sessao";
import { supabase } from "@/integrations/supabase/client";
import { ROTULO_PAPEL, type Capacidade } from "@/lib/dominio";
import { cn } from "@/lib/utils";

type CategoriaNav = "operacao" | "cadastros" | "financeiro" | "config" | "plataforma";

const ROTULO_CATEGORIA: Record<CategoriaNav, string> = {
  operacao: "Operação",
  cadastros: "Pessoas & Cadastros",
  financeiro: "Financeiro & Fiscal",
  config: "Sistema",
  plataforma: "Plataforma Já",
};

interface ItemNav {
  to: string;
  label: string;
  icone: ComponentType<{ className?: string }>;
  capacidade?: Capacidade;
  mobile?: boolean;
  categoria: CategoriaNav;
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
    icone: UserCheck,
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
    icone: CreditCard,
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
    label: "Suporte Já",
    icone: LifeBuoy,
    mobile: true,
    categoria: "plataforma",
  },
  {
    to: "/admin",
    label: "Admin Já",
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

function extrairIniciais(nome?: string | null): string {
  if (!nome || !nome.trim()) return "JÁ";
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return (partes[0]?.slice(0, 2) ?? "JÁ").toUpperCase();
  const primeiro = partes[0]?.[0] ?? "";
  const ultimo = partes[partes.length - 1]?.[0] ?? "";
  return (primeiro + ultimo).toUpperCase();
}

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

  const [recolhido, setRecolhido] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("ja_sidebar_recolhida") === "true";
    }
    return false;
  });

  function alternarRecolhido() {
    setRecolhido((prev) => {
      const novo = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("ja_sidebar_recolhida", String(novo));
      }
      return novo;
    });
  }

  const temContextoPlataforma = contexto.hasPlatformContext || ehEquipePlataforma;

  const itens = [
    ...NAV.filter((i) => contexto.hasOrganizationContext && (!i.capacidade || pode(i.capacidade))),
    ...NAV_PLATAFORMA.filter((i) => (i.somenteMaster ? ehAdminMaster : temContextoPlataforma)),
  ];

  // Identifica a categoria atual a partir da rota
  const itemAtivo = itens.find(
    (i) => pathname === i.to || (i.to !== "/painel" && pathname.startsWith(i.to)),
  );
  const categoriaAtual = itemAtivo?.categoria;

  // Agrupamento por categoria para exibição estruturada
  const categoriasOrdem: CategoriaNav[] = [
    "operacao",
    "cadastros",
    "financeiro",
    "config",
    "plataforma",
  ];
  const itensPorCategoria = categoriasOrdem
    .map((cat) => ({
      categoria: cat,
      titulo: ROTULO_CATEGORIA[cat],
      itens: itens.filter((i) => i.categoria === cat),
    }))
    .filter((grupo) => grupo.itens.length > 0);

  // Ações prioritárias da barra inferior no mobile
  const itensMobileFixos = itens.filter((i) => i.mobile).slice(0, 4);

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          "min-h-screen bg-background transition-[grid-template-columns] duration-200 ease-in-out lg:grid",
          recolhido ? "lg:grid-cols-[4.75rem_1fr]" : "lg:grid-cols-[16rem_1fr]",
        )}
      >
        {/* Barra Lateral Desktop */}
        <aside
          className={cn(
            "hidden bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col border-r border-sidebar-border transition-all duration-200 ease-in-out select-none",
            recolhido ? "w-[4.75rem]" : "w-64",
          )}
        >
          {/* Cabeçalho da Marca Já */}
          <div className="border-b border-sidebar-border p-3.5 flex flex-col justify-center min-h-[4.25rem]">
            {recolhido ? (
              <div className="flex flex-col items-center justify-center gap-1">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-black text-base shadow-xs">
                  Já
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-black text-sm shadow-xs">
                      Já
                    </div>
                    <span className="text-base font-extrabold tracking-tight text-sidebar-foreground">
                      Já
                    </span>
                  </div>
                  <a
                    href="https://www.swali.com.br/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary-foreground/90 hover:bg-primary/25 transition-colors"
                    title="Solução desenvolvida pela Swali"
                  >
                    <Sparkles className="size-2.5 text-primary" />
                    <span>por Swali</span>
                  </a>
                </div>
                <p className="truncate text-[11px] text-sidebar-foreground/70 font-medium">
                  {temContextoPlataforma
                    ? "Plataforma Já"
                    : (sessao?.empresa?.nome ?? "Gestão de Equipes e Pagamentos")}
                </p>
              </div>
            )}
          </div>

          {/* Navegação por Módulos */}
          <nav className="flex-1 overflow-y-auto p-2 space-y-4">
            {itensPorCategoria.map((grupo) => (
              <div key={grupo.categoria} className="space-y-1">
                {!recolhido ? (
                  <p className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/40">
                    {grupo.titulo}
                  </p>
                ) : (
                  <div className="my-1.5 border-t border-sidebar-border/40 mx-2" />
                )}

                <div className="space-y-0.5">
                  {grupo.itens.map((item) => {
                    const ativo =
                      pathname === item.to ||
                      (item.to !== "/painel" && pathname.startsWith(item.to));
                    const Icone = item.icone;

                    if (recolhido) {
                      return (
                        <Tooltip key={item.to}>
                          <TooltipTrigger asChild>
                            <Link
                              to={item.to}
                              className={cn(
                                "flex size-10 items-center justify-center rounded-md mx-auto transition-colors",
                                ativo
                                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-xs"
                                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                              )}
                            >
                              <Icone className={cn("size-4 shrink-0", ativo && "text-primary")} />
                              <span className="sr-only">{item.label}</span>
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="font-medium">
                            {item.label}
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors relative",
                          ativo
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-xs"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                        )}
                      >
                        {ativo ? (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-sm bg-primary" />
                        ) : null}
                        <Icone
                          className={cn(
                            "size-4 shrink-0 transition-colors",
                            ativo ? "text-primary" : "text-sidebar-foreground/60",
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Rodapé da Sidebar com Perfil e Ações */}
          <div className="border-t border-sidebar-border p-2.5 space-y-2">
            {!recolhido ? (
              <div className="flex items-center justify-between gap-2 px-1 py-1">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar className="size-7 shrink-0 border border-sidebar-border">
                    <AvatarFallback className="text-[11px] font-bold bg-primary/20 text-sidebar-foreground">
                      {extrairIniciais(sessao?.usuario.nome)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-sidebar-foreground">
                      {sessao?.usuario.nome}
                    </p>
                    <p className="truncate text-[10px] text-sidebar-foreground/60">
                      {sessao?.papeis.map((p) => ROTULO_PAPEL[p]).join(" · ") || "Colaborador"}
                    </p>
                  </div>
                </div>

                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-sidebar-foreground/70 hover:text-destructive hover:bg-sidebar-accent shrink-0"
                  onClick={sair}
                  title="Encerrar sessão"
                  aria-label="Encerrar sessão"
                >
                  <LogOut className="size-3.5" />
                </Button>
              </div>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-10 mx-auto text-sidebar-foreground/70 hover:text-destructive hover:bg-sidebar-accent"
                    onClick={sair}
                    aria-label="Encerrar sessão"
                  >
                    <LogOut className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Encerrar sessão</TooltipContent>
              </Tooltip>
            )}

            {/* Botão de alternar recolhimento */}
            <Button
              size="sm"
              variant="ghost"
              className={cn(
                "w-full text-[11px] text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                recolhido ? "h-8 px-0 justify-center" : "h-7 justify-start px-2 gap-1.5",
              )}
              onClick={alternarRecolhido}
              title={recolhido ? "Expandir barra lateral" : "Recolher barra lateral"}
            >
              {recolhido ? (
                <ChevronRight className="size-3.5" />
              ) : (
                <>
                  <ChevronLeft className="size-3.5" />
                  <span>Recolher menu</span>
                </>
              )}
            </Button>

            {!recolhido ? (
              <div className="pt-2 border-t border-sidebar-border/60">
                <a
                  href="https://www.swali.com.br/"
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center justify-center gap-1.5 rounded-md border border-sidebar-border/60 bg-sidebar-accent/30 px-2 py-1.5 text-[11px] font-medium text-sidebar-foreground transition-all hover:border-primary/40 hover:bg-sidebar-accent shadow-2xs"
                >
                  <span className="text-sidebar-foreground/60 group-hover:text-sidebar-foreground">
                    Solução
                  </span>
                  <span className="font-bold tracking-wide text-primary">Swali</span>
                  <ExternalLink className="size-3 text-sidebar-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </a>
              </div>
            ) : null}
          </div>
        </aside>

        {/* Área de Conteúdo Principal */}
        <div className="flex min-h-screen flex-col pb-20 lg:pb-0">
          <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
              <div className="flex items-center gap-3 min-w-0">
                {/* Botão de alternar sidebar no topo (desktop) */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden lg:inline-flex size-8 text-muted-foreground hover:text-foreground shrink-0"
                  onClick={alternarRecolhido}
                  title={recolhido ? "Expandir menu lateral" : "Recolher menu lateral"}
                  aria-label={recolhido ? "Expandir menu lateral" : "Recolher menu lateral"}
                >
                  {recolhido ? (
                    <PanelLeftOpen className="size-4" />
                  ) : (
                    <PanelLeftClose className="size-4" />
                  )}
                </Button>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-primary lg:hidden">
                      Já
                    </span>
                    <span className="text-[10px] text-muted-foreground lg:hidden">
                      por{" "}
                      <a
                        href="https://www.swali.com.br/"
                        target="_blank"
                        rel="noreferrer"
                        className="underline font-medium hover:text-foreground"
                      >
                        Swali
                      </a>
                    </span>
                    {categoriaAtual ? (
                      <span className="hidden sm:inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {ROTULO_CATEGORIA[categoriaAtual]}
                      </span>
                    ) : null}
                  </div>
                  <h1 className="truncate text-base lg:text-lg font-bold tracking-tight text-foreground">
                    {titulo}
                  </h1>
                  {descricao ? (
                    <p className="truncate text-xs text-muted-foreground">{descricao}</p>
                  ) : null}
                </div>
              </div>

              {/* Ações e Contexto do Cabeçalho */}
              <div className="flex items-center gap-2 shrink-0">
                {acoes}

                {/* Badge de contexto da organização (Desktop) */}
                <div className="hidden xl:flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground shadow-2xs">
                  {temContextoPlataforma ? (
                    <>
                      <Shield className="size-3.5 text-primary" />
                      <span className="font-semibold text-primary">Plataforma Já</span>
                    </>
                  ) : (
                    <>
                      <Building2 className="size-3.5 text-muted-foreground" />
                      <span className="max-w-[140px] truncate font-medium">
                        {sessao?.empresa?.nome ?? "Organização"}
                      </span>
                    </>
                  )}
                </div>

                {/* Menu de Perfil do Usuário com Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center gap-2 pl-1.5 pr-2 h-9 rounded-full hover:bg-accent border border-transparent hover:border-border transition-all"
                    >
                      <Avatar className="size-7 border border-border">
                        <AvatarFallback className="text-[11px] font-bold bg-primary/10 text-primary">
                          {extrairIniciais(sessao?.usuario.nome)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="hidden md:inline-block max-w-[110px] truncate text-xs font-semibold text-foreground text-left">
                        {sessao?.usuario.nome}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 p-1.5">
                    <DropdownMenuLabel className="font-normal p-2">
                      <div className="flex flex-col space-y-1">
                        <p className="text-xs font-bold leading-none text-foreground">
                          {sessao?.usuario.nome}
                        </p>
                        <p className="text-[11px] leading-none text-muted-foreground truncate">
                          {sessao?.usuario.email}
                        </p>
                        <div className="pt-1 flex flex-wrap gap-1">
                          {sessao?.papeis.map((papel) => (
                            <Badge
                              key={papel}
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 font-normal"
                            >
                              {ROTULO_PAPEL[papel]}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {contexto.hasOrganizationContext && pode("configuracoes.gerenciar") ? (
                      <DropdownMenuItem asChild>
                        <Link to="/configuracoes" className="cursor-pointer text-xs">
                          <Settings className="size-3.5 mr-2" /> Configurações da agência
                        </Link>
                      </DropdownMenuItem>
                    ) : null}
                    {contexto.hasOrganizationContext && pode("configuracoes.gerenciar") ? (
                      <DropdownMenuItem asChild>
                        <Link to="/plano" className="cursor-pointer text-xs">
                          <CreditCard className="size-3.5 mr-2" /> Plano e faturas
                        </Link>
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={sair}
                      className="cursor-pointer text-xs text-destructive focus:text-destructive focus:bg-destructive/10"
                    >
                      <LogOut className="size-3.5 mr-2" /> Encerrar sessão
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Botão de saída rápida no mobile */}
                <Button
                  size="sm"
                  variant="ghost"
                  className="lg:hidden size-8 p-0 text-muted-foreground hover:text-foreground"
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

          {/* Rodapé Desktop */}
          <footer className="border-t border-border/60 py-4 px-4 text-center text-xs text-muted-foreground hidden lg:block">
            <p>
              Já — Gestão de Equipes e Pagamentos • Desenvolvido e operado pela{" "}
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

        {/* Barra de Navegação Inferior para Dispositivos Móveis */}
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

          {/* Botão 'Menu' que abre a gaveta de navegação completa */}
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
                      Já
                      <span className="text-[10px] font-normal text-muted-foreground">
                        por Swali
                      </span>
                    </SheetTitle>
                    <p className="text-xs text-muted-foreground">
                      {temContextoPlataforma
                        ? "Plataforma Já"
                        : (sessao?.empresa?.nome ?? "Gestão de Equipes e Pagamentos")}
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
                {itensPorCategoria.map((grupo) => (
                  <div key={grupo.categoria} className="space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {grupo.titulo}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {grupo.itens.map((item) => {
                        const ativo =
                          pathname === item.to ||
                          (item.to !== "/painel" && pathname.startsWith(item.to));
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
                  </div>
                ))}

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
                    Já é uma plataforma corporativa da{" "}
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
    </TooltipProvider>
  );
}
