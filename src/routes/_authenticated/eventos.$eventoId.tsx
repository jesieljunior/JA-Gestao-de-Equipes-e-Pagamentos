import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Ban, Plus, RefreshCw, UserPlus } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  dataHora,
  moeda,
  ORDEM_STATUS_EVENTO,
  proximoStatus,
  podeCancelar,
  ROTULO_STATUS_EVENTO,
  ROTULO_TIPO_VALOR,
  validarTransicao,
  type StatusEvento,
  type TipoValor,
} from "@/lib/dominio";
import { parseValorPositivo } from "@/lib/moeda";
import { rotacionarQrEvento } from "@/lib/operacao.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/eventos/$eventoId")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Evento — Já" },
      {
        name: "description",
        content:
          "Equipe, escala, confirmações, QR Code de ponto e avanço do ciclo do evento na sua agência.",
      },
      { property: "og:title", content: "Evento — Já" },
      {
        property: "og:description",
        content: "Gerencie equipe, escala e o ciclo do evento.",
      },
    ],
  }),
  component: DetalheEvento,
});

function useEvento(eventoId: string) {
  return useQuery({
    queryKey: ["evento", eventoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eventos")
        .select("*, clientes(nome)")
        .eq("id", eventoId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Evento não encontrado.");
      return data;
    },
  });
}

function useEquipes(eventoId: string) {
  return useQuery({
    queryKey: ["equipes", eventoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipes")
        .select("*, usuarios(nome), escalas(*, freelancers(id, nome, funcao, chave_pix))")
        .eq("evento_id", eventoId)
        .order("criado_em");
      if (error) throw error;
      return data;
    },
  });
}

function Stepper({ atual }: { atual: StatusEvento }) {
  if (atual === "cancelado") return <StatusBadge status="cancelado" />;
  const idx = ORDEM_STATUS_EVENTO.indexOf(atual);
  return (
    <ol className="flex flex-wrap gap-1.5">
      {ORDEM_STATUS_EVENTO.map((s, i) => (
        <li
          key={s}
          className={cn(
            "rounded-sm px-1.5 py-0.5 text-xs",
            i < idx && "bg-muted text-muted-foreground",
            i === idx && "bg-primary text-primary-foreground font-medium",
            i > idx && "border border-dashed border-border text-muted-foreground",
          )}
        >
          {ROTULO_STATUS_EVENTO[s]}
        </li>
      ))}
    </ol>
  );
}

function FormEquipe({ eventoId, onFechar }: { eventoId: string; onFechar: () => void }) {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState("");
  const [supervisorId, setSupervisorId] = useState("");

  const usuarios = useQuery({
    queryKey: ["usuarios"],
    queryFn: async () => {
      const { data, error } = await supabase.from("usuarios").select("id, nome").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("equipes").insert({
        evento_id: eventoId,
        nome: nome.trim(),
        supervisor_id: supervisorId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipes", eventoId] });
      toast.success("Equipe criada.");
      onFechar();
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
        <Label htmlFor="q-nome">Nome da equipe</Label>
        <Input
          id="q-nome"
          required
          placeholder="Bar, recepção, montagem…"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="q-sup">Supervisor</Label>
        <Select value={supervisorId} onValueChange={setSupervisorId}>
          <SelectTrigger id="q-sup">
            <SelectValue placeholder="Sem supervisor" />
          </SelectTrigger>
          <SelectContent>
            {(usuarios.data ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={criar.isPending}>
          Criar equipe
        </Button>
      </DialogFooter>
    </form>
  );
}

function FormEscala({
  eventoId,
  equipeId,
  substituindo,
  onFechar,
}: {
  eventoId: string;
  equipeId: string;
  substituindo?: { id: string; valor: number; tipo: TipoValor };
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [freelancerId, setFreelancerId] = useState("");
  const [valor, setValor] = useState(String(substituindo?.valor ?? ""));
  const [tipo, setTipo] = useState<TipoValor>(substituindo?.tipo ?? "diaria");

  const freelancers = useQuery({
    queryKey: ["freelancers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("freelancers")
        .select("*")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      const valorNumerico = parseValorPositivo(valor);
      const { data, error } = await supabase
        .from("escalas")
        .insert({
          equipe_id: equipeId,
          freelancer_id: freelancerId,
          valor_combinado: valorNumerico,
          tipo_valor: tipo,
          status: "convidado",
          convite_enviado_em: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw error;

      if (substituindo) {
        const { error: erro2 } = await supabase
          .from("escalas")
          .update({ status: "substituido", substituido_por_id: data.id })
          .eq("id", substituindo.id);
        if (erro2) throw erro2;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipes", eventoId] });
      toast.success(substituindo ? "Substituição registrada." : "Convite enviado.");
      onFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!freelancerId) {
          toast.error("Escolha o freelancer.");
          return;
        }
        salvar.mutate();
      }}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="es-free">Freelancer</Label>
        <Select value={freelancerId} onValueChange={setFreelancerId}>
          <SelectTrigger id="es-free">
            <SelectValue placeholder="Escolher freelancer" />
          </SelectTrigger>
          <SelectContent>
            {(freelancers.data ?? []).map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.nome}
                {f.funcao ? ` — ${f.funcao}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="es-valor">Valor combinado (R$)</Label>
          <Input
            id="es-valor"
            required
            inputMode="decimal"
            placeholder="0,00"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="es-tipo">Tipo</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoValor)}>
            <SelectTrigger id="es-tipo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="diaria">Diária</SelectItem>
              <SelectItem value="hora">Por hora</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={salvar.isPending}>
          {substituindo ? "Substituir" : "Escalar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DetalheEvento() {
  const { eventoId } = Route.useParams();
  const queryClient = useQueryClient();
  const evento = useEvento(eventoId);
  const equipes = useEquipes(eventoId);
  const [novaEquipe, setNovaEquipe] = useState(false);
  const [escalando, setEscalando] = useState<string | null>(null);
  const [substituindo, setSubstituindo] = useState<{
    equipeId: string;
    id: string;
    valor: number;
    tipo: TipoValor;
  } | null>(null);
  const rotacionarFn = useServerFn(rotacionarQrEvento);

  const mudarStatus = useMutation({
    mutationFn: async (novo: StatusEvento) => {
      const atual = evento.data!.status;
      const erro = validarTransicao(atual, novo);
      if (erro) throw new Error(erro);
      const { error } = await supabase.from("eventos").update({ status: novo }).eq("id", eventoId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evento", eventoId] });
      queryClient.invalidateQueries({ queryKey: ["eventos"] });
      toast.success("Status atualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mudarEscala = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "confirmado" | "recusado" }) => {
      const { error } = await supabase
        .from("escalas")
        .update({
          status,
          confirmado_em: status === "confirmado" ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipes", eventoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rotacionarQr = useMutation({
    mutationFn: () => rotacionarFn({ data: { eventoId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evento", eventoId] });
      queryClient.invalidateQueries({ queryKey: ["painel"] });
      toast.success("Novo QR Code gerado. O código anterior deixou de funcionar.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (evento.isPending) {
    return (
      <AppShell titulo="Evento">
        <LoadingBloco />
      </AppShell>
    );
  }
  if (evento.isError) {
    return (
      <AppShell titulo="Evento">
        <ErrorState error={evento.error} onRetry={() => evento.refetch()} />
      </AppShell>
    );
  }

  const e = evento.data;
  const proximo = proximoStatus(e.status);
  const urlPonto =
    typeof window !== "undefined" ? `${window.location.origin}/ponto/${e.qr_code_token}` : "";

  return (
    <AppShell
      titulo={e.nome}
      descricao={`${dataHora(e.data_inicio)}${e.local ? ` · ${e.local}` : ""}${
        e.clientes?.nome ? ` · ${e.clientes.nome}` : ""
      }`}
      acoes={
        <div className="flex items-center gap-2">
          {proximo ? (
            <Button size="sm" onClick={() => mudarStatus.mutate(proximo)}>
              Avançar para {ROTULO_STATUS_EVENTO[proximo]}
              <ArrowRight className="size-4" />
            </Button>
          ) : null}
          {podeCancelar(e.status) ? (
            <Button size="sm" variant="outline" onClick={() => mudarStatus.mutate("cancelado")}>
              <Ban className="size-4" /> Cancelar
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusBadge status={e.status} />
        <Stepper atual={e.status} />
      </div>

      <Tabs defaultValue="equipes">
        <TabsList>
          <TabsTrigger value="equipes">Equipes e escala</TabsTrigger>
          <TabsTrigger value="ponto">QR Code de ponto</TabsTrigger>
        </TabsList>

        <TabsContent value="equipes" className="space-y-4">
          <Button size="sm" variant="outline" onClick={() => setNovaEquipe(true)}>
            <Plus className="size-4" /> Nova equipe
          </Button>

          {equipes.isPending ? (
            <LoadingBloco />
          ) : equipes.isError ? (
            <ErrorState error={equipes.error} onRetry={() => equipes.refetch()} />
          ) : equipes.data.length === 0 ? (
            <EmptyState
              titulo="Nenhuma equipe"
              descricao="Crie uma equipe para escalar os freelancers."
            />
          ) : (
            equipes.data.map((q) => (
              <section key={q.id} className="rounded-md border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold">{q.nome}</h2>
                    <p className="text-xs text-muted-foreground">
                      Supervisor: {q.usuarios?.nome ?? "não definido"}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEscalando(q.id)}>
                    <UserPlus className="size-4" /> Escalar
                  </Button>
                </div>
                {q.escalas.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Ninguém escalado nesta equipe.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {q.escalas.map((es) => (
                      <li
                        key={es.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{es.freelancers?.nome}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {moeda(es.valor_combinado)} · {ROTULO_TIPO_VALOR[es.tipo_valor]}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={es.status} />
                          {es.status === "convidado" ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  mudarEscala.mutate({ id: es.id, status: "confirmado" })
                                }
                              >
                                Confirmar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  mudarEscala.mutate({ id: es.id, status: "recusado" })
                                }
                              >
                                Recusar
                              </Button>
                            </>
                          ) : null}
                          {es.status === "recusado" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setSubstituindo({
                                  equipeId: q.id,
                                  id: es.id,
                                  valor: Number(es.valor_combinado),
                                  tipo: es.tipo_valor,
                                })
                              }
                            >
                              Substituir
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))
          )}
        </TabsContent>

        <TabsContent value="ponto">
          <div className="flex flex-col items-start gap-4 rounded-md border border-border bg-card p-4 sm:flex-row sm:items-center">
            <div className="rounded-md bg-white p-3">
              {urlPonto ? <QRCodeSVG value={urlPonto} size={148} /> : null}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">QR Code de ponto deste evento</p>
              <p className="mt-1 text-sm text-muted-foreground">
                A equipe registra entrada, intervalo e saída lendo este código e informando o CPF.
              </p>
              <p className="mt-2 break-all text-xs text-muted-foreground">{urlPonto}</p>
              {e.qr_code_expira_em ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Válido até {dataHora(e.qr_code_expira_em)}.
                </p>
              ) : null}
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(urlPonto);
                    toast.success("Link copiado.");
                  }}
                >
                  Copiar link
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/operacao/$eventoId" params={{ eventoId }}>
                    Painel de operação
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={rotacionarQr.isPending}
                  onClick={() => rotacionarQr.mutate()}
                >
                  <RefreshCw className="size-4" /> Trocar QR
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={novaEquipe} onOpenChange={setNovaEquipe}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova equipe</DialogTitle>
          </DialogHeader>
          <FormEquipe eventoId={eventoId} onFechar={() => setNovaEquipe(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(escalando)} onOpenChange={(o) => !o && setEscalando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escalar freelancer</DialogTitle>
          </DialogHeader>
          {escalando ? (
            <FormEscala
              eventoId={eventoId}
              equipeId={escalando}
              onFechar={() => setEscalando(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(substituindo)} onOpenChange={(o) => !o && setSubstituindo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Substituir freelancer</DialogTitle>
          </DialogHeader>
          {substituindo ? (
            <FormEscala
              eventoId={eventoId}
              equipeId={substituindo.equipeId}
              substituindo={substituindo}
              onFechar={() => setSubstituindo(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
