import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingBloco } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSessao } from "@/hooks/use-sessao";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { moeda } from "@/lib/dominio";
import { RECURSOS_PLANO, temRecurso } from "@/lib/cobranca-v2";
import { revisarCadastroFiscal } from "@/lib/fiscal.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Administração PayCrew" },
      {
        name: "description",
        content:
          "Gestão das agências assinantes: planos, períodos de teste, cupons, bloqueios e receita da plataforma.",
      },
      { property: "og:title", content: "Administração PayCrew" },
      {
        property: "og:description",
        content: "Planos, trials, cupons, bloqueios e receita da plataforma.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Admin,
});

const numero = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

function Admin() {
  const { ehAdminMaster, isPending } = useSessao();

  if (isPending) {
    return (
      <AppShell titulo="Administração PayCrew">
        <LoadingBloco />
      </AppShell>
    );
  }

  if (!ehAdminMaster) {
    return (
      <AppShell titulo="Administração PayCrew">
        <EmptyState
          titulo="Área restrita"
          descricao="Somente a administração da PayCrew tem acesso a esta página."
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      titulo="Administração PayCrew"
      descricao="Agências, planos, cupons e receita da plataforma"
    >
      <Tabs defaultValue="agencias">
        <TabsList>
          <TabsTrigger value="agencias">Agências</TabsTrigger>
          <TabsTrigger value="planos">Planos</TabsTrigger>
          <TabsTrigger value="cupons">Cupons</TabsTrigger>
          <TabsTrigger value="receita">Receita</TabsTrigger>
          <TabsTrigger value="equipe">Equipe</TabsTrigger>
        </TabsList>

        <TabsContent value="agencias" className="mt-4">
          <Agencias />
        </TabsContent>
        <TabsContent value="planos" className="mt-4">
          <Planos />
        </TabsContent>
        <TabsContent value="cupons" className="mt-4">
          <Cupons />
        </TabsContent>
        <TabsContent value="receita" className="mt-4">
          <Receita />
        </TabsContent>
        <TabsContent value="equipe" className="mt-4">
          <Equipe />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function Agencias() {
  const queryClient = useQueryClient();
  const revisarFiscalFn = useServerFn(revisarCadastroFiscal);

  const q = useQuery({
    queryKey: ["admin", "agencias"],
    queryFn: async () => {
      const [empresas, assinaturas, planos] = await Promise.all([
        supabase.from("empresas").select("*").order("criado_em", { ascending: false }),
        supabase.from("assinaturas").select("*"),
        supabase.from("planos").select("*").order("ordem"),
      ]);
      if (empresas.error) throw empresas.error;
      if (assinaturas.error) throw assinaturas.error;
      if (planos.error) throw planos.error;
      const usos = await Promise.all(empresas.data.map(async (empresa) => {
        const resultado = await supabase.rpc("resumo_uso_empresa", { _empresa_id: empresa.id });
        return [empresa.id, resultado.data?.[0] ?? null] as const;
      }));
      return {
        empresas: empresas.data,
        assinaturas: assinaturas.data,
        planos: planos.data,
        usos: new Map(usos),
      };
    },
  });

  const salvarAssinatura = useMutation({
    mutationFn: async ({
      empresaId,
      patch,
    }: {
      empresaId: string;
      patch: Record<string, unknown>;
    }) => {
      const { error } = await supabase
        .from("assinaturas")
        .upsert({ empresa_id: empresaId, ...patch }, { onConflict: "empresa_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Assinatura atualizada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alternarAtiva = useMutation({
    mutationFn: async ({ id, ativa }: { id: string; ativa: boolean }) => {
      const { error } = await supabase.from("empresas").update({ ativa }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Situação da agência atualizada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revisarFiscal = useMutation({
    mutationFn: ({ empresaId, decisao }: { empresaId: string; decisao: "validado" | "rejeitado" }) =>
      revisarFiscalFn({ data: { empresaId, decisao } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "agencias"] });
      toast.success("Cadastro fiscal revisado.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (q.isPending) return <LoadingBloco />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data.empresas.length === 0)
    return <EmptyState titulo="Nenhuma agência" descricao="Ainda não há agências cadastradas." />;

  return (
    <ul className="space-y-3">
      {q.data.empresas.map((e) => {
        const a = q.data.assinaturas.find((x) => x.empresa_id === e.id);
        const uso = q.data.usos.get(e.id);
        return (
          <li key={e.id} className="rounded-md border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{e.nome}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {e.cnpj} · {a?.status ?? "sem assinatura"}
                  {a?.trial_ate ? ` · teste até ${a.trial_ate}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Fiscal: {e.fiscal_status} · {[e.razao_social, e.municipio, e.uf].filter(Boolean).join(" · ") || "dados incompletos"}
                </p>
                {uso ? <p className="mt-1 text-xs text-muted-foreground">Ciclo atual: {uso.participacoes_usadas} participações · {uso.participacoes_excedentes} excedentes · {uso.clt_ativos} CLT ativos</p> : null}
              </div>
              <label className="flex items-center gap-2 text-xs">
                Ativa
                <Switch
                  checked={e.ativa}
                  onCheckedChange={(v) => alternarAtiva.mutate({ id: e.id, ativa: v })}
                />
              </label>
              {e.fiscal_status === "pendente" ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={revisarFiscal.isPending} onClick={() => revisarFiscal.mutate({ empresaId: e.id, decisao: "rejeitado" })}>Rejeitar fiscal</Button>
                  <Button size="sm" disabled={revisarFiscal.isPending} onClick={() => revisarFiscal.mutate({ empresaId: e.id, decisao: "validado" })}>Validar fiscal</Button>
                </div>
              ) : null}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Plano</Label>
                <Select
                  value={a?.plano_id ?? ""}
                  onValueChange={(v) =>
                    salvarAssinatura.mutate({ empresaId: e.id, patch: { plano_id: v } })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {q.data.planos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Teste grátis até</Label>
                <Input
                  type="date"
                  defaultValue={a?.trial_ate ?? ""}
                  onBlur={(ev) =>
                    salvarAssinatura.mutate({
                      empresaId: e.id,
                      patch: { trial_ate: ev.target.value || null },
                    })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label>Mensalidade própria (R$)</Label>
                <Input
                  inputMode="decimal"
                  placeholder="usar do plano"
                  defaultValue={a?.mensalidade_override ?? ""}
                  onBlur={(ev) =>
                    salvarAssinatura.mutate({
                      empresaId: e.id,
                      patch: {
                        mensalidade_override: ev.target.value ? numero(ev.target.value) : null,
                      },
                    })
                  }
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Planos() {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState("");

  const q = useQuery({
    queryKey: ["admin", "planos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("planos").select("*").order("ordem");
      if (error) throw error;
      return data;
    },
  });

  const salvar = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Database["public"]["Tables"]["planos"]["Update"];
    }) => {
      const { error } = await supabase.from("planos").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Plano atualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criar = useMutation({
    mutationFn: async () => {
      if (nome.trim().length < 2) throw new Error("Dê um nome ao plano.");
      const { error } = await supabase.from("planos").insert({ nome: nome.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setNome("");
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Plano criado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isPending) return <LoadingBloco />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Nome do novo plano"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <Button disabled={criar.isPending} onClick={() => criar.mutate()}>
          Criar plano
        </Button>
      </div>

      <ul className="space-y-3">
        {q.data.map((p) => (
          <li key={p.id} className="rounded-md border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium">{p.nome}</p>
              <label className="flex items-center gap-2 text-xs">
                Disponível
                <Switch
                  checked={p.ativo}
                  onCheckedChange={(v) => salvar.mutate({ id: p.id, patch: { ativo: v } })}
                />
              </label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-1.5">
                <Label>Mensalidade (R$)</Label>
                <Input
                  inputMode="decimal"
                  defaultValue={String(p.mensalidade)}
                  onBlur={(e) =>
                    salvar.mutate({ id: p.id, patch: { mensalidade: numero(e.target.value) } })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Dias de teste</Label>
                <Input
                  inputMode="numeric"
                  defaultValue={String(p.dias_trial)}
                  onBlur={(e) =>
                    salvar.mutate({
                      id: p.id,
                      patch: { dias_trial: Math.trunc(numero(e.target.value)) },
                    })
                  }
                />
              </div>
              {([
                ["participacoes_incluidas", "Participações incluídas"], ["valor_excedente", "Excedente por participação (R$)"],
                ["limite_eventos_ciclo", "Eventos por ciclo"], ["limite_pessoas_evento", "Pessoas por evento"],
                ["limite_clt", "CLT ativos"], ["limite_supervisores", "Supervisores"],
                ["retencao_evidencias_dias", "Retenção de evidências (dias)"], ["aviso_vendas_acima", "Avisar vendas acima de"],
              ] as const).map(([campo, label]) => <div key={campo} className="space-y-1.5"><Label>{label}</Label><Input type="number" min={0} step={campo === "valor_excedente" ? "0.01" : "1"} placeholder="Sem limite" defaultValue={p[campo] ?? ""} onBlur={e => {
                const nullable = campo !== "participacoes_incluidas" && campo !== "valor_excedente";
                const valor = e.target.value === "" && nullable ? null : Number(e.target.value);
                if (valor !== null && (!Number.isFinite(valor) || valor < 0 || (campo !== "valor_excedente" && !Number.isInteger(valor)))) { toast.error("Valor inválido."); return; }
                salvar.mutate({ id: p.id, patch: { [campo]: valor } });
              }} /></div>)}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{RECURSOS_PLANO.map(r => <label key={r.chave} className="flex items-center justify-between gap-3 text-xs">{r.rotulo}<Switch checked={temRecurso(p.recursos, r.chave)} onCheckedChange={v => salvar.mutate({ id: p.id, patch: { recursos: { ...(p.recursos as Record<string, boolean>), [r.chave]: v } } })} /></label>)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Cupons() {
  const queryClient = useQueryClient();
  const [codigo, setCodigo] = useState("");
  const [tipo, setTipo] = useState("percentual");
  const [valor, setValor] = useState("");
  const [validade, setValidade] = useState("");

  const q = useQuery({
    queryKey: ["admin", "cupons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cupons")
        .select("*")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      if (codigo.trim().length < 3) throw new Error("Informe um código.");
      const { error } = await supabase.from("cupons").insert({
        codigo: codigo.trim().toUpperCase(),
        tipo,
        valor: numero(valor),
        validade: validade || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setCodigo("");
      setValor("");
      setValidade("");
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Cupom criado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alternar = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("cupons").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <section className="grid gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-5">
        <div className="space-y-1.5">
          <Label>Código</Label>
          <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percentual">Desconto em %</SelectItem>
              <SelectItem value="valor">Desconto em R$</SelectItem>
              <SelectItem value="isencao">Isenção total</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Valor</Label>
          <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Validade</Label>
          <Input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button className="w-full" disabled={criar.isPending} onClick={() => criar.mutate()}>
            Criar cupom
          </Button>
        </div>
      </section>

      {q.isPending ? (
        <LoadingBloco />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState titulo="Nenhum cupom" descricao="Crie um cupom para liberar desconto." />
      ) : (
        <ul className="space-y-2">
          {q.data.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.codigo}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.tipo} · {c.valor} · usos {c.usos}
                  {c.validade ? ` · até ${c.validade}` : ""}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs">
                Ativo
                <Switch
                  checked={c.ativo}
                  onCheckedChange={(v) => alternar.mutate({ id: c.id, ativo: v })}
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Receita() {
  const q = useQuery({ queryKey: ["admin", "receita-v2"], queryFn: async () => {
    const [faturas, custos, assinaturas, historico, planos] = await Promise.all([
      supabase.from("faturas_plataforma").select("*, empresas(nome)").order("ciclo_inicio", { ascending: false }),
      supabase.from("custos_meio_pagamento").select("custo"),
      supabase.from("assinaturas").select("plano_id, mensalidade_override, status"),
      supabase.from("assinaturas_historico").select("empresa_id, plano_anterior_id, plano_novo_id"),
      supabase.from("planos").select("id, codigo, mensalidade"),
    ]);
    for (const r of [faturas, custos, assinaturas, historico, planos]) if (r.error) throw r.error;
    return { faturas: faturas.data ?? [], custos: custos.data ?? [], assinaturas: assinaturas.data ?? [], historico: historico.data ?? [], planos: planos.data ?? [] };
  }});
  if (q.isPending) return <LoadingBloco />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const pagas = q.data.faturas.filter(f => f.status === "paga");
  const receita = pagas.reduce((s,f) => s + Number(f.total),0);
  const variavel = pagas.reduce((s,f) => s + Number(f.valor_excedente_total),0);
  const mrr = q.data.assinaturas.filter(a => a.status === "ativa").reduce((s,a) => s + Number(a.mensalidade_override ?? q.data.planos.find(p => p.id === a.plano_id)?.mensalidade ?? 0),0);
  const free = q.data.planos.find(p => p.codigo === "free")?.id;
  const convertidas = new Set(q.data.historico.filter(h => h.plano_anterior_id === free && h.plano_novo_id && h.plano_novo_id !== free).map(h => h.empresa_id)).size;
  return <div className="space-y-5"><dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{[["MRR contratado",moeda(mrr)],["SaaS recebido",moeda(receita)],["Excedentes brutos recebidos",moeda(variavel)],["Conversões Free → pago",String(convertidas)]].map(([label,v]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 text-xl font-semibold">{v}</dd></div>)}</dl><p className="text-sm text-muted-foreground">Custos do gateway: {moeda(q.data.custos.reduce((s,c) => s + Number(c.custo),0))} · Recursos de trabalhadores não entram na receita SaaS.</p><ul className="divide-y divide-border">{q.data.faturas.map(f => <li key={f.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><span>{f.empresas?.nome ?? "—"} · {f.plano_nome}</span><span>{moeda(f.total)} · {f.participacoes_usadas} participações · {f.status}</span></li>)}</ul><TaxasPagamento /></div>;
}
function TaxasPagamento() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "taxas-meio"], queryFn: async () => { const r = await supabase.from("taxas_meio_pagamento").select("*").order("rotulo"); if (r.error) throw r.error; return r.data; } });
  const salvar = useMutation({ mutationFn: async ({ id, taxa }: {id: string; taxa: number}) => { if (!Number.isFinite(taxa) || taxa < 0 || taxa >= 1) throw new Error("Taxa inválida."); const r = await supabase.from("taxas_meio_pagamento").update({taxa}).eq("id",id); if (r.error) throw r.error; }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "taxas-meio"] }); toast.success("Custo atualizado."); }, onError: (e: Error) => toast.error(e.message) });
  return <section className="border-t border-border pt-5"><h2 className="font-semibold">Custos do meio de pagamento</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{q.data?.map(t => <div key={t.id}><Label>{t.rotulo} (%)</Label><Input type="number" min={0} max={99.99} step="0.01" defaultValue={(t.taxa*100).toFixed(2)} onBlur={e => salvar.mutate({id:t.id,taxa:Number(e.target.value)/100})} /></div>)}</div></section>;
}

function Equipe() {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [papel, setPapel] = useState("suporte");

  const q = useQuery({
    queryKey: ["admin", "equipe"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plataforma_usuarios")
        .select("*, usuarios(nome, email)");
      if (error) throw error;
      return data;
    },
  });

  const adicionar = useMutation({
    mutationFn: async () => {
      if (!userId.trim()) throw new Error("Informe o identificador do usuário.");
      const { error } = await supabase
        .from("plataforma_usuarios")
        .insert({ user_id: userId.trim(), papel: papel as "admin_master" | "suporte" });
      if (error) throw error;
    },
    onSuccess: () => {
      setUserId("");
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Pessoa adicionada à equipe PayCrew.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("plataforma_usuarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <section className="grid gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Identificador do usuário</Label>
          <Input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="cole aqui o id da conta"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Papel</Label>
          <Select value={papel} onValueChange={setPapel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="suporte">Suporte</SelectItem>
              <SelectItem value="admin_master">Administração</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Button disabled={adicionar.isPending} onClick={() => adicionar.mutate()}>
            Adicionar
          </Button>
        </div>
      </section>

      {q.isPending ? (
        <LoadingBloco />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <ul className="space-y-2">
          {q.data.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-2 text-sm"
            >
              <span className="truncate">
                {(m.usuarios as { nome?: string; email?: string } | null)?.email ?? m.user_id} ·{" "}
                {m.papel}
              </span>
              <Button size="sm" variant="ghost" onClick={() => remover.mutate(m.id)}>
                Remover
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
