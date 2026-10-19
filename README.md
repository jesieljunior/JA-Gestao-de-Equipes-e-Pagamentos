# PayCrew — Plataforma B2B de Gestão de Equipes, Ponto Antifraude e Pagamentos Pix em Lote

> **SaaS corporativo de alta confiabilidade para agências de casting, promotores e produtoras de eventos.**  
> Desenvolvido em **TypeScript Full-Stack**, **TanStack Start**, **React**, **PostgreSQL (Supabase)** e integrado à **API Bancária do Asaas**.

---

## 📌 Visão Geral do Produto

Agências de eventos enfrentam desafios operacionais e fiscais críticos:
1. **Fraudes em ponto de campo:** freelancers que registram entrada sem estar no local ou compartilham links.
2. **Fechamento manual caótico:** conferência de horas, faltas e diárias em planilhas sujeitas a erros humanos.
3. **Confusão patrimonial e fiscal:** mistura entre o dinheiro recebido dos clientes contratantes (funding de diárias) e a margem de receita própria da agência.
4. **Fricção bancária:** pagamento individual manual via Pix de dezenas de profissionais ao término de cada evento.

O **PayCrew** resolve essas dores em um único sistema ponta a ponta:
- **Ponto Digital em Campo:** check-in/out via celular com leitura de QR Code rotativo com expiração automática, geofencing por GPS com raio de tolerância configurável e validação por selfie.
- **Fechamento Automatizado:** cálculo de horas trabalhadas, horas extras e valor líquido a pagar com conferência em tela única.
- **Tesouraria com Segregação Rígida de Saldos:** visão clara e isolada entre saldo real bancário, saldo aportado por clientes em custódia e faturamento da agência.
- **Repasses Pix em Lote:** integração com Asaas para liquidação automática e rastreamento em 30, 60 e 90 dias.

---

## 🚀 Arquitetura e Stack Tecnológica

