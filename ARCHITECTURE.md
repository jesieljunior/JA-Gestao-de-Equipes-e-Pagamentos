# Arquitetura Técnica Detalhada — PayCrew

Este documento detalha as decisões de engenharia, os fluxos de dados, os padrões de segurança e a modelagem matemática e relacional do **PayCrew**.

---

## 1. Visão Arquitetural e Topologia de Componentes

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT-SIDE (SPA)                                 |
|                                                                                   |
|   +-----------------------+   +-----------------------+   +-------------------+   |
|   |   Painel Executivo    |   |  Operação & Escalas   |   | Ponto em Campo    |   |
|   |       (/painel)       |   | (/operacao, /eventos) |   |  (/ponto/$token)  |   |
|   +-----------------------+   +-----------------------+   +-------------------+   |
|               |                           |                         |             |
|   +-----------------------+   +-----------------------+             |             |
|   |  Tesouraria & Saldo   |   |   Fechamento & Pix    |             |             |
|   |        (/saldo)       |   | (/fechamento, /finan) |             |             |
|   +-----------------------+   +-----------------------+             |             |
+---------------------------------------------------------------------|-------------+
                                       |                              |
                          HTTP / TanStack Server Functions            |
                                       |                              |
+--------------------------------------v------------------------------v-------------+
|                            BACKEND (TanStack Start / SSR)                         |
|                                                                                   |
|   - Middleware de Autorização e Contexto de Organização (requireOrganizationContext) |
|   - Validação de Schemas de Entrada (Zod)                                         |
|   - Rate Limiter e Antibruteforce (limitarTentativas)                             |
|   - Motor de Regras de Negócio e Cálculos Contábeis (/src/lib)                    |
|   - Webhook Handler com Idempotência Transacional (/api/public/webhooks/asaas)    |
+-----------------------------------------------------------------------------------+
                       |                                       |
        PostgreSQL Connection / RPC                 REST API (HTTPS)
                       |                                       |
+----------------------v-----------------------+  +------------v--------------------+
|             POSTGRESQL (Supabase)            |  |         GATEWAY ASAAS           |
|                                              |  |                                 |
|  - Multi-tenant via Row Level Security (RLS) |  |  - Emissão de QR Code Pix       |
|  - Stored Procedures Atômicas:               |  |  - Webhook de Liquidação        |
|      * fechar_evento                         |  |  - Envio de Pix em Lote         |
|      * saldo_empresa                         |  |  - Notificações de Estorno      |
|      * abrir_ciclo_cobranca                  |  +---------------------------------+
|  - Auditoria de Pontos e Selfies             |
+----------------------------------------------+
```

---

## 2. Máquina de Estados: Ponto Eletrônico em Campo

O registro de ponto em eventos foi projetado para **eliminar fraudes presenciais** sem exigir a instalação de aplicativos pesados nos celulares dos colaboradores:

```
                  [ Início do Evento ]
                           |
             (Gera QR Code com Token Dinâmico)
                           |
                           v
               [ Freelancer lê QR Code ]
                           |
                           v
              Validação de Token e Validade
                (Expira em Término + 12h)
                           |
                           v
             Validação de Geolocalização (GPS)
             (Haversine: Distância <= Raio Max)
                           |
                           v
        Captura de Selfie com Consentimento Explícito
                           |
                           v
            Sequência Rígida de Marcações:
       [Entrada] ➔ [Início Intervalo] ➔ [Fim Intervalo] ➔ [Saída]
                           |
                           v
       Registro Gravado + Auditoria para Supervisor
