# Arquitetura Técnica Detalhada — Já | Gestão de Equipes e Pagamentos

Este documento detalha as decisões de engenharia, os fluxos de dados, os padrões de segurança, a divisão de responsabilidades entre banco e ORM, e a modelagem matemática e relacional da plataforma **Já — Gestão de Equipes e Pagamentos**.

---

## 1. Visão Arquitetural e Topologia de Componentes

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT-SIDE (SPA)                                 |
|                                                                                   |
|   +-----------------------+   +-----------------------+   +-------------------+   |
|   |    Painel Operação    |   |  Operação & Escalas   |   | Ponto em Campo    |   |
|   |       (/painel)       |   | (/operacao, /eventos) |   |  (/ponto/$token)  |   |
|   +-----------------------+   +-----------------------+   +-------------------+   |
|               |                           |                         |             |
|   +-----------------------+   +-----------------------+             |             |
|   |  Tesouraria & Saldo   |   |   Fechamento & Pix    |             |             |
|   | (/financeiro, /saldo) |   | (/fechamentos, /pix)  |             |             |
|   +-----------------------+   +-----------------------+             |             |
+---------------------------------------------------------------------|-------------+
                                        |                             |
                           HTTP / TanStack Server Functions           |
                                        |                             |
+---------------------------------------v-----------------------------v-------------+
|                            BACKEND (TanStack Start / SSR)                         |
|                                                                                   |
|   - Middleware de Autorização e Contexto de Organização (empresa_atual)           |
|   - Validação de Schemas de Entrada (Zod)                                         |
|   - Rate Limiter e Antibruteforce (limitarTentativas)                             |
|   - Motor de Regras de Negócio e Cálculos Contábeis (/src/lib)                    |
|   - Webhook Handler com Idempotência Transacional (/api/public/webhooks/asaas)    |
+-----------------------------------------------------------------------------------+
                        |                                       |
         PostgreSQL Connection / RPC                 REST API (HTTPS)
                        |                                       |
+-----------------------v-----------------------+  +------------v--------------------+
|             POSTGRESQL (Supabase)             |  |         GATEWAY ASAAS           |
|                                               |  |       (Ambiente Sandbox)        |
|  - Multi-tenant via Row Level Security (RLS)  |  |  - Emissão de QR Code Pix       |
|  - Stored Procedures Atômicas:                |  |  - Webhook de Liquidação        |
|      * fechar_evento                          |  |  - Envio de Pix em Lote         |
|      * saldo_empresa                          |  |  - Notificações de Estorno      |
|      * abrir_ciclo_cobranca                   |  +---------------------------------+
|  - Auditoria de Pontos, GPS e Selfies         |
+-----------------------------------------------+
```

---

## 2. Divisão de Responsabilidades: Drizzle ORM vs. Supabase (PostgreSQL)

O projeto adota uma arquitetura híbrida intencional entre **PostgreSQL gerenciado (Supabase)** e **Drizzle ORM**:

| Dimensão | Supabase (PostgreSQL 15+) | Drizzle ORM |
| :--- | :--- | :--- |
| **Papel Principal** | **Runtime Engine & Fonte da Verdade** | **Schema as Code & Type-Safety** |
| **Localização** | `supabase/migrations/`, `supabase/schema_completo.sql` | `drizzle/schema.ts`, `drizzle/migrations/` |
| **Segurança e RLS** | Executa políticas de Row Level Security (`empresa_atual()`), isolamento multi-tenant e controle de privilégios. | Não executa RLS; reflete colunas de segurança e auditoria no schema tipado. |
| **Autenticação** | Fornece infraestrutura GoTrue (`auth.users`, tokens JWT e sessões de usuário). | Não gerencia auth; referencia chaves estrangeiras (`auth.users.id`). |
| **Camada de Aplicação** | Executa Stored Procedures ACID, triggers de atualização e regras de consistência transacional. | Oferece interfaces TypeScript estritas consumidas pelas Server Functions e rotas TanStack. |
| **Migrações e Deploy** | Migrações aplicadas no cluster de produção via Supabase CLI / pipeline de banco. | Migrações locais versionadas para testes, documentação de esquema e DDL declarativo. |

---

## 3. Segurança Multi-Tenant e Modelo de Isolamento

### 3.1. Princípio do Isolamento por Tenant
Toda tabela que armazena dados de negócio (`eventos`, `escalas`, `pontos`, `fechamentos`, `cobrancas`, `pagamentos`, `movimentos_saldo`) possui a coluna `empresa_id uuid NOT NULL`.

A política RLS garante que o usuário autenticado só possa consultar ou modificar linhas cujo `empresa_id` corresponda ao retorno de `public.empresa_atual()`:
```sql
CREATE POLICY "tenant_isolation_select" ON public.eventos
  FOR SELECT USING (empresa_id = public.empresa_atual());
