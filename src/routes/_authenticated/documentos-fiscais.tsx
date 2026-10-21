import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, FileUp, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingBloco } from "@/components/states";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { useSessao } from "@/hooks/use-sessao";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { dataHora, moeda } from "@/lib/dominio";

type Tipo = Database["public"]["Enums"]["tipo_documento_fiscal"];
const TIPOS: Record<Tipo, string> = {
  nfse: "NFS-e (serviço)",
  nfe: "NF-e / DANFE (mercadoria)",
  rpa: "RPA",
  receipt: "Recibo",
  other: "Outro",
};
const STATUS = {
  pending: "Pendente",
  received: "Recebido",
  validated_manually: "Validado",
  rejected: "Rejeitado",
  cancelled: "Cancelado",
} as const;

export const Route = createFileRoute("/_authenticated/documentos-fiscais")({
  head: () => ({
    meta: [
      { title: "Documentos fiscais | Já" },
      {
        name: "description",
        content: "Registro e armazenamento privado de notas, DANFE, RPA e recibos da operação.",
      },
      { property: "og:title", content: "Documentos fiscais | Já" },
      {
        property: "og:description",
        content: "Arquivo privado de documentos fiscais e comprovantes da operação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DocumentosFiscais,
});

function DocumentosFiscais() {
  const { empresaId, sessao, pode } = useSessao();
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<Tipo>("nfse");
  const [numero, setNumero] = useState("");
  const [emissor, setEmissor] = useState("");
  const [valor, setValor] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);

  const q = useQuery({
    queryKey: ["documentos-fiscais", empresaId],
    enabled: Boolean(empresaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documentos_fiscais")
        .select("*")
        .eq("empresa_id", empresaId ?? "")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const salvar = useMutation({
    mutationFn: async () => {
      if (!empresaId || !sessao?.usuario.id) throw new Error("Sessão inválida.");
      if (!arquivo) throw new Error("Selecione o arquivo.");
      if (arquivo.size > 10 * 1024 * 1024) throw new Error("O arquivo deve ter até 10 MB.");
      const seguro = arquivo.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-");
      const caminho = `${empresaId}/${crypto.randomUUID()}/${seguro}`;
      const upload = await supabase.storage
        .from("documentos-fiscais")
        .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
      if (upload.error) throw upload.error;
      const { error } = await supabase.from("documentos_fiscais").insert({
        empresa_id: empresaId,
        tipo,
        status: "received",
        numero: numero || null,
        emissor_nome: emissor || null,
        competencia: competencia || null,
        valor: valor ? Number(valor.replace(",", ".")) : null,
        observacoes: observacoes || null,
        arquivo_caminho: caminho,
        arquivo_nome: arquivo.name,
        arquivo_tipo: arquivo.type || null,
        criado_por: sessao.usuario.id,
      });
      if (error) {
        await supabase.storage.from("documentos-fiscais").remove([caminho]);
        throw error;
      }
    },
    onSuccess: () => {
      setNumero("");
      setEmissor("");
      setValor("");
      setCompetencia("");
      setObservacoes("");
      setArquivo(null);
      qc.invalidateQueries({ queryKey: ["documentos-fiscais"] });
      toast.success("Documento arquivado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function baixar(caminho: string | null): Promise<void> {
    if (!caminho) return;
    const { data, error } = await supabase.storage
      .from("documentos-fiscais")
      .createSignedUrl(caminho, 60);
    if (error) {
      toast.error(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  const permitido = pode("financeiro.gerenciar") || pode("cadastros.gerenciar");
  if (!permitido)
    return (
      <AppShell titulo="Documentos fiscais">
        <EmptyState
          titulo="Área restrita"
          descricao="Seu perfil não tem acesso aos documentos fiscais."
        />
      </AppShell>
    );

  return (
    <AppShell
      titulo="Documentos fiscais"
      descricao="Registro e arquivo privado; sem emissão automática ou cálculo de tributos"
    >
      <div className="grid gap-6 xl:grid-cols-[24rem_1fr]">
        <form
          className="space-y-4 rounded-md border border-border bg-card p-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-5 text-primary" />
            <div>
              <h2 className="font-semibold">Arquivar documento</h2>
              <p className="text-sm text-muted-foreground">
                Aceita PDF, XML ou imagem de até 10 MB.
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as Tipo)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TIPOS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="doc-numero">Número</Label>
              <Input id="doc-numero" value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-competencia">Competência</Label>
              <Input
                id="doc-competencia"
                type="date"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-emissor">Emissor</Label>
            <Input id="doc-emissor" value={emissor} onChange={(e) => setEmissor(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-valor">Valor</Label>
            <Input
              id="doc-valor"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-arquivo">Arquivo</Label>
            <Input
              id="doc-arquivo"
              type="file"
              required
              accept=".pdf,.xml,image/*"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-obs">Observações</Label>
            <Textarea
              id="doc-obs"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>
          <Button className="w-full" disabled={salvar.isPending || !arquivo}>
            <FileUp className="size-4" /> Arquivar
          </Button>
        </form>
        <section>
          <h2 className="mb-3 font-semibold">Documentos arquivados</h2>
          {q.isPending ? (
            <LoadingBloco />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : q.data.length === 0 ? (
            <EmptyState
              titulo="Nenhum documento"
              descricao="Os documentos fiscais e comprovantes aparecerão aqui."
            />
          ) : (
            <ul className="space-y-2">
              {q.data.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {TIPOS[d.tipo]}
                      {d.numero ? ` · nº ${d.numero}` : ""}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.emissor_nome || "Emissor não informado"} · {dataHora(d.criado_em)}
                      {d.valor != null ? ` · ${moeda(d.valor)}` : ""}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{d.arquivo_nome}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{STATUS[d.status]}</Badge>
                    {d.arquivo_caminho ? (
                      <Button size="sm" variant="outline" onClick={() => baixar(d.arquivo_caminho)}>
                        <Download className="size-4" /> Baixar
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