```

### Regras de Validação:
1. **Ordem Estrita:** Uma `saida` só pode ser registrada se houver uma `entrada`. Um `fim_intervalo` só pode ser registrado após um `inicio_intervalo`.
2. **Cálculo de Distância Geográfica:**
   A distância entre as coordenadas do colaborador e as coordenadas oficiais do evento é calculada no servidor usando a fórmula de **Haversine**:
   $$d = 2R \cdot \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$
3. **Expurgo Automático de Selfies:**
   As imagens são tratadas como evidência de auditoria humana temporária (e não biometria proprietária permanente), com rotina de expurgo programado para estrita conformidade com a LGPD.

---

## 3. Modelo Contábil: Segregação de Tesouraria e Custódia

Para evitar confusão patrimonial e riscos fiscais, o sistema separa categoricamente:

### A. Saldo em Custódia (Funding de Clientes)
* **Entrada:** Cobranças Pix emitidas para o cliente contratante com `tipo = 'cobranca_cliente'`.
* **Natureza Jurídica:** Recurso de terceiros retido temporariamente para pagamento exclusivo das diárias acordadas.
* **Fórmula de Balanço por Cliente:**
  $$\text{Saldo em Custódia} = \sum \text{Aportes Pagos} - \sum \text{Repasses Pix Executados}$$

### B. Saldo Real em Conta
* O montante líquido total disponível na conta corrente/gateway Asaas:
  $$\text{Saldo Real} = \text{saldo\_empresa(empresa\_id)}$$

### C. Margem Líquida da Agência
* A diferença positiva entre o que está disponível na conta e as obrigações imediatas de custódia com os eventos:
  $$\text{Disponível Próprio} = \text{Saldo Real} - \sum \text{Custódia de Clientes}$$

### D. Janelas Temporais de Repasse Pix
O módulo `/src/lib/tesouraria.ts` calcula em tempo real o volume de repasses executados nas faixas de **30, 60 e 90 dias**, permitindo à diretoria financeira prever fluxo de caixa e histórico de pontualidade.

---

## 4. Idempotência e Resiliência de Webhooks

A rota `/api/public/webhooks/asaas` processa notificações bancárias de pagamentos recebidos e transferências executadas:

```
[ Notificação Asaas ] ➔ [ Validação de Assinatura ] ➔ [ Checagem de Evento Já Processado ]
                                                                     |
                     +-----------------------------------------------+
                     |
                     v (Não processado)
        [ Inicia Transação em Banco ]
                     |
         - Atualiza status da cobrança para 'pago'
         - Credita o saldo do cliente/evento
         - Registra log de auditoria idempotente
                     |
                     v
           [ Retorna HTTP 200 OK ]
```

Se o Asaas reenviar a mesma notificação (por timeout ou retry de rede), o sistema detecta o hash da notificação e responde `200 OK` imediatamente sem duplicar o crédito de saldo nem processar pagamentos repetidos.

---

## 5. Matriz de Permissões RBAC (Role-Based Access Control)

Todas as rotas autenticadas validam permissões através de `src/lib/dominio.ts`:

| Capacidade | `admin` | `coordenador` | `supervisor` | `financeiro` |
| :--- | :---: | :---: | :---: | :---: |
| **`eventos.gerenciar`** | ✅ | ✅ | ❌ | ❌ |
| **`operacao.supervisionar`** | ✅ | ✅ | ✅ | ❌ |
| **`cadastros.gerenciar`** | ✅ | ❌ | ❌ | ❌ |
| **`financeiro.gerenciar`** | ✅ | ❌ | ❌ | ✅ |
| **`relatorios.ver`** | ✅ | ✅ | ❌ | ✅ |
| **`configuracoes.gerenciar`** | ✅ | ❌ | ❌ | ❌ |

---

## 6. Estrutura de Diretórios do Código-Fonte

```
/
├── src/
│   ├── components/            # Componentes visuais desacoplados e acessíveis (Radix/Tailwind)
│   │   ├── ui/                # Botões, diálogos, tabelas, inputs e cards
│   │   └── app-shell.tsx      # Layout mestre com barra de navegação responsiva
│   ├── hooks/                 # Hooks de sessão e autorização (useSessao)
│   ├── integrations/
│   │   └── supabase/          # Cliente Supabase tipado, middleware de auth e types gerados
│   ├── lib/                   # Núcleo de domínio e funções de negócio (puro TypeScript)
│   │   ├── tesouraria.ts      # Fórmulas de custódia, saldo real e períodos 30/60/90 dias
│   │   ├── ponto.functions.ts # Server Functions de registro de ponto com validação
│   │   ├── fechamento.ts      # Algoritmo de cálculo de horas e fechamento de equipe
│   │   ├── asaas.server.ts    # Cliente HTTP server-side para API do Asaas
│   │   └── dominio.ts         # Tipos de dados universais e matriz de permissões RBAC
│   └── routes/                # Sistema de rotas baseadas em arquivo (TanStack Router)
│       ├── _authenticated/    # Rotas protegidas (Painel, Eventos, Saldo, Clientes, etc.)
│       ├── api/               # Endpoints REST e Webhooks de integração externa
│       ├── ponto.$token.tsx   # Folha de ponto eletrônico pública do colaborador
│       ├── auth.tsx           # Tela de autenticação e recuperação de conta
│       └── index.tsx          # Landing page institucional
└── vitest.config.ts           # Configuração de suíte de testes unitários e de integração
```
