import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Image, Plus, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useSessao } from "@/hooks/use-sessao";
import {
  decidirPonto as decidirPontoSeguro,
  lancarPontoManual,
} from "@/lib/operacao.functions";
import {
  hora,
  ROTULO_METODO,
  ROTULO_TIPO_PONTO,
  type TipoPonto,
} from "@/lib/dominio";

export const Route = createFileRoute("/_authenticated/operacao/$eventoId")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Ponto da equipe — PayCrew" },
      {
        name: "description",
        content:
          "Aprove ou recuse os registros de ponto, lance ponto manual e registre ocorrências da equipe em campo.",
      },
      { property: "og:title", content: "Ponto da equipe — PayCrew" },
      {
        property: "og:description",
        content: "Conferência de presença e ponto durante o evento.",
      },
    ],
  }),
  component: OperacaoEvento,
});

const TIPOS: TipoPonto[] = ["entrada", "inicio_intervalo", "fim_intervalo", "saida"];

function OperacaoEvento() {
  const { eventoId } = Route.useParams();
  const queryClient = useQueryClient();
  const { sessao } = useSessao();
  const [fotoAberta, setFotoAberta] = useState<{
    url: string;
    nome: string;
    registradoEm: string;
  } | null>(null);
  const [manual, setManual] = useState<{ escalaId: string; nome: string } | null>(null);
  const [recusando, setRecusando] = useState<{ pontoId: string; escalaId: string } | null>(null);
  const [ocorrencia, setOcorrencia] = useState<{ escalaId: string; nome: string } | null>(
    null,
  );
  const decidirFn = useServerFn(decidirPontoSeguro);

  const evento = useQuery({
    queryKey: ["evento", eventoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eventos")
        .select("id, nome, status, local")
        .eq("id", eventoId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Evento não encontrado.");
      return data;
    },
  });

  const equipes = useQuery({
    queryKey: ["operacao", eventoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipes")
        .select(
          "id, nome, escalas(id, status, freelancers(nome, funcao), pontos(id, tipo, metodo, registrado_em, status, foto_url, gps_lat, gps_lng, fora_horario, motivo_recusa, selfie_expira_em), ocorrencias(id, descricao, criado_em))",
        )
        .eq("evento_id", eventoId)
        .order("criado_em");
      if (error) throw error;
      return data;
    },
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["operacao", eventoId] });
    queryClient.invalidateQueries({ queryKey: ["painel"] });
  };

  const decidirPonto = useMutation({
    mutationFn: async ({
      pontoId,
      escalaId,
      status,
      motivo,
    }: {
      pontoId: string;
      escalaId: string;
      status: "aprovado" | "recusado";
      motivo?: string;
    }) => {
      await decidirFn({ data: { pontoId, escalaId, status, motivo } });
    },
    onSuccess: () => {
      invalidar();
      setRecusando(null);
      toast.success("Decisão registrada no histórico.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function abrirFoto(
    caminho: string,
    nome: string,
    registradoEm: string,
  ) {
    const { data, error } = await supabase.storage
      .from("selfies-ponto")
      .createSignedUrl(caminho, 300);
    if (error) {
      toast.error("Não foi possível abrir a foto deste ponto.");
      return;
    }
    setFotoAberta({ url: data.signedUrl, nome, registradoEm });
  }

  if (evento.isPending) {
    return (
      <AppShell titulo="Operação">
        <LoadingBloco />
      </AppShell>
    );
  }
  if (evento.isError) {
    return (
      <AppShell titulo="Operação">
        <ErrorState error={evento.error} onRetry={() => evento.refetch()} />
      </AppShell>
    );
  }

  return (
    <AppShell
      titulo={evento.data.nome}
      descricao={`Ponto e ocorrências${evento.data.local ? ` · ${evento.data.local}` : ""}`}
      acoes={<StatusBadge status={evento.data.status} />}
    >
      {equipes.isPending ? (
        <LoadingBloco />
      ) : equipes.isError ? (
        <ErrorState error={equipes.error} onRetry={() => equipes.refetch()} />
      ) : equipes.data.length === 0 ? (
        <EmptyState
          titulo="Sem equipes"
          descricao="Monte a equipe e a escala na tela do evento."
        />
      ) : (
        <div className="space-y-4">
          {equipes.data.map((q) => (
            <section key={q.id} className="rounded-md border border-border bg-card">
              <h2 className="border-b border-border px-4 py-2 text-sm font-semibold">
                {q.nome}
              </h2>
              <ul className="divide-y divide-border">
                {q.escalas
                  .filter((es) => es.status !== "substituido" && es.status !== "recusado")
                  .map((es) => (
                    <li key={es.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {es.freelancers?.nome}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {es.freelancers?.funcao ?? "sem função definida"}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={es.status} />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setManual({
                                escalaId: es.id,
                                nome: es.freelancers?.nome ?? "",
                              })
                            }
                          >
                            <Plus className="size-4" /> Ponto manual
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setOcorrencia({
                                escalaId: es.id,
                                nome: es.freelancers?.nome ?? "",
                              })
                            }
                          >
                            Ocorrência
                          </Button>
                        </div>
                      </div>

                      {es.pontos.length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {[...es.pontos]
                            .sort(
                              (a, b) =>
                                new Date(a.registrado_em).getTime() -
                                new Date(b.registrado_em).getTime(),
                            )
                            .map((p) => (
                              <li
                                key={p.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-muted/50 px-2 py-1.5 text-xs"
                              >
                                <span className="font-medium">
                                  {ROTULO_TIPO_PONTO[p.tipo]}{" "}
                                  <span className="font-normal text-muted-foreground">
                                    {hora(p.registrado_em)} · {ROTULO_METODO[p.metodo]}
                                  </span>
                                  {p.fora_horario ? (
                                    <span className="ml-1 rounded-sm bg-status-pendente px-1.5 py-0.5 text-status-pendente-foreground">
                                      Fora do horário
                                    </span>
                                  ) : null}
                                  {p.gps_lat != null && p.gps_lng != null ? (
                                    <a
                                      className="ml-1 text-primary underline"
                                      href={`https://www.google.com/maps?q=${p.gps_lat},${p.gps_lng}`}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Ver localização
                                    </a>
                                  ) : null}
                                  {p.motivo_recusa ? (
                                    <span className="block font-normal text-destructive">Motivo: {p.motivo_recusa}</span>
                                  ) : null}
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <StatusBadge status={p.status} />
                                  {p.foto_url ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7"
                                      title="Ver foto do registro de ponto"
                                      onClick={() =>
                                        void abrirFoto(
                                          p.foto_url!,
                                          es.freelancers?.nome ?? "Colaborador",
                                          p.registrado_em,
                                        )
                                      }
                                    >
                                      <Image className="size-3.5" /> Foto
                                    </Button>
                                  ) : null}
                                  {p.status === "pendente" ? (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7"
                                        onClick={() =>
                                          decidirPonto.mutate({
                                            pontoId: p.id,
                                            escalaId: es.id,
                                            status: "aprovado",
                                          })
                                        }
                                      >
                                        <Check className="size-3.5" /> Aprovar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7"
                                        title="Recusar ponto"
                                        onClick={() => setRecusando({ pontoId: p.id, escalaId: es.id })}
                                      >
                                        <X className="size-3.5" />
                                      </Button>
                                    </>
                                  ) : null}
                                </span>
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Nenhum ponto registrado.
                        </p>
                      )}

                      {es.ocorrencias.length > 0 ? (
                        <ul className="mt-2 space-y-1">
                          {es.ocorrencias.map((o) => (
                            <li
                              key={o.id}
                              className="rounded-sm border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground"
                            >
                              {o.descricao}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Dialog open={Boolean(manual)} onOpenChange={(o) => !o && setManual(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ponto manual — {manual?.nome}</DialogTitle>
          </DialogHeader>
          {manual ? (
            <FormPontoManual
              escalaId={manual.escalaId}
              onFechar={() => setManual(null)}
              onSalvo={invalidar}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(recusando)} onOpenChange={(o) => !o && setRecusando(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Recusar ponto</DialogTitle></DialogHeader>
          {recusando ? (
            <FormRecusa
              onCancelar={() => setRecusando(null)}
              onConfirmar={(motivo) => decidirPonto.mutate({ ...recusando, status: "recusado", motivo })}
              salvando={decidirPonto.isPending}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(ocorrencia)} onOpenChange={(o) => !o && setOcorrencia(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ocorrência — {ocorrencia?.nome}</DialogTitle>
          </DialogHeader>
          {ocorrencia ? (
            <FormOcorrencia
              escalaId={ocorrencia.escalaId}
              usuarioId={sessao?.usuario.id ?? null}
              onFechar={() => setOcorrencia(null)}
              onSalvo={invalidar}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(fotoAberta)} onOpenChange={(o) => !o && setFotoAberta(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Foto do ponto — {fotoAberta?.nome}</DialogTitle>
          </DialogHeader>
          {fotoAberta ? (
            <div className="space-y-3">
              <img
                src={fotoAberta.url}
                alt={`Registro de ponto de ${fotoAberta.nome}`}
                className="max-h-[65vh] w-full rounded-md border border-border object-contain"
              />
              <p className="text-xs text-muted-foreground">
                Registrada em {new Date(fotoAberta.registradoEm).toLocaleString("pt-BR")}.
                A foto é evidência do ponto e não compõe o cálculo da folha.
              </p>
              <Button asChild variant="outline">
                <a href={fotoAberta.url} download>Baixar evidência</a>
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function FormPontoManual({
  escalaId,
  onFechar,
  onSalvo,
}: {
  escalaId: string;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const lancarFn = useServerFn(lancarPontoManual);
  const [tipo, setTipo] = useState<TipoPonto>("entrada");
  const [quando, setQuando] = useState(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16),
  );

  const salvar = useMutation({
    mutationFn: async () => {
      await lancarFn({ data: { escalaId, tipo, registradoEm: new Date(quando).toISOString() } });
    },
    onSuccess: () => {
      toast.success("Ponto lançado.");
      onSalvo();
      onFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="pm-tipo">Tipo</Label>
        <Select value={tipo} onValueChange={(v) => setTipo(v as TipoPonto)}>
          <SelectTrigger id="pm-tipo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIPOS.map((t) => (
              <SelectItem key={t} value={t}>
                {ROTULO_TIPO_PONTO[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pm-quando">Data e hora</Label>
        <input
          id="pm-quando"
          type="datetime-local"
          required
          value={quando}
          onChange={(e) => setQuando(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Lançamento manual entra já aprovado, sob responsabilidade do supervisor.
      </p>
      <DialogFooter>
        <Button type="submit" disabled={salvar.isPending}>
          Lançar ponto
        </Button>
      </DialogFooter>
    </form>
  );
}

function FormRecusa({
  onCancelar,
  onConfirmar,
  salvando,
}: {
  onCancelar: () => void;
  onConfirmar: (motivo: string) => void;
  salvando: boolean;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!motivo.trim()) return;
        onConfirmar(motivo.trim());
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="motivo-recusa">Motivo da recusa</Label>
        <Textarea id="motivo-recusa" required maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>
        <Button type="submit" variant="destructive" disabled={salvando || !motivo.trim()}>Recusar ponto</Button>
      </DialogFooter>
    </form>
  );
}

function FormOcorrencia({
  escalaId,
  usuarioId,
  onFechar,
  onSalvo,
}: {
  escalaId: string;
  usuarioId: string | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [descricao, setDescricao] = useState("");
  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ocorrencias").insert({
        escala_id: escalaId,
        registrado_por_id: usuarioId,
        descricao: descricao.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ocorrência registrada.");
      onSalvo();
      onFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="oc-desc">O que aconteceu</Label>
        <Textarea
          id="oc-desc"
          required
          rows={4}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Atraso, saída antecipada, troca de posto…"
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={salvar.isPending}>
          Registrar
        </Button>
      </DialogFooter>
    </form>
  );
}
