import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { carregarVisaoMaster } from "@/lib/plataforma.functions";
import { moeda, dataHora } from "@/lib/dominio";
import { ErrorState, LoadingBloco } from "@/components/states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function MasterOverview() {
  const carregar = useServerFn(carregarVisaoMaster);
  const q = useQuery({ queryKey: ["admin", "visao-global"], queryFn: () => carregar() });
  const [empresaId, setEmpresaId] = useState("todas");

  if (q.isPending) return <LoadingBloco />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const raw = q.data as unknown;

  // Trata caso a server function tenha retornado um payload com erro serializado
  if (
    raw &&
    typeof raw === "object" &&
    "error" in raw &&
    typeof (raw as { error: unknown }).error === "string"
  ) {
    return (
      <ErrorState error={new Error((raw as { error: string }).error)} onRetry={() => q.refetch()} />
    );
  }

  const d = (raw && typeof raw === "object" ? raw : {}) as {
    empresas?: Array<{ id: string; nome: string; ativa: boolean }>;
    eventos?: Array<{ id: string; empresa_id: string; status: string }>;
    colaboradores?: Array<{ id: string; empresa_id: string }>;
    pontos?: unknown[];
    pagamentos?: unknown[];
    movimentos?: Array<{ empresa_id: string; tipo: string; valor: number | string }>;
    cobrancas?: Array<{ empresa_id: string; tipo: string; status: string; valor: number | string }>;
    atendimentos?: Array<{
      id: string;
      empresa_id: string;
      motivo: string;
      iniciado_em: string;
      encerrado_em: string | null;
    }>;
  };

  const empresasLista = Array.isArray(d.empresas) ? d.empresas : [];
  const eventosLista = Array.isArray(d.eventos) ? d.eventos : [];
  const colaboradoresLista = Array.isArray(d.colaboradores) ? d.colaboradores : [];
  const pontosLista = Array.isArray(d.pontos) ? d.pontos : [];
  const pagamentosLista = Array.isArray(d.pagamentos) ? d.pagamentos : [];
  const movimentosLista = Array.isArray(d.movimentos) ? d.movimentos : [];
  const cobrancasLista = Array.isArray(d.cobrancas) ? d.cobrancas : [];
  const atendimentosLista = Array.isArray(d.atendimentos) ? d.atendimentos : [];

  const pertence = (id?: string | null) => empresaId === "todas" || id === empresaId;

  const empresas = empresasLista.filter((e) => pertence(e.id));
  const eventos = eventosLista.filter((e) => pertence(e.empresa_id));

  // Extração defensiva de empresa_id a partir de junções aninhadas ou diretas
  const extrairEmpresaIdDeItem = (item: unknown): string | null => {
    if (!item || typeof item !== "object") return null;
    const it = item as Record<string, unknown>;
    if (typeof it["empresa_id"] === "string") return it["empresa_id"];

    // pontual para pagamentos: fechamentos -> escalas -> equipes -> eventos -> empresa_id
    const fRaw = it["fechamentos"] ?? it["fechamento"];
    const f = Array.isArray(fRaw) ? fRaw[0] : fRaw;
    if (f && typeof f === "object") {
      const fObj = f as Record<string, unknown>;
      const escRaw = fObj["escalas"] ?? fObj["escala"];
      const esc = Array.isArray(escRaw) ? escRaw[0] : escRaw;
      if (esc && typeof esc === "object") {
        const escObj = esc as Record<string, unknown>;
        const eqRaw = escObj["equipes"] ?? escObj["equipe"];
        const eq = Array.isArray(eqRaw) ? eqRaw[0] : eqRaw;
        if (eq && typeof eq === "object") {
          const eqObj = eq as Record<string, unknown>;
          const evRaw = eqObj["eventos"] ?? eqObj["evento"];
          const ev = Array.isArray(evRaw) ? evRaw[0] : evRaw;
          if (
            ev &&
            typeof ev === "object" &&
            typeof (ev as Record<string, unknown>)["empresa_id"] === "string"
          ) {
            return (ev as Record<string, unknown>)["empresa_id"] as string;
          }
        }
      }
    }

    // pontual para pontos: escalas -> equipes -> eventos -> empresa_id
    const escRaw2 = it["escalas"] ?? it["escala"];
    const esc2 = Array.isArray(escRaw2) ? escRaw2[0] : escRaw2;
    if (esc2 && typeof esc2 === "object") {
      const escObj2 = esc2 as Record<string, unknown>;
      const eqRaw2 = escObj2["equipes"] ?? escObj2["equipe"];
      const eq2 = Array.isArray(eqRaw2) ? eqRaw2[0] : eqRaw2;
      if (eq2 && typeof eq2 === "object") {
        const eqObj2 = eq2 as Record<string, unknown>;
        const evRaw2 = eqObj2["eventos"] ?? eqObj2["evento"];
        const ev2 = Array.isArray(evRaw2) ? evRaw2[0] : evRaw2;
        if (
          ev2 &&
          typeof ev2 === "object" &&
          typeof (ev2 as Record<string, unknown>)["empresa_id"] === "string"
        ) {
          return (ev2 as Record<string, unknown>)["empresa_id"] as string;
        }
      }
    }

    return null;
  };

  const pagamentos = pagamentosLista.filter((p) => {
    const empId = extrairEmpresaIdDeItem(p);
    return empId ? pertence(empId) : empresaId === "todas";
  });

  const pontos = pontosLista.filter((p) => {
    const empId = extrairEmpresaIdDeItem(p);
    return empId ? pertence(empId) : empresaId === "todas";
  });

  const movimentos = movimentosLista.filter((m) => pertence(m.empresa_id));
  const saldo = movimentos.reduce(
    (s, m) => s + (m.tipo === "credito" ? 1 : -1) * Number(m.valor || 0),
    0,
  );

  return (
    <div className="space-y-6">
      <Select value={empresaId} onValueChange={setEmpresaId}>
        <SelectTrigger className="max-w-md">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Todas as empresas</SelectItem>
          {empresasLista.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Empresas", empresas.length],
          [
            "Ativas / inativas",
            `${empresas.filter((e) => e.ativa).length} / ${empresas.filter((e) => !e.ativa).length}`,
          ],
          ["Eventos", eventos.length],
          ["Em operação", eventos.filter((e) => e.status === "em_execucao").length],
          ["Colaboradores", colaboradoresLista.filter((p) => pertence(p.empresa_id)).length],
          [
            "Pontos pendentes",
            pontos.filter((p: unknown) => (p as { status?: string })?.status === "pendente").length,
          ],
          ["Saldo de terceiros", moeda(saldo)],
          [
            "A pagar",
            moeda(
              Number(
                pagamentos
                  .filter((p: unknown) =>
                    ["pendente", "agendado"].includes(
                      String((p as { status?: string })?.status || ""),
                    ),
                  )
                  .reduce(
                    (s: number, p: unknown) =>
                      s + Number((p as { valor?: number | string })?.valor || 0),
                    0,
                  ),
              ),
            ),
          ],
        ].map(([label, v]) => (
          <div key={String(label)}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-2 text-xl font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <section>
        <h2 className="font-semibold">Recargas e saldos por empresa</h2>
        <ul className="divide-y divide-border">
          {empresas.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-3 py-3">
              <span>{e.nome}</span>
              <span>
                Saldo:{" "}
                {moeda(
                  movimentosLista
                    .filter((m) => m.empresa_id === e.id)
                    .reduce(
                      (s, m) => s + (m.tipo === "credito" ? 1 : -1) * Number(m.valor || 0),
                      0,
                    ),
                )}{" "}
                · Recargas confirmadas:{" "}
                {moeda(
                  cobrancasLista
                    .filter(
                      (c) =>
                        c.empresa_id === e.id && c.tipo === "aporte_agencia" && c.status === "pago",
                    )
                    .reduce((s, c) => s + Number(c.valor || 0), 0),
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-semibold">Atividade de suporte</h2>
        <ul className="divide-y divide-border">
          {atendimentosLista
            .filter((a) => pertence(a.empresa_id))
            .map((a) => (
              <li key={a.id} className="py-3 text-sm">
                {empresasLista.find((e) => e.id === a.empresa_id)?.nome || "Empresa"} · {a.motivo} ·{" "}
                {dataHora(a.iniciado_em)} · {a.encerrado_em ? "Encerrado" : "Em atendimento"}
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
