# PayCrew — ETAPA 1: Fundação do frontend sobre o FastAPI existente

Somente a ETAPA 1. Nenhuma tela de cadastro, evento, operação, fechamento ou financeiro será construída agora.

## O que será construído

1. **Configuração de API por ambiente** — `VITE_API_BASE_URL`, sem URL hardcoded. Se a variável não estiver definida, a aplicação mostra um aviso claro de configuração pendente em vez de falhar em silêncio.
2. **Camada `src/api/`** — cliente HTTP único (fetch tipado), tratamento padronizado de erro (rede, CORS, 4xx com `detail` do FastAPI, 5xx), timeout e parse de resposta.
3. **Tipos TypeScript espelhando os schemas reais** — enums do backend (`StatusEvento`, `StatusEscala`, `StatusPonto`, `StatusFechamento`, `StatusPagamento`, `TipoValor`, `TipoPonto`, `MetodoCheck`, `PapelUsuario`) copiados exatamente como estão em `app/enums.py`. Nenhum campo inventado.
4. **Estrutura de autenticação preparada para JWT** — um `AuthProvider` que guarda sessão (usuário, papel, empresa, token) e um interceptor que injeta `Authorization: Bearer` quando houver token. Como o backend ainda não tem `/auth/login`, a sessão inicial é selecionada localmente (empresa + usuário/papel) apenas como _compatibilidade temporária, explicitamente marcada no código_. Quando o endpoint real existir, só a função `login()` muda.
5. **Estrutura de permissões** — mapa de papéis (admin, coordenador, financeiro, supervisor) usado apenas para esconder/desabilitar UI. A autorização real continua sendo do backend.
6. **TanStack Query** — QueryClient já existente, chaves por entidade e padrão de invalidação documentado.
7. **Layout e navegação base** — shell responsivo (sidebar no desktop, barra inferior no mobile) com as seções do ciclo: Eventos, Clientes, Freelancers, Operação, Fechamento, Financeiro, Relatórios, Configurações. As páginas ficam como placeholders explícitos "ETAPA N" — sem dados falsos.
8. **Design system operacional** — tokens no `src/styles.css`: densidade alta, tipografia legível, badges de status consistentes para pendente / confirmado / recusado / em andamento / aprovado / falhou / pago. Sem gradientes decorativos.
9. **Estados base reutilizáveis** — loading (skeleton), erro (com mensagem da API e ação de repetir), vazio.
10. **Tela de diagnóstico de conexão** (`/conexao`) — chama `GET /health` na API configurada e mostra: URL usada, status, latência e, em caso de falha, se é rede, CORS ou erro do servidor. É a validação da fundação antes da ETAPA 2.

## Endpoints encontrados no backend

- `GET /health`
- Empresas: `POST /empresas`, `GET /empresas/{id}`, `PATCH /empresas/{id}`, `GET|PATCH /empresas/{id}/configuracoes`
- Clientes: `POST /clientes`, `GET /clientes`, `GET|PATCH /clientes/{id}`
- Freelancers: `POST /freelancers`, `GET /freelancers`, `GET|PATCH /freelancers/{id}`
- Eventos: `POST /eventos`, `GET|PATCH /eventos/{id}`, `POST /eventos/{id}/marcar-pronto|encerrar|arquivar|cancelar`, `POST|GET /eventos/{id}/equipes`
- Escalas: `POST /escalas`, `GET /escalas/{id}`, `POST /escalas/{id}/confirmar|recusar|substituir`
- Operação: `POST /checkin`, `POST /checkout`, `POST /pontos/{id}/aprovar`
- Fechamento: `POST /fechar-evento/{evento_id}`, `GET /fechamentos/{id}`, `POST /fechamentos/{id}/aprovar`
- Pagamentos: `GET /pagamentos`, `GET /pagamentos/{id}`, `POST /pagamentos/{id}/agendar`
- Webhooks: `POST /webhooks/parceiro-financeiro`
- Relatórios: `GET /relatorios/{evento_id}`

## Ausências e divergências já identificadas (bloqueiam etapas futuras)

Estas serão registradas como pendências no projeto, não contornadas no frontend:

1. **Sem autenticação** — não existe `/auth/login`, `/auth/me` nem middleware de sessão. Papel e usuário hoje só chegam por parâmetro (ex.: `supervisor_id`).
2. **Sem CORS** — `main.py` não registra `CORSMiddleware`. Sem isso o preview do Lovable não conseguirá chamar a API pelo navegador. É a dependência número 1 para a ETAPA 2.
3. **Sem listagem de eventos** — existe `GET /eventos/{id}`, mas não `GET /eventos`. A tela "Lista de eventos" da ETAPA 3 depende disso.
4. **Sem listagem de escalas por evento/equipe/freelancer** — só `GET /escalas/{id}`. Necessário para ETAPA 4 e para a visão do supervisor.
5. **Sem listagem de pontos** — só criação e aprovação. A visão de presentes/ausentes/atrasados da ETAPA 5 depende de um endpoint de leitura.
6. **Sem listagem de fechamentos por evento** — só `GET /fechamentos/{id}`.
7. **Sem contestação de fechamento** — existe o status `contestado`, mas não há endpoint para contestar (ETAPA 6).
8. **Pagamento**: os estados do backend são `pendente | agendado | executado | falhou`; o fluxo descrito pelo produto usa "processando" e "pago". Divergência de nomenclatura — o frontend exibirá os estados reais do backend com rótulos em português e a diferença fica registrada.
9. **Sem endpoint de aprovação financeira separada** — só `POST /pagamentos/{id}/agendar`.
10. **Sem endpoint de QR Code do evento** e sem upload de selfie (o schema de ponto aceita referência de foto, não o arquivo). A ser confirmado na ETAPA 5.
11. **Sem listagem de empresas/usuários** — a empresa atual precisará ser informada manualmente até existir autenticação.

## Detalhes técnicos

- `src/api/client.ts`: `request()` genérico, `ApiError` com `status`, `detail`, `kind: 'network' | 'cors' | 'http'`; base URL de `import.meta.env.VITE_API_BASE_URL`.
- `src/api/types.ts`: enums e DTOs derivados dos schemas Pydantic.
- `src/api/keys.ts`: chaves de query por entidade.
- `src/auth/`: `AuthProvider`, `useAuth`, `session.ts` (persistência em localStorage lida em `useEffect` para evitar mismatch de hidratação), `permissions.ts`.
- Todas as chamadas partem do cliente (browser) via TanStack Query; nada de server functions chamando a API, para manter uma única fonte de verdade e deixar o CORS explícito.
- Rotas TanStack em `src/routes/`, com `head()` próprio por rota.

## Ao final da ETAPA 1

Apresento: o que foi implementado, o resultado real do teste de conexão contra `VITE_API_BASE_URL`, a lista de endpoints ausentes acima e as dependências (CORS + listagens) a resolver antes da ETAPA 2. Não avanço sem sua validação.
