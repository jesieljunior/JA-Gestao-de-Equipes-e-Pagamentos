import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Mail, MapPin, Pencil, Plus, ReceiptText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { useSessao } from "@/hooks/use-sessao";
import { supabase } from "@/integrations/supabase/client";
import { soDigitos, type Cliente } from "@/lib/dominio";

type TipoPessoa = "pf" | "pj";

const formatarDocumento = (valor: string, tipo: TipoPessoa) => {
  const digitos = soDigitos(valor).slice(0, tipo === "pf" ? 11 : 14);
  if (tipo === "pf") {
    return digitos
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  return digitos
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
};

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Clientes — Já" },
      {
        name: "description",
        content:
          "Cadastro de clientes da agência: contratantes dos eventos atendidos pelas equipes freelancers.",
      },
      { property: "og:title", content: "Clientes — Já" },
      {
        property: "og:description",
        content: "Gerencie os contratantes dos eventos da sua agência.",
      },
    ],
  }),
  component: Clientes,
});

function FormCliente({ cliente, onFechar }: { cliente?: Cliente; onFechar: () => void }) {
  const { empresaId, pode } = useSessao();
  const queryClient = useQueryClient();
  const [nome, setNome] = useState(cliente?.nome ?? "");
  const [tipoPessoa, setTipoPessoa] = useState<TipoPessoa>(cliente?.tipo_pessoa ?? "pj");
  const [documento, setDocumento] = useState(
    formatarDocumento(cliente?.cpf_cnpj ?? "", cliente?.tipo_pessoa ?? "pj"),
  );
  const [razaoSocial, setRazaoSocial] = useState(cliente?.razao_social ?? "");
  const [nomeFantasia, setNomeFantasia] = useState(cliente?.nome_fantasia ?? "");
  const [email, setEmail] = useState(cliente?.email ?? "");
  const [emailFinanceiro, setEmailFinanceiro] = useState(cliente?.email_financeiro ?? "");
  const [telefone, setTelefone] = useState(cliente?.telefone ?? "");
  const [responsavelNome, setResponsavelNome] = useState(cliente?.responsavel_nome ?? "");
  const [responsavelCargo, setResponsavelCargo] = useState(cliente?.responsavel_cargo ?? "");
  const [canal, setCanal] = useState(cliente?.canal_preferencial ?? "email");
  const [cep, setCep] = useState(cliente?.cep ?? "");
  const [logradouro, setLogradouro] = useState(cliente?.logradouro ?? "");
  const [numero, setNumero] = useState(cliente?.numero ?? "");
  const [complemento, setComplemento] = useState(cliente?.complemento ?? "");
  const [bairro, setBairro] = useState(cliente?.bairro ?? "");
  const [cidade, setCidade] = useState(cliente?.cidade ?? "");
  const [uf, setUf] = useState(cliente?.uf ?? "");
  const [codigoMunicipio, setCodigoMunicipio] = useState(cliente?.codigo_municipio ?? "");
  const [inscricaoMunicipal, setInscricaoMunicipal] = useState(cliente?.inscricao_municipal ?? "");
  const [inscricaoEstadual, setInscricaoEstadual] = useState(cliente?.inscricao_estadual ?? "");
  const [isento, setIsento] = useState(cliente?.inscricao_estadual_isento ?? false);
  const [regimeFiscal, setRegimeFiscal] = useState(cliente?.regime_fiscal ?? "");
  const [codigoServico, setCodigoServico] = useState(cliente?.codigo_servico ?? "");
  const [vencimento, setVencimento] = useState(
    cliente?.vencimento_preferencial ? String(cliente.vencimento_preferencial) : "",
  );
  const [ativo, setAtivo] = useState(cliente?.ativo ?? true);
  const [observacoes, setObservacoes] = useState(cliente?.observacoes ?? "");

  const salvar = useMutation({
    mutationFn: async () => {
      if (!pode("cadastros.gerenciar")) throw new Error("Você não pode gerenciar clientes.");
      if (!empresaId) throw new Error("Organização não encontrada.");
      const documentoLimpo = soDigitos(documento);
      const tamanhoEsperado = tipoPessoa === "pf" ? 11 : 14;
      if (documentoLimpo.length !== tamanhoEsperado) {
        throw new Error(
          tipoPessoa === "pf" ? "CPF deve ter 11 dígitos." : "CNPJ deve ter 14 dígitos.",
        );
      }
      if (uf && uf.trim().length !== 2) throw new Error("UF deve ter duas letras.");
      const dia = vencimento ? Number(vencimento) : null;
      if (dia != null && (!Number.isInteger(dia) || dia < 1 || dia > 31)) {
        throw new Error("O vencimento preferencial deve ficar entre 1 e 31.");
      }
      const vazio = (valor: string) => valor.trim() || null;
      const payload = {
        nome: nome.trim(),
        tipo_pessoa: tipoPessoa,
        cpf_cnpj: documentoLimpo,
        razao_social: vazio(razaoSocial) ?? nome.trim(),
        nome_fantasia: vazio(nomeFantasia) ?? nome.trim(),
        ativo,
        email: vazio(email),
        email_financeiro: vazio(emailFinanceiro),
        telefone: vazio(telefone),
        responsavel_nome: vazio(responsavelNome),
        responsavel_cargo: vazio(responsavelCargo),
        canal_preferencial: canal,
        cep: vazio(soDigitos(cep)),
        logradouro: vazio(logradouro),
        numero: vazio(numero),
        complemento: vazio(complemento),
        bairro: vazio(bairro),
        cidade: vazio(cidade),
        uf: vazio(uf.toUpperCase()),
        codigo_municipio: vazio(soDigitos(codigoMunicipio)),
        inscricao_municipal: vazio(inscricaoMunicipal),
        inscricao_estadual: isento ? null : vazio(inscricaoEstadual),
        inscricao_estadual_isento: isento,
        regime_fiscal: vazio(regimeFiscal),
        codigo_servico: vazio(codigoServico),
        vencimento_preferencial: dia,
        observacoes: vazio(observacoes),
      };
      const { error } = cliente
        ? await supabase.from("clientes").update(payload).eq("id", cliente.id)
        : await supabase.from("clientes").insert({ ...payload, empresa_id: empresaId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      toast.success(cliente ? "Cliente atualizado." : "Cliente cadastrado.");
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
      className="max-h-[75vh] space-y-5 overflow-y-auto pr-1"
    >
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Building2 className="size-4" /> Identificação
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select
              value={tipoPessoa}
              onValueChange={(v) => {
                const tipo = v as TipoPessoa;
                setTipoPessoa(tipo);
                setDocumento("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pj">Pessoa jurídica</SelectItem>
                <SelectItem value="pf">Pessoa física</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliente-documento">{tipoPessoa === "pf" ? "CPF" : "CNPJ"}</Label>
            <Input
              id="cliente-documento"
              required
              inputMode="numeric"
              value={documento}
              onChange={(e) => setDocumento(formatarDocumento(e.target.value, tipoPessoa))}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cliente-nome">Nome de exibição</Label>
            <Input
              id="cliente-nome"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliente-razao">
              {tipoPessoa === "pj" ? "Razão social" : "Nome legal"}
            </Label>
            <Input
              id="cliente-razao"
              value={razaoSocial}
              onChange={(e) => setRazaoSocial(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliente-fantasia">Nome fantasia</Label>
            <Input
              id="cliente-fantasia"
              value={nomeFantasia}
              onChange={(e) => setNomeFantasia(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
          <Label htmlFor="cliente-ativo" className="font-normal">
            Cliente ativo
          </Label>
          <Switch id="cliente-ativo" checked={ativo} onCheckedChange={setAtivo} />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Mail className="size-4" /> Contato
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cliente-email">E-mail</Label>
            <Input
              id="cliente-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliente-email-fin">E-mail financeiro</Label>
            <Input
              id="cliente-email-fin"
              type="email"
              value={emailFinanceiro}
              onChange={(e) => setEmailFinanceiro(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliente-tel">Telefone</Label>
            <Input
              id="cliente-tel"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Canal preferencial</Label>
            <Select value={canal} onValueChange={setCanal}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="telefone">Telefone</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliente-resp">Responsável</Label>
            <Input
              id="cliente-resp"
              value={responsavelNome}
              onChange={(e) => setResponsavelNome(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliente-cargo">Cargo</Label>
            <Input
              id="cliente-cargo"
              value={responsavelCargo}
              onChange={(e) => setResponsavelCargo(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="size-4" /> Endereço
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cliente-cep">CEP</Label>
            <Input
              id="cliente-cep"
              inputMode="numeric"
              maxLength={9}
              value={cep}
              onChange={(e) => setCep(soDigitos(e.target.value).slice(0, 8))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliente-logradouro">Logradouro</Label>
            <Input
              id="cliente-logradouro"
              value={logradouro}
              onChange={(e) => setLogradouro(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliente-numero">Número</Label>
            <Input id="cliente-numero" value={numero} onChange={(e) => setNumero(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliente-complemento">Complemento</Label>
            <Input
              id="cliente-complemento"
              value={complemento}
              onChange={(e) => setComplemento(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliente-bairro">Bairro</Label>
            <Input id="cliente-bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliente-cidade">Cidade</Label>
            <Input id="cliente-cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliente-uf">UF</Label>
            <Input
              id="cliente-uf"
              maxLength={2}
              value={uf}
              onChange={(e) => setUf(e.target.value.toUpperCase())}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliente-cod-mun">Código do município</Label>
            <Input
              id="cliente-cod-mun"
              inputMode="numeric"
              value={codigoMunicipio}
              onChange={(e) => setCodigoMunicipio(soDigitos(e.target.value))}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ReceiptText className="size-4" /> Fiscal e cobrança
        </h3>
        <p className="text-xs text-muted-foreground">
          Dados informativos. A plataforma não calcula tributos nem emite notas automaticamente.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cliente-im">Inscrição municipal</Label>
            <Input
              id="cliente-im"
              value={inscricaoMunicipal}
              onChange={(e) => setInscricaoMunicipal(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliente-ie">Inscrição estadual</Label>
            <Input
              id="cliente-ie"
              disabled={isento}
              value={inscricaoEstadual}
              onChange={(e) => setInscricaoEstadual(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label htmlFor="cliente-isento" className="font-normal">
              Isento de inscrição estadual
            </Label>
            <Switch id="cliente-isento" checked={isento} onCheckedChange={setIsento} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliente-regime">Regime/observação fiscal</Label>
            <Input
              id="cliente-regime"
              value={regimeFiscal}
              onChange={(e) => setRegimeFiscal(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliente-servico">Código de serviço</Label>
            <Input
              id="cliente-servico"
              value={codigoServico}
              onChange={(e) => setCodigoServico(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cliente-vencimento">Dia preferencial de vencimento</Label>
            <Input
              id="cliente-vencimento"
              type="number"
              min={1}
              max={31}
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
            />
          </div>
        </div>
      </section>

      <div className="space-y-1.5">
        <Label htmlFor="cliente-obs">Observações</Label>
        <Textarea
          id="cliente-obs"
          rows={3}
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={salvar.isPending}>
          Salvar
        </Button>
      </DialogFooter>
    </form>
  );
}

function Clientes() {
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const { pode } = useSessao();

  const q = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const termo = busca.trim().toLowerCase();
  const lista = (q.data ?? []).filter(
    (c) =>
      c.nome.toLowerCase().includes(termo) ||
      (c.razao_social ?? "").toLowerCase().includes(termo) ||
      (c.cpf_cnpj ?? "").includes(soDigitos(termo)) ||
      (c.email ?? "").toLowerCase().includes(termo),
  );

  return (
    <AppShell
      titulo="Clientes"
      descricao="Contratantes dos eventos"
      acoes={
        pode("cadastros.gerenciar") ? (
          <Dialog open={novo} onOpenChange={setNovo}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" /> Novo cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Novo cliente</DialogTitle>
              </DialogHeader>
              <FormCliente onFechar={() => setNovo(false)} />
            </DialogContent>
          </Dialog>
        ) : null
      }
    >
      <Input
        placeholder="Buscar por nome, documento ou e-mail"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="mb-4 max-w-sm"
      />

      {q.isPending ? (
        <LoadingBloco />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : lista.length === 0 ? (
        <EmptyState
          titulo="Nenhum cliente"
          descricao="Cadastre o contratante para vincular aos eventos."
        />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-card">
          {lista.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {c.nome}
                  {!c.ativo ? (
                    <span className="ml-2 text-xs text-muted-foreground">inativo</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[
                    c.cpf_cnpj ? formatarDocumento(c.cpf_cnpj, c.tipo_pessoa) : null,
                    c.email_financeiro ?? c.email,
                    c.cidade && c.uf ? `${c.cidade}/${c.uf}` : c.cidade,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Cadastro incompleto"}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                disabled={!pode("cadastros.gerenciar")}
                onClick={() => setEditando(c)}
                aria-label={`Editar ${c.nome}`}
              >
                <Pencil className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(editando)} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
          </DialogHeader>
          {editando ? <FormCliente cliente={editando} onFechar={() => setEditando(null)} /> : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
