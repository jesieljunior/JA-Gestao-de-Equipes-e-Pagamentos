import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingBloco } from "@/components/states";
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
import { Switch } from "@/components/ui/switch";
import { useSessao } from "@/hooks/use-sessao";
import { supabase } from "@/integrations/supabase/client";
import { AVISO_CLT } from "@/lib/cobranca-v2";
import {
  formatarCpf,
  ROTULO_TIPO_VINCULO,
  soDigitos,
  type Freelancer,
  type TipoVinculo,
} from "@/lib/dominio";

export const Route = createFileRoute("/_authenticated/freelancers")({
  head: () => ({
    meta: [
      { title: "Freelancers — PayCrew" },
      {
        name: "description",
        content:
          "Cadastro de freelancers da agência com CPF, função e chave Pix usada no pagamento após o fechamento do evento.",
      },
      { property: "og:title", content: "Freelancers — PayCrew" },
      {
        property: "og:description",
        content: "Equipe freelancer da agência: dados, função e chave Pix.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Freelancers,
});

function FormFreelancer({
  freelancer,
  onFechar,
}: {
  freelancer?: Freelancer;
  onFechar: () => void;
}) {
  const { empresaId } = useSessao();
  const queryClient = useQueryClient();
  const [nome, setNome] = useState(freelancer?.nome ?? "");
  const [cpf, setCpf] = useState(formatarCpf(freelancer?.cpf ?? ""));
  const [telefone, setTelefone] = useState(freelancer?.telefone ?? "");
  const [funcao, setFuncao] = useState(freelancer?.funcao ?? "");
  const [chavePix, setChavePix] = useState(freelancer?.chave_pix ?? "");
  const [tipoVinculo, setTipoVinculo] = useState<TipoVinculo>(
    freelancer?.tipo_vinculo === "clt" ? "clt" : "frela",
  );
  const [salarioMensal, setSalarioMensal] = useState(
    freelancer?.salario_mensal != null ? String(freelancer.salario_mensal) : "",
  );
  const [ativo, setAtivo] = useState(freelancer?.ativo ?? true);

  const salvar = useMutation({
    mutationFn: async () => {
      const digitos = soDigitos(cpf);
      if (digitos.length !== 11) throw new Error("CPF deve ter 11 dígitos.");
      const salarioInformado = salarioMensal ? Number(salarioMensal.replace(",", ".")) : null;
      const salario = tipoVinculo === "clt" ? salarioInformado : null;
      if (tipoVinculo === "clt" && (!salario || salario <= 0)) {
        throw new Error("Informe o salário mensal do colaborador CLT.");
      }
      const payload = {
        nome: nome.trim(),
        cpf: digitos,
        telefone: telefone.trim() || null,
        funcao: funcao.trim() || null,
        chave_pix: chavePix.trim(),
        tipo_vinculo: tipoVinculo,
        salario_mensal: salario,
        ativo,
      };
      if (!empresaId) throw new Error("Agência não identificada.");
      const { error } = freelancer
        ? await supabase.from("freelancers").update(payload).eq("id", freelancer.id)
        : await supabase.from("freelancers").insert({ ...payload, empresa_id: empresaId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["freelancers"] });
      toast.success(freelancer ? "Freelancer atualizado." : "Freelancer cadastrado.");
      onFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate();
      }}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="f-nome">Nome</Label>
        <Input id="f-nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Tipo de vínculo</Label>
          <Select value={tipoVinculo} onValueChange={(v) => setTipoVinculo(v as TipoVinculo)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROTULO_TIPO_VINCULO) as TipoVinculo[]).map((tipo) => (
                <SelectItem key={tipo} value={tipo}>
                  {ROTULO_TIPO_VINCULO[tipo]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-salario">Salário mensal (CLT)</Label>
          <Input
            id="f-salario"
            inputMode="decimal"
            disabled={tipoVinculo !== "clt"}
            value={tipoVinculo === "clt" ? salarioMensal : ""}
            onChange={(e) => setSalarioMensal(e.target.value)}
            placeholder={tipoVinculo === "clt" ? "0,00" : "Não se aplica"}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="f-cpf">CPF</Label>
          <Input
            id="f-cpf"
            required
            inputMode="numeric"
            value={cpf}
            onChange={(e) => setCpf(formatarCpf(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-tel">Telefone</Label>
          <Input id="f-tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="f-funcao">Função</Label>
          <Input
            id="f-funcao"
            placeholder="Garçom, recepção, montagem…"
            value={funcao}
            onChange={(e) => setFuncao(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-pix">Chave Pix</Label>
          <Input
            id="f-pix"
            required
            value={chavePix}
            onChange={(e) => setChavePix(e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <Label htmlFor="f-ativo" className="text-sm font-normal">
          Disponível para escala
        </Label>
        <Switch id="f-ativo" checked={ativo} onCheckedChange={setAtivo} />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={salvar.isPending}>
          Salvar
        </Button>
      </DialogFooter>
    </form>
  );
}

function Freelancers() {
  const { empresaId } = useSessao();
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [soAtivos, setSoAtivos] = useState(true);
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<Freelancer | null>(null);
  const [importando, setImportando] = useState(false);

  function baixarModelo() {
    const planilha = XLSX.utils.json_to_sheet([
      {
        nome: "Maria da Silva",
        cpf: "00000000000",
        telefone: "11999999999",
        funcao: "Recepção",
        chave_pix: "maria@exemplo.com",
        tipo_vinculo: "frela",
        salario_mensal: "",
      },
      {
        nome: "João de Souza",
        cpf: "11111111111",
        telefone: "11988888888",
        funcao: "Produção",
        chave_pix: "joao@exemplo.com",
        tipo_vinculo: "clt",
        salario_mensal: 2500,
      },
    ]);
    const arquivo = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(arquivo, planilha, "Colaboradores");
    XLSX.writeFile(arquivo, "modelo-colaboradores-paycrew.xlsx");
  }

  async function importarArquivo(file: File) {
    setImportando(true);
    try {
      if (!empresaId) throw new Error("Organização não encontrada.");
      const recurso = await supabase.rpc("recurso_habilitado", {
        _empresa_id: empresaId,
        _recurso: "importacao_excel",
      });
      if (recurso.error || !recurso.data)
        throw new Error("Importação Excel indisponível no seu plano. Faça upgrade em Plano e uso.");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const primeiraAba = workbook.Sheets[workbook.SheetNames[0] ?? ""];
      if (!primeiraAba) throw new Error("A planilha não possui uma aba válida.");
      const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(primeiraAba, {
        defval: "",
      });
      if (!linhas.length) throw new Error("A planilha não possui colaboradores.");

      const registros = linhas.map((linha, index) => {
        const tipo = String(linha["tipo_vinculo"] || "frela").toLowerCase();
        const salarioInformado =
          linha["salario_mensal"] === "" ? null : Number(linha["salario_mensal"]);
        const salario = tipo === "clt" ? salarioInformado : null;
        const cpf = soDigitos(String(linha["cpf"]));
        if (
          !String(linha["nome"]).trim() ||
          cpf.length !== 11 ||
          !String(linha["chave_pix"]).trim()
        ) {
          throw new Error(`Linha ${index + 2}: nome, CPF e chave Pix são obrigatórios.`);
        }
        if (tipo !== "frela" && tipo !== "clt") {
          throw new Error(`Linha ${index + 2}: tipo_vinculo deve ser frela ou clt.`);
        }
        if (tipo === "clt" && (!salario || salario <= 0)) {
          throw new Error(`Linha ${index + 2}: salário mensal é obrigatório para CLT.`);
        }
        return {
          empresa_id: empresaId,
          nome: String(linha["nome"]).trim(),
          cpf,
          telefone: String(linha["telefone"]).trim() || null,
          funcao: String(linha["funcao"]).trim() || null,
          chave_pix: String(linha["chave_pix"]).trim(),
          tipo_vinculo: tipo,
          salario_mensal: salario,
          ativo: true,
        };
      });
      const { error } = await supabase.from("freelancers").insert(registros);
      if (error) throw error;
      toast.success(`${registros.length} colaborador(es) importado(s).`);
      queryClient.invalidateQueries({ queryKey: ["freelancers"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao importar a planilha.");
    } finally {
      setImportando(false);
    }
  }

  const q = useQuery({
    queryKey: ["freelancers", empresaId],
    enabled: Boolean(empresaId),
    queryFn: async () => {
      const { data, error } = await supabase.from("freelancers").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const termo = busca.trim().toLowerCase();
  const lista = (q.data ?? []).filter(
    (f) =>
      (!soAtivos || f.ativo) &&
      (f.nome.toLowerCase().includes(termo) ||
        (f.funcao ?? "").toLowerCase().includes(termo) ||
        f.cpf.includes(soDigitos(termo))),
  );

  return (
    <AppShell
      titulo="Freelancers"
      descricao={`Equipe disponível para escala · ${AVISO_CLT}`}
      acoes={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={baixarModelo}>
            <Download className="size-4" /> Modelo Excel
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
            <FileSpreadsheet className="size-4" />
            {importando ? "Importando..." : "Importar Excel"}
            <input
              className="sr-only"
              type="file"
              accept=".xlsx,.xls"
              disabled={importando}
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) void importarArquivo(arquivo);
                e.currentTarget.value = "";
              }}
            />
          </label>
          <Dialog open={novo} onOpenChange={setNovo}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" /> Novo colaborador
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo colaborador</DialogTitle>
              </DialogHeader>
              <FormFreelancer onFechar={() => setNovo(false)} />
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por nome, função ou CPF"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={soAtivos} onCheckedChange={setSoAtivos} />
          Somente ativos
        </label>
      </div>

      {q.isPending ? (
        <LoadingBloco />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : lista.length === 0 ? (
        <EmptyState
          titulo="Nenhum freelancer"
          descricao="Cadastre a equipe para poder escalar nos eventos."
        />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-card">
          {lista.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {f.nome}
                  {!f.ativo ? (
                    <span className="ml-2 text-xs text-muted-foreground">inativo</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[
                    ROTULO_TIPO_VINCULO[f.tipo_vinculo === "clt" ? "clt" : "frela"],
                    f.funcao,
                    formatarCpf(f.cpf),
                    f.chave_pix,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditando(f)}>
                <Pencil className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(editando)} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar freelancer</DialogTitle>
          </DialogHeader>
          {editando ? (
            <FormFreelancer freelancer={editando} onFechar={() => setEditando(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
