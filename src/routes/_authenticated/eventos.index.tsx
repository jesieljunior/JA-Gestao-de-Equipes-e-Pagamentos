import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingBloco } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSessao } from "@/hooks/use-sessao";
import { supabase } from "@/integrations/supabase/client";
import { dataHora, ORDEM_STATUS_EVENTO, ROTULO_STATUS_EVENTO } from "@/lib/dominio";

export const Route = createFileRoute("/_authenticated/eventos/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Eventos — Já" },
      {
        name: "description",
        content:
          "Todos os eventos da agência com status do ciclo: planejamento, escala, confirmações, execução, fechamento e pagamento.",
      },
      { property: "og:title", content: "Eventos — Já" },
      {
        property: "og:description",
        content: "Acompanhe o ciclo completo de cada evento da agência.",
      },
    ],
  }),
  component: Eventos,
});

function NovoEvento({ onFechar }: { onFechar: () => void }) {
  const { empresaId } = useSessao();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [local, setLocal] = useState("");
  const [clienteId, setClienteId] = useState<string>("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");

  const clientes = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("eventos")
        .insert({
          empresa_id: empresaId!,
          cliente_id: clienteId || null,
          nome: nome.trim(),
          local: local.trim() || null,
          data_inicio: new Date(inicio).toISOString(),
          data_fim: fim ? new Date(fim).toISOString() : null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (evento) => {
      queryClient.invalidateQueries({ queryKey: ["eventos"] });
      toast.success("Evento criado.");
      onFechar();
      navigate({ to: "/eventos/$eventoId", params: { eventoId: evento.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        criar.mutate();
      }}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="e-nome">Nome do evento</Label>
        <Input id="e-nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="e-cliente">Cliente</Label>
        <Select value={clienteId} onValueChange={setClienteId}>
          <SelectTrigger id="e-cliente">
            <SelectValue placeholder="Sem cliente vinculado" />
          </SelectTrigger>
          <SelectContent>
            {(clientes.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="e-local">Local</Label>
        <Input id="e-local" value={local} onChange={(e) => setLocal(e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="e-inicio">Início</Label>
          <Input
            id="e-inicio"
            type="datetime-local"
            required
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-fim">Fim</Label>
          <Input
            id="e-fim"
            type="datetime-local"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={criar.isPending}>
          Criar evento
        </Button>
      </DialogFooter>
    </form>
  );
}

function Eventos() {
  const [novo, setNovo] = useState(false);
  const [filtro, setFiltro] = useState("todos");
  const [busca, setBusca] = useState("");

  const q = useQuery({
    queryKey: ["eventos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eventos")
        .select("*, clientes(nome)")
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const termo = busca.trim().toLowerCase();
  const lista = (q.data ?? []).filter(
    (e) =>
      (filtro === "todos" || e.status === filtro) &&
      (e.nome.toLowerCase().includes(termo) || (e.local ?? "").toLowerCase().includes(termo)),
  );

  return (
    <AppShell
      titulo="Eventos"
      descricao="Ciclo completo, do planejamento ao pagamento"
      acoes={
        <Dialog open={novo} onOpenChange={setNovo}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="size-4" /> Novo evento
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo evento</DialogTitle>
            </DialogHeader>
            <NovoEvento onFechar={() => setNovo(false)} />
          </DialogContent>
        </Dialog>
      }
    >
      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder="Buscar por nome ou local"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-sm"
        />
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {[...ORDEM_STATUS_EVENTO, "cancelado" as const].map((s) => (
              <SelectItem key={s} value={s}>
                {ROTULO_STATUS_EVENTO[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {q.isPending ? (
        <LoadingBloco />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : lista.length === 0 ? (
        <EmptyState
          titulo="Nenhum evento"
          descricao="Crie o primeiro evento para montar a equipe."
        />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-card">
          {lista.map((e) => (
            <li key={e.id}>
              <Link
                to="/eventos/$eventoId"
                params={{ eventoId: e.id }}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {dataHora(e.data_inicio)}
                    {e.local ? ` · ${e.local}` : ""}
                    {e.clientes?.nome ? ` · ${e.clientes.nome}` : ""}
                  </p>
                </div>
                <StatusBadge status={e.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
