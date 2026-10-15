# PayCrew — revisão dos perfis e isolamento

## Separação implementada
- ADMIN_MASTER: contexto PLATFORM, sem vínculo artificial com agência; visão global em `/admin`, filtro por empresa, indicadores e atividade de suporte. Consultas globais usam usuário autenticado e RLS.
- SUPORTE: contexto PLATFORM; localiza uma empresa, informa finalidade, abre um atendimento próprio e encerra antes de selecionar outra. Consultas operacionais e diagnóstico financeiro são somente leitura, limitados à empresa do atendimento e auditados. Não pode executar Pix, alterar saldos ou conceder papéis.
- ADMIN/COORDENADOR/FINANCEIRO/SUPERVISOR: contexto ORGANIZATION, com a matriz original de capacidades preservada. Ausência de empresa permite onboarding, mas não operações empresariais.

A sessão consulta identidade e ativação em `usuarios`, papéis organizacionais em `user_roles` e papéis globais em `plataforma_usuarios`. Um papel da plataforma exclui capacidades organizacionais, inclusive em vínculos legados. As contas existentes foram reconciliadas, sem novas identidades; seus vínculos e papéis empresariais indevidos foram removidos.

## Banco e servidor
- `empresa_atual`, `has_role`, `tem_capacidade` e `tem_papel_plataforma` exigem conta ativa e contexto apropriado.
- `eh_equipe_plataforma` continua exclusivamente ADMIN_MASTER. Suporte não ganha leitura global por atendimento aberto.
- Troca direta de empresa e autoativação são bloqueadas por trigger. Onboarding autorizado continua funcionando por RPC.
- RLS de cobranças exige capacidade financeira para agência; acesso global master preservado. Leitura de pagamentos/fechamentos verifica propriedade antes da regra de plano, evitando erros ou vazamentos entre tenants.
- `suporte_atendimentos` tem leitura limitada, escrita por RPC, uma sessão aberta por usuário e auditoria de abertura/encerramento.
- Consultas privilegiadas do suporte verificam atendimento próprio aberto e aplicam filtros em todos os vínculos indiretos.
- Alterações de papéis da plataforma dependem da policy master; trigger bloqueia alteração dos próprios privilégios e conta empresarial, além de registrar auditoria.
- Registros de auditoria e ingestão de webhooks não aceitam escrita por clientes autenticados. Webhooks também não são consultáveis pelo cliente.
- Logout limpa o cache de dados para impedir reapresentação de informações da sessão anterior.

## Arquivos principais
`src/lib/dominio.ts`, `src/lib/autorizacao.server.ts`, `src/hooks/use-sessao.tsx`, `src/routes/_authenticated/route.tsx`, `src/components/app-shell.tsx`, `src/routes/__root.tsx`, `src/lib/suporte.functions.ts`, `src/routes/_authenticated/suporte.tsx`, `src/lib/plataforma.functions.ts`, `src/components/master-overview.tsx`, `src/routes/_authenticated/admin.tsx`, `src/lib/acessos.functions.ts`, `src/lib/operacao.functions.ts`, `src/lib/autorizacao.test.ts`, `scripts/security/access-isolation.sql`, `AGENTS.md`, `roadmap.md`.
Metadados das páginas de autenticação, clientes, eventos, fechamento, onboarding, operação, painel e relatórios foram completados.

## Migrations controladas
- 0012: contexto da plataforma, proteção de vínculo/ativação e atendimentos auditados.
- 0013: proteção de auditorias, ingestão de webhooks e capacidades efetivas.
- 0014: papéis ativos, proteção contra autoelevação, auditoria de papéis e preservação master.
- 0015: correção dos valores de contexto de auditoria usados nos atendimentos.
- 0016: avaliação de propriedade antes dos gates de plano nas leituras financeiras.
Sem exclusão de tabelas/colunas ou registros operacionais e financeiros; sem alteração de cálculo ou gateway de pagamentos.

## Resultados dos 16 cenários
Testes SQL executados no banco real sob `SET LOCAL ROLE authenticated` e identidade selecionada, em transação com ROLLBACK. Mudanças temporárias de papéis e onboarding não foram persistidas. PASSOU significa a evidência descrita, não aprovação visual de todo o fluxo.

| # | Cenário | Resultado | Evidência e limite |
|---|---|---|---|
| 1 | Master global | PASSOU | As duas empresas existentes visíveis pelo papel master. |
| 2 | Master por empresa | PASSOU | Ambas recuperadas por IDs individuais. |
| 3 | Atendimento do suporte | PASSOU | RPC abriu atendimento próprio na empresa alvo e encerrou; interface não validada. |
| 4 | Suporte sem autoelevação | PASSOU | Tentativa direta de inserir ADMIN_MASTER recusada. |
| 5 | Suporte sem financeiro | PASSOU | Capacidade financeira falsa, contexto empresarial nulo, pagamentos não visíveis; endpoints de movimento retirados. |
| 6 | Agência A só vê A | PASSOU | Apenas uma empresa visível, com o ID correto. |
| 7 | IDs da B não autorizam | PASSOU | Alteração direta da empresa B afetou zero registros. |
| 8 | Coordenador | PASSOU | Papel temporário preservou eventos, sem financeiro. |
| 9 | Financeiro | PASSOU | Papel temporário preservou financeiro, sem gestão de eventos. |
| 10 | Supervisor | PASSOU | Papel temporário preservou supervisão, sem financeiro; atribuição específica de equipes não exercitada. |
| 11 | Recargas/saldo/histórico | PASSOU | Cobranças, movimentos e funding de B não visíveis para A. |
| 12 | Eventos/colaboradores | PASSOU | Nenhum registro de outra empresa retornado. |
| 13 | Pontos/valores a pagar | PASSOU | Cadeias indiretas não retornaram registros de outra empresa. |
| 14 | Indicadores sem mistura | PASSOU | A mostrou saldo 1,94; B tem saldo 5,00. A não mostrou total 6,94. |
| 15 | Acesso direto sem interface | PASSOU | Troca de empresa no próprio perfil negada no banco. |
| 16 | Sem empresa/onboarding | PASSOU | Conta existente sem empresa criou organização via RPC em transação revertida; não tinha capacidades empresariais antes disso. |

Nove testes automatizados de contexto, isolamento e capacidades passaram em Vitest. A compilação automática está limpa.

## Validação integrada e riscos residuais
- NÃO VALIDÁVEL nesta execução: fluxo visual ponta a ponta de login, seleção e encerramento de atendimento. Playwright permaneceu em página vazia em localhost; dezenas de módulos continuaram pendentes após 60 segundos. Não houve evidência suficiente para atribuir isso ao sistema de autenticação. Nenhuma aprovação visual foi declarada.
- Os testes de RLS usam papéis autenticados no banco; ainda é necessário repetir os fluxos pelas requisições HTTP e telas dos perfis reais, incluindo sessão desativada, troca de usuário e expiração de atendimento durante consulta.
- Dados financeiros exibidos no suporte são diagnóstico somente leitura; confirmação externa de uma solicitação autorizada e acesso granular por recurso podem precisar de política operacional adicional.
- Consultas globais e de suporte ainda usam limites padrão de retorno do serviço; em bases maiores, paginação/agregações no servidor são necessárias para totais completos.
- Integridade atômica de algumas auditorias organizacionais e atribuição específica de supervisor por equipe devem ser verificados separadamente; isolamento entre empresas foi exercitado, mas isso não prova todas as permissões por equipe.
- Credenciais/homologação Mercado Pago e lacunas históricas de Pix/CLT permanecem fora desta correção de autorização.
