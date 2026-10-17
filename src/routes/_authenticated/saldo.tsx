import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, RefreshCw, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingBloco } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSessao } from "@/hooks/use-sessao";
import { supabase } from "@/integrations/supabase/client";
import { dataHora, moeda } from "@/lib/dominio";
import { sincronizarCobranca } from "@/lib/financeiro.functions";
import { parseValorPositivo } from "@/lib/moeda";
import { iniciarRecarga } from "@/lib/saldo.functions";

export const Route = createFileRoute("/_authenticated/saldo")({
  head: () => ({
    meta: [
      { title: "Saldo da agência — PayCrew" },
      {
        name: "description",
        content:
          "Adicione saldo por Pix, cartão ou boleto e acompanhe as recargas usadas para pagar a equipe.",
      },
      { property: "og:title", content: "Saldo da agência — PayCrew" },
      {
        property: "og:description",
        content: "Recarregue o saldo por Pix, cartão ou boleto quando quiser.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Saldo,
});

const ATALHOS = [500, 1000, 2500, 5000];

type Forma = "pix" | "cartao" | "boleto";

function Saldo() {
  const { empresaId } = useSessao();
  const queryClient = useQueryClient();
  const chamarRecarga = useServerFn(iniciarRecarga);
  const chamarSincronizar = useServerFn(sincronizarCobranca);

  const [valor, setValor] = useState("");
  const [forma, setForma] = useState<Forma>("pix");
  const [resultado, setResultado] = useState<{
    link: string | null;
    pixCopiaCola: string | null;
    pixImagem: string | null;
  } | null>(null);

  const saldo = useQuery({
    queryKey: ["saldo", "total", empresaId],
    enabled: Boolean(empresaId),
    queryFn: async () => {
      if (!empresaId) throw new Error("Agência não encontrada.");
      const { data, error } = await supabase.rpc("saldo_empresa", {
        _empresa_id: empresaId,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  const recargas = useQuery({
    queryKey: ["saldo", "recargas", empresaId],
    enabled: Boolean(empresaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cobrancas")
        .select("*")
        .eq("empresa_id", empresaId!)
        .eq("tipo", "aporte_agencia")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["saldo"] });
    queryClient.invalidateQueries({ queryKey: ["financeiro"] });
    queryClient.invalidateQueries({ queryKey: ["painel"] });
  };

  const recarregar = useMutation({
    mutationFn: async () => {
      const numero = parseValorPositivo(valor);
      if (numero < 5) throw new Error("Informe um valor de pelo menos R$ 5,00.");
      return chamarRecarga({ data: { valor: numero, forma } });
    },
    onSuccess: (r) => {
      setResultado({
        link: r.link,
        pixCopiaCola: r.pixCopiaCola,
        pixImagem: r.pixImagem,
      });
      setValor("");
      toast.success("Recarga criada. Conclua o pagamento para liberar o saldo.");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const conferir = useMutation({
    mutationFn: (id: string) => chamarSincronizar({ data: { id } }),
    onSuccess: (r) => {
      toast.success(
        r.status === "pago" ? "Pagamento confirmado, saldo liberado." : `Status: ${r.status}`,
      );
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copiar = async (texto: string) => {
    await navigator.clipboard.writeText(texto);
    toast.success("Copiado.");
  };

  return (
    <AppShell titulo="Saldo" descricao="Coloque dinheiro na conta da agência para pagar a equipe">
      <div className="mb-4 flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3">
        <Wallet className="size-5 text-muted-foreground" />
        <div>
          <p className="text-xs text-muted-foreground">Saldo disponível</p>
          <p className="tabular-nums text-xl font-semibold">{moeda(saldo.data ?? 0)}</p>
        </div>
      </div>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Adicionar saldo</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Você escolhe o valor. O saldo entra assim que o pagamento é confirmado.
        </p>

        <div className="mb-3 flex flex-wrap gap-2">
          {ATALHOS.map((v) => (
            <Button
              key={v}
              size="sm"
              variant="outline"
              type="button"
              onClick={() => setValor(String(v))}
            >
              {moeda(v)}
            </Button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="valor">Valor (R$)</Label>
            <Input
              id="valor"
              inputMode="decimal"
              placeholder="0,00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Como você quer pagar</Label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["pix", "Pix"],
                  ["cartao", "Cartão de crédito ou débito"],
                  ["boleto", "Boleto"],
                ] as [Forma, string][]
              ).map(([v, rotulo]) => (
                <Button
                  key={v}
                  type="button"
                  size="sm"
                  variant={forma === v ? "default" : "outline"}
                  onClick={() => setForma(v)}
                >
                  {rotulo}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <Button
          className="mt-4"
          disabled={recarregar.isPending}
          onClick={() => recarregar.mutate()}
        >
          Gerar pagamento
        </Button>

        {resultado ? (
          <div className="mt-4 space-y-3 rounded-md border border-border bg-background p-3">
            {resultado.pixImagem ? (
              <img
                src={`data:image/png;base64,${resultado.pixImagem}`}
                alt="QR Code Pix para adicionar saldo"
                className="size-44 rounded-md border border-border"
              />
            ) : null}
            {resultado.pixCopiaCola ? (
              <div className="flex items-center gap-2">
                <Input readOnly value={resultado.pixCopiaCola} className="text-xs" />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    if (resultado.pixCopiaCola) void copiar(resultado.pixCopiaCola);
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            ) : null}
            {resultado.link ? (
              <a
                className="inline-block text-sm underline underline-offset-4"
                href={resultado.link}
                target="_blank"
                rel="noreferrer"
              >
                Abrir página de pagamento
              </a>
            ) : null}
          </div>
        ) : null}
      </section>

      <h2 className="mb-2 mt-6 text-sm font-semibold">Recargas</h2>
      {recargas.isPending ? (
        <LoadingBloco />
      ) : recargas.isError ? (
        <ErrorState error={recargas.error} onRetry={() => recargas.refetch()} />
      ) : recargas.data.length === 0 ? (
        <EmptyState
          titulo="Nenhuma recarga ainda"
          descricao="Adicione saldo para liberar os pagamentos da equipe."
        />
      ) : (
        <ul className="space-y-2">
          {recargas.data.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{moeda(c.valor)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.forma === "pix" ? "Pix" : c.forma === "boleto" ? "Boleto" : "Cartão"} ·{" "}
                  {dataHora(c.criado_em)}
                </p>
                {c.erro ? <p className="text-xs text-destructive">{c.erro}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={c.status} />
                {c.pix_copia_cola ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (c.pix_copia_cola) void copiar(c.pix_copia_cola);
                    }}
                  >
                    <Copy className="size-4" /> Pix
                  </Button>
                ) : null}
                {c.link_pagamento ? (
                  <a
                    className="text-xs underline underline-offset-4"
                    href={c.link_pagamento}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Pagar
                  </a>
                ) : null}
                {c.status !== "pago" && c.parceiro_cobranca_id ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={conferir.isPending}
                    onClick={() => conferir.mutate(c.id)}
                  >
                    <RefreshCw className="size-4" /> Já paguei
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
