# Já — Gestão de Equipes e Pagamentos

[![CI](https://github.com/seu-usuario/ja-gestao/actions/workflows/ci.yml/badge.svg)](https://github.com/seu-usuario/ja-gestao/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![TanStack Start](https://img.shields.io/badge/TanStack_Start-1.121-orange.svg)](https://tanstack.com/start)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_RLS-3ecf8e.svg)](https://supabase.com/)
[![Tests](https://img.shields.io/badge/Tests-99_passing-brightgreen.svg)](docs/TESTES.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Plataforma B2B em desenvolvimento para gestão operacional de equipes, folha de ponto digital em campo com selfie e geofencing, fechamento de escalas e conciliação de repasses Pix validados em ambiente sandbox.**  
> Desenvolvido em **TypeScript Full-Stack**, **TanStack Start**, **React 19**, **PostgreSQL gerenciado (Supabase)** e **Drizzle ORM**.

---

## 📌 Visão Geral do Produto

Agências de casting, produtoras de eventos e empresas de terceirização enfrentam desafios operacionais e fiscais críticos no dia a dia:

1. **Fraudes em ponto de campo:** colaboradores que registram entrada sem estar no local ou compartilham links.
2. **Fechamento manual caótico:** conferência de horas, intervalos e diárias em planilhas manuais sujeitas a falhas.
3. **Confusão patrimonial e fiscal:** mistura entre os adiantamentos recebidos dos clientes contratantes (*funding* em custódia de diárias) e a margem de receita própria da agência.
4. **Fricção bancária:** repasses individuais manuais via Pix para dezenas de profissionais ao término de cada escala.

A plataforma **Já** atua em um fluxo operacional unificado:
- **Ponto Digital em Campo:** check-in/out via celular do colaborador com leitura de QR Code dinâmico (expiração em 12h), geofencing por GPS (cálculo Haversine) e registro de selfie para conferência humana pelo supervisor.
- **Fechamento Operacional:** apuração de horas trabalhadas, horas extras e valor líquido com conferência em tela única e aprovação pelo coordenador.
- **Tesouraria com Segregação de Saldos:** separação contábil clara e isolada entre saldo real bancário, saldo aportado por clientes em custódia (*funding*) e receita de agência.
- **Repasses Pix e Webhooks:** integração com gateway bancário (Asaas em ambiente sandbox) com idempotência transacional contra duplicidade de créditos.

---

## 🚀 Arquitetura e Stack Tecnológica

| Camada | Tecnologia | Papel no Projeto |
| :--- | :--- | :--- |
| **Full-Stack Framework** | [TanStack Start](https://tanstack.com/start) + [React 19](https://react.dev/) | SSR performante, type-safety de ponta a ponta e Server Functions executadas no servidor. |
| **Linguagem** | [TypeScript](https://www.typescriptlang.org/) | Tipagem estrita com modo estrito de propriedades (`exactOptionalPropertyTypes`). |
| **Banco de Dados & Auth** | [PostgreSQL (Supabase)](https://supabase.com/) | Runtime de produção, Row Level Security (RLS) multi-tenant e autenticação GoTrue. |
| **Schema as Code** | [Drizzle ORM](https://orm.drizzle.team/) | Definição declarativa de schemas (`drizzle/schema.ts`), migrações e tipagem de domínio. |
| **Estilização & UI** | [Tailwind CSS 4](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/) | Design system sóbrio e responsivo construído para alta densidade de informação operacional. |
| **Gateway de Pagamento** | [Asaas API v3 (Sandbox)](https://docs.asaas.com/) | Cobranças Pix e liquidações testadas em ambiente controlado de homologação. |
| **Testes Automatizados** | [Vitest](https://vitest.dev/) | 22 suítes e 99 testes cobrindo multi-tenancy, idempotência, tesouraria e regras de ponto. |

---

## 🗄️ Divisão de Papéis: Drizzle ORM vs. Supabase (PostgreSQL)

O projeto divide intencionalmente as responsabilidades de banco de dados:

- **Supabase (PostgreSQL 15+):** É o **motor de execução em tempo real** e a **fronteira de segurança**. Executa as políticas de Row Level Security (RLS) que garantem isolamento estrito entre empresas (`empresa_atual()`), controla autenticação, sessões e gatilhos atômicos de conciliação.
- **Drizzle ORM:** Atua como **Schema-as-Code** e **gerador de tipagem**. Centralizado em `drizzle/schema.ts`, mantém o modelo relacional tipado em TypeScript para consumo seguro pelas Server Functions, sem sobrecarga de queries lentas ou camadas ORM pesadas em runtime.

---

## 📋 Status de Funcionalidades (Implementado vs. Planejado)

Para máxima transparência técnica, o estado de cada capacidade do sistema é catalogado abaixo (conforme detalhado em [`roadmap.md`](roadmap.md)):

| Módulo / Funcionalidade | Status | Detalhes |
| :--- | :---: | :--- |
| **Isolamento Multi-Tenant Estrito** | ✅ Implementado | RLS em todas as tabelas de negócio; comprovado por testes automatizados de cross-tenant. |
| **Ponto Mobile Antifraude** | ✅ Implementado | QR Code com expiração de 12h, tolerância GPS Haversine e selfie para auditoria do supervisor. |
| **Máquina de Estados de Marcações** | ✅ Implementado | Sequência estrita `Entrada ➔ Início Intervalo ➔ Fim Intervalo ➔ Saída`; rejeição de duplicatas. |
| **Segregação de Saldos em Tesouraria** | ✅ Implementado | Separação contábil entre adiantamento de clientes (*funding* em custódia) e receita própria. |
| **Faturamento SaaS V2** | ✅ Implementado | Planos por participações deduplicadas com precificação imutável congelada por ciclo. |
| **Ingestão Idempotente de Webhooks** | ✅ Implementado | Tabela `webhook_eventos` com hash determinístico e proteção contra duplo crédito. |
| **Perfis e Acesso Suporte Auditado** | ✅ Implementado | RBAC (`admin`, `coordenador`, `suporte`, `master`); suporte falha fechado sem ticket ativo. |
| **Repasses Pix em Sandbox** | ✅ Implementado | Fluxo de disparo de Pix homologado e simulado em ambiente Asaas Sandbox. |
| **Validação Cadastral Frela vs CLT** | ✅ Implementado | Validações fiscais de CPF, PIS, chave Pix e separação de rotinas de cálculo. |
| **Suíte de Testes Automatizados** | ✅ Implementado | 22 arquivos de teste e 99 testes automatizados com 100% de aprovação no Vitest. |
| **Pipeline de Integração Contínua (CI)** | ✅ Implementado | GitHub Actions com lint, typecheck, varredura de segredos e execução de testes. |
| **Containerização Docker** | ✅ Implementado | `Dockerfile` multi-stage com usuário não-root e `docker-compose.yml` para ambiente local. |
| **Validação em Ambiente Publicado** | 🔄 Em Andamento | Testes integrados com preview final e homologação de sessão de suporte. |
| **Rotina Automática de Expurgo LGPD** | 🔄 Em Andamento | Cron job para limpeza física de fotos de selfie após expiração do período de retenção. |
| **Split Nativo de Pagamentos** | 📋 Planejado | Divisão automática de recebíveis entre agência e múltiplos prestadores no gateway. |
| **Transição de Gateway (Mercado Pago)** | 📋 Planejado | Homologação de conta agregada com checkout transparente para novas agências. |
| **Rastreamento em 30/60/90 Dias** | 📋 Planejado | Painel estendido de projeção de fluxo de caixa e provisionamento de diárias a longo prazo. |

---

## 🛠️ Como Executar Localmente

### Pré-requisitos
- **Node.js 22+**
- **npm** (gerenciador oficial padronizado do projeto)

### 1. Clonar o Repositório
```bash
git clone https://github.com/seu-usuario/ja-gestao.git
cd ja-gestao
```

### 2. Instalar Dependências
```bash
npm install
```

### 3. Configurar Variáveis de Ambiente
Copie o arquivo de exemplo e preencha com suas credenciais de sandbox/desenvolvimento:
```bash
cp .env.example .env
```

### 4. Executar em Modo de Desenvolvimento
```bash
npm run dev
# Acesse no navegador: http://localhost:3000
```

### 5. Executar com Docker
```bash
docker compose up --build
```

---

## 🧪 Qualidade, Segurança e Testes

A integridade do código é mantida através de comandos padronizados:

```bash
# Executar todos os 99 testes automatizados (Vitest)
npm run test

# Verificação estática de tipos (TypeScript)
npm run typecheck

# Análise de padrões de código (ESLint)
npm run lint

# Varredura de segredos e conformidade com LGPD
npm run scan:secrets

# Compilar para produção
npm run build
```

---

## 🚢 Como Implantar

O projeto pode ser implantado em qualquer provedor com suporte a Node.js ou contêineres Docker (ex: Vercel, Cloud Run, Render, VPS):

1. Conecte o repositório no seu provedor de nuvem.
2. Defina o comando de build como `npm run build` e o comando de start como `npm run preview` (ou execute a imagem `Dockerfile`).
3. Configure as variáveis de ambiente descritas em `.env.example` no painel do provedor:
   - `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ASAAS_API_KEY`, `ASAAS_ENVIRONMENT=sandbox` e `ASAAS_WEBHOOK_TOKEN`
4. Aponte o domínio corporativo (ex: `app.seudominio.com.br`) via registro DNS.
5. Cadastre o webhook no painel do gateway apontando para:
   `https://app.seudominio.com.br/api/public/webhooks/asaas`

---

## 🔒 Segurança, LGPD e Auditoria de Segredos

- **Isolamento de Tenants:** O acesso a dados é blindado por RLS no banco de dados. Um tenant nunca consegue visualizar ou alterar registros de outra empresa.
- **Conformidade LGPD:** As fotos de ponto são utilizadas exclusivamente para conferência humana de identidade, coletadas com consentimento explícito e sujeitas a política de retenção temporal.
- **Zero Segredos no Código:** O repositório é auditado pelo script `scripts/scan-secrets.mjs`, garantindo que chaves privadas, senhas reais e CPFs verdadeiros nunca sejam comitados.

---

## 📄 Titularidade e Licença

**Já — Gestão de Equipes e Pagamentos** é um projeto próprio de plataforma SaaS B2B desenvolvido por engenharia de software independente.  
Distribuído sob a licença [MIT](LICENSE).
