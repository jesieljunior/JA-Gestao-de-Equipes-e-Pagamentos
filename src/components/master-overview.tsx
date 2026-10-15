import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { carregarVisaoMaster } from "@/lib/plataforma.functions";
import { moeda,dataHora } from "@/lib/dominio";
import { ErrorState,LoadingBloco } from "@/components/states";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
export function MasterOverview(){
 const carregar=useServerFn(carregarVisaoMaster);
 const q=useQuery({queryKey:["admin","visao-global"],queryFn:()=>carregar()});
 const [empresaId,setEmpresaId]=useState("todas");
 if(q.isPending)return <LoadingBloco/>; if(q.isError)return <ErrorState error={q.error} onRetry={()=>q.refetch()}/>;
 const d=q.data; const pertence=(id:string)=>empresaId==="todas"||id===empresaId;
 const empresas=d.empresas.filter(e=>pertence(e.id)); const eventos=d.eventos.filter(e=>pertence(e.empresa_id));
 const pagamentos=d.pagamentos.filter(p=>pertence(p.fechamentos.escalas.equipes.eventos.empresa_id));
 const pontos=d.pontos.filter(p=>pertence(p.escalas.equipes.eventos.empresa_id));
 const movimentos=d.movimentos.filter(m=>pertence(m.empresa_id));
 const saldo=movimentos.reduce((s,m)=>s+(m.tipo==="credito"?1:-1)*Number(m.valor),0);
 return <div className="space-y-6"><Select value={empresaId} onValueChange={setEmpresaId}><SelectTrigger className="max-w-md"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="todas">Todas as empresas</SelectItem>{d.empresas.map(e=><SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent></Select>
 <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{[["Empresas",empresas.length],["Ativas / inativas",`${empresas.filter(e=>e.ativa).length} / ${empresas.filter(e=>!e.ativa).length}`],["Eventos",eventos.length],["Em operação",eventos.filter(e=>e.status==="em_execucao").length],["Colaboradores",d.colaboradores.filter(p=>pertence(p.empresa_id)).length],["Pontos pendentes",pontos.filter(p=>p.status==="pendente").length],["Saldo de terceiros",moeda(saldo)],["A pagar",moeda(pagamentos.filter(p=>["pendente","agendado"].includes(p.status)).reduce((s,p)=>s+Number(p.valor),0))]].map(([label,v])=><div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 text-xl font-semibold">{v}</dd></div>)}</dl>
 <section><h2 className="font-semibold">Recargas e saldos por empresa</h2><ul className="divide-y divide-border">{empresas.map(e=><li key={e.id} className="flex flex-wrap justify-between gap-3 py-3"><span>{e.nome}</span><span>Saldo: {moeda(d.movimentos.filter(m=>m.empresa_id===e.id).reduce((s,m)=>s+(m.tipo==="credito"?1:-1)*Number(m.valor),0))} · Recargas confirmadas: {moeda(d.cobrancas.filter(c=>c.empresa_id===e.id&&c.tipo==="aporte_agencia"&&c.status==="pago").reduce((s,c)=>s+Number(c.valor),0))}</span></li>)}</ul></section>
 <section><h2 className="font-semibold">Atividade de suporte</h2><ul className="divide-y divide-border">{d.atendimentos.filter(a=>pertence(a.empresa_id)).map(a=><li key={a.id} className="py-3 text-sm">{d.empresas.find(e=>e.id===a.empresa_id)?.nome} · {a.motivo} · {dataHora(a.iniciado_em)} · {a.encerrado_em?"Encerrado":"Em atendimento"}</li>)}</ul></section></div>;
}