```

### 3.2. Prevenção de Acesso Cruzado e IDOR
Mesmo que um operador tente forjar o UUID de um evento ou colaborador pertencente a outro tenant em uma requisição, a consulta de banco filtra silenciosamente o registro por `empresa_id`, retornando resultado nulo ou erro de não encontrado.

### 3.3. Sessões de Suporte Auditadas (Fail-Closed)
- Operadores com perfil `suporte` não possuem acesso irrestrito aos dados dos clientes.
- O acesso de leitura a uma empresa específica exige uma sessão ativa registrada na tabela `sessoes_suporte`, vinculada ao ticket do cliente e com expiração temporal.
- Qualquer endpoint financeiro (movimentação de fundos, emissão de Pix) bloqueia chamadas vindas de perfil `suporte`.

---

## 4. Antifraude no Ponto Eletrônico Mobile (`/ponto/$token`)

```
+-------------------------------------------------------------------------------------+
| Colaborador acessa /ponto/$token pelo celular                                       |
+-------------------------------------------------------------------------------------+
                                       |
                        1. Valida expiração do QR Code
                           (Token do evento válido até 12h após o término)
                                       |
                                       v
                        2. Valida Geolocalização por GPS
                           (Cálculo Haversine: distância <= raio configurado de 300m a 1000m)
                                       |
                                       v
                        3. Captura Selfie para Auditoria Humana
                           (Registro fotográfico com consentimento explícito e expurgo LGPD)
                                       |
                                       v
                        4. Valida Sequência da Máquina de Estados
                           (Entrada ➔ Início Intervalo ➔ Fim Intervalo ➔ Saída)
                                       |
                                       v
                        5. Rate-limiting Antibruteforce
                           (Máximo 20 requisições por IP a cada 10 minutos)
                                       |
                                       v
                    Registro Persistido com Evidências de Auditoria
```

---

## 5. Webhooks e Idempotência de Pagamentos Asaas

Para evitar problemas de duplo crédito, concorrência de rede ou processamento de requisições fora de ordem:

```
[ Notificação Asaas ] ➔ [ Validação de Header 'asaas-access-token' ]
                                     |
                                     v
                        [ Cálculo de Hash Idempotente ]
              (asaas-webhook:{evento}:{paymentId}:{transferId}:{valor})
                                     |
                                     v
                     [ Consulta em 'webhook_eventos' ]
                                     |
         +---------------------------+---------------------------+
         |                                                       |
         v (Já existe)                                           v (Novo evento)
  [ Retorna HTTP 200 OK ]                               [ Abre Transação ACID ]
  (Sem reprocessar crédito)                                      |
                                                - Atualiza status da cobrança
                                                - Credita saldo no extrato
                                                - Libera funding do cliente
                                                - Insere em 'webhook_eventos'
                                                                 |
                                                                 v
                                                        [ Retorna HTTP 200 OK ]
```

---

## 6. Estrutura de Diretórios do Código-Fonte

```
/
├── .github/
│   └── workflows/ci.yml       # Pipeline de CI (lint, typecheck, test, build)
├── drizzle/                   # Schemas DDL declarativos e migrações tipadas
│   ├── migrations/            # Histórico de alterações DDL versionadas
│   └── schema.ts              # Definição TypeScript das tabelas e relacionamentos
├── supabase/                  # Configurações do Supabase e migrações SQL
│   ├── migrations/            # Migrações SQL executadas no cluster Supabase
│   └── schema_completo.sql    # DDL consolidado com funções e políticas RLS
├── scripts/                   # Utilitários operacionais e auditoria de segurança
│   ├── scan-secrets.mjs       # Varredura de segredos e PII (LGPD)
│   └── create-test-users.mjs  # Provisionamento de usuários sintéticos de homologação
├── docs/                      # Documentação técnica e relatórios de auditoria
│   ├── AUDITORIA_TECNICA.md   # Matriz de rastreabilidade e auditoria de código
│   └── TESTES.md              # Relação de suítes de testes e guia de execução
├── src/
│   ├── components/            # Design system e componentes visuais (Radix / Tailwind)
│   │   ├── ui/                # Componentes base (Button, Card, Input, Table, Badge, etc.)
│   │   └── app-shell.tsx      # Shell autenticado com sidebar responsiva e perfil
│   ├── hooks/                 # Hooks de estado, dados e sessão
│   ├── integrations/
│   │   └── supabase/          # Clientes Supabase tipados (client e server)
│   ├── lib/                   # Núcleo de domínio e Server Functions (@tanstack/react-start)
│   │   ├── auth.functions.ts  # Autenticação e perfil
│   │   ├── cobranca.functions.ts # Faturamento de planos SaaS e precificação imutável
│   │   ├── fechamento.ts      # Cálculo de horas, diárias e adicionais
│   │   ├── tesouraria.ts      # Segregação contábil (funding em custódia vs receita)
│   │   ├── webhook-idempotencia.ts # Idempotência e dedup de webhooks
│   │   └── ponto.functions.ts # Validações de ponto e máquina de estados
│   └── routes/                # Rotas baseadas em arquivo pelo TanStack Router
│       ├── _authenticated/    # Rotas protegidas da agência (Painel, Eventos, Financeiro, etc.)
│       ├── api/               # Webhooks e rotas públicas de integração
│       ├── ponto.$token.tsx   # Ponto eletrônico mobile público com selfie e GPS
│       └── __root.tsx         # Raiz com metatags e providers globais
├── Dockerfile                 # Imagem de produção containerizada
├── docker-compose.yml         # Orquestração local para desenvolvimento e testes
├── package.json               # Gerenciador de dependências padronizado em npm
└── vitest.config.ts           # Configuração de testes automatizados com Vitest
```