| Camada | Tecnologia | Motivação da Escolha |
| :--- | :--- | :--- |
| **Full-Stack Framework** | [TanStack Start](https://tanstack.com/start) + [React](https://react.dev/) | SSR performante, type-safety de ponta a ponta e Server Functions executadas exclusivamente no servidor. |
| **Linguagem** | [TypeScript](https://www.typescriptlang.org/) | Tipagem estrita, interfaces de domínio consolidadas e zero tolerância a tipos soltos (`any`). |
| **Banco de Dados & Auth** | [PostgreSQL (Supabase)](https://supabase.com/) | Transações atômicas ACID, Row Level Security (RLS) multi-tenant e Stored Procedures para conciliação contábil. |
| **Estilização & UI** | [Tailwind CSS](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/) | Design system sóbrio, responsivo e com alta usabilidade operacional em dispositivos móveis e desktop. |
| **Gateway Bancário** | [Asaas API v3](https://docs.asaas.com/) | Emissão de cobranças Pix para contratantes, split de pagamentos e liquidação de Pix em lote. |
| **Testes Automatizados** | [Vitest](https://vitest.dev/) | 82 testes cobrindo regras de negócio, tesouraria, autorização RBAC e idempotência de webhooks. |

---

## 🏗️ Módulos Principais do Sistema

### 1. Ponto Eletrônico Antifraude (`/ponto/$token`)
- **QR Code Dinâmico e Rotativo:** o coordenador do evento projeta ou disponibiliza o QR Code no local. O token expira automaticamente 12 horas após o término do evento.
- **Geofencing (Cálculo Haversine):** a geolocalização do dispositivo do colaborador é validada contra as coordenadas do local do evento (tolerância máxima configurável de 300m a 1000m).
- **Selfie com Auditoria Humana:** registro de imagem capturada diretamente pela câmera para auditoria visual de identidade, com consentimento explícito e expiração/expurgo automático de conformidade (LGPD).
- **Sequência Estrita e Ordenada:** a máquina de estados impede batidas incorretas (`Entrada` ➔ `Início de Intervalo` ➔ `Fim de Intervalo` ➔ `Saída`).
- **Rate Limiting Antibruteforce:** proteção contra tentativas repetitivas de adivinhação de token ou CPF (limite de 20 tentativas por IP a cada 10 minutos).

### 2. Fechamento Operacional e Financeiro (`/fechamento` & `/operacao`)
- **Painel de Operação em Tempo Real:** supervisão ao vivo de quem está em campo, quem entrou com atraso e alertas de ponto fora de horário.
- **Aprovação Granular:** o supervisor ajusta horários, aceita ou contesta justificativas antes de fechar a folha.
- **Fechamento Atômico em Banco:** procedure SQL (`fechar_evento`) que valida ponto a ponto, calcula o total a pagar e cria as ordens de pagamento em lote sem risco de inconsistência.

### 3. Tesouraria Segregada e Gestão de Saldos (`/saldo`)
O modelo financeiro foi construído para evitar bitributação e confusão contábil:
- **Saldo Real em Conta:** total de liquidez real disponível na conta bancária para execução de lotes Pix.
- **Aportado por Clientes (Custódia):** recurso transferido pelo contratante do evento para cobrir as diárias dos freelancers.
- **Pendente de Entrar:** faturas e cobranças Pix emitidas para clientes com vencimento futuro.
- **Histórico Filtrável (30, 60 e 90 dias):** acompanhamento consolidado do volume de repasses e taxa de sucesso bancário.
- **Balanço Individual por Cliente:** tabela que audita quanto cada cliente colocou, quanto já foi repassado aos seus eventos e quanto ainda resta sob custódia.

### 4. Gestão Multi-Tenant e Controle de Acesso (RBAC)
Isolamento estrito entre agências através de Row Level Security (RLS) no PostgreSQL:
- **`admin`:** acesso irrestrito a configurações, planos, financeiro, eventos e equipe.
- **`coordenador`:** gestão completa de eventos, escalas e operação em campo.
- **`supervisor`:** restrito à supervisão da operação em tempo real e validação de pontos.
- **`financeiro`:** focado em tesouraria, aprovação de fechamentos, cobranças e relatórios fiscais.

---

## 🧪 Qualidade de Software e Cobertura de Testes

O projeto conta com **82 testes automatizados** rodando com 100% de aprovação no Vitest:

```bash
✓ src/routes/_authenticated/financeiro-fechamento.test.ts (6 tests)
✓ src/routes/_authenticated/cadastros.test.ts (5 tests)
✓ src/routes/_authenticated/saldo.test.ts (3 tests)
✓ src/routes/_authenticated/eventos.test.ts (5 tests)
✓ src/routes/_authenticated/operacao.test.ts (3 tests)
✓ src/routes/_authenticated/configuracoes-plano.test.ts (3 tests)
✓ src/routes/_authenticated/plataforma-admin-suporte.test.ts (4 tests)
✓ src/routes/_authenticated/painel-onboarding.test.ts (2 tests)
✓ src/routes/_authenticated/fiscal-relatorios.test.ts (3 tests)
✓ src/routes/ponto.$token.test.ts (5 tests)
✓ src/routes/api/routes.test.ts (3 tests)
✓ src/lib/autorizacao.test.ts (10 tests)
✓ src/lib/auth-navigation.test.ts (11 tests)
✓ src/lib/tesouraria.test.ts (3 tests)
✓ src/lib/fechamento.test.ts (4 tests)
✓ src/lib/cobranca-v2.test.ts (6 tests)
✓ src/lib/webhook-idempotencia.test.ts (2 tests)
✓ src/lib/folha-clt.test.ts (2 tests)
✓ src/lib/moeda.test.ts (2 tests)

Test Files  19 passed (19)
     Tests  82 passed (82)
```

---

## 💻 Como Rodar o Projeto Localmente

### Pré-requisitos
- **Node.js** v20+ ou v22+
- Gerenciador de pacotes **npm** ou **bun**

### Instalação
```bash
# 1. Clone o repositório
git clone https://github.com/jesieljunior/pagmini.git
cd pagmini

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env
```

### Variáveis de Ambiente Necessárias (`.env`)
```ini
# Supabase (Banco de Dados e Auth)
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role

# Asaas (Gateway Bancário e Pix)
ASAAS_API_KEY=sua-chave-api-asaas
ASAAS_ENVIRONMENT=sandbox # ou "producao"
ASAAS_WEBHOOK_SECRET=token-secreto-configurado-no-asaas

# Segurança e Cron
CRON_SECRET=chave-secreta-para-disparar-crons
```

### Executar em Desenvolvimento
```bash
npm run dev
# Acesse no navegador: http://localhost:3000
```

### Executar Testes e Validação
```bash
# Rodar todos os testes unitários e de integração
npm run test

# Verificar formatação e análise estática de código
npm run lint

# Compilar para produção
npm run build
```

---

## 🚢 Deploy em Produção

O projeto foi desenhado para deploy contínuo na **Vercel** ou **Cloud Run**:
1. Conecte o repositório GitHub na **Vercel**.
2. O framework preset é reconhecido automaticamente (**TanStack Start**).
3. Adicione as variáveis de ambiente de produção no painel da Vercel.
4. Configure o apontamento CNAME do seu domínio corporativo (ex: `app.swali.com.br`).
5. Cadastre o webhook no painel do Asaas apontando para:  
   `https://app.swali.com.br/api/public/webhooks/asaas`

---

## 📄 Licença e Propriedade

Desenvolvido para **Swali Soluções / PayCrew**. Todos os direitos reservados.
