# PayCrew — saldo self-service e três portais

## 1. Por que o aporte falhou

O erro registrado nas duas tentativas foi: _"A chave de API informada não pertence a este ambiente"_. A chave cadastrada é de produção, mas o app está apontando para o ambiente de teste do Asaas. Correção: trocar o ambiente para produção. Nada mais precisa mudar na integração.

## 2. A agência coloca saldo sozinha

Hoje só existe um formulário de "cobrança" com vencimento, cliente e descrição — burocrático demais. Vira uma tela simples:

- Botão **Adicionar saldo** no Financeiro e no Painel.
- A agência digita (ou escolhe) o valor: R$ 200 / 500 / 1.000 / outro.
- Escolhe **Pix, cartão de crédito, cartão de débito ou boleto**.
- Pix: aparece o QR Code e o "copia e cola" na hora.
- Cartão/boleto: abre a página de pagamento segura do Asaas.
- Assim que o pagamento é confirmado (aviso automático do Asaas ou botão "Já paguei, conferir"), o saldo entra sozinho, já com a taxa da PayCrew descontada.
- Histórico de recargas com status e comprovante.

A cobrança emitida para o cliente final do evento continua existindo, mas vai para uma aba separada, sem se misturar com a recarga da agência.

## 3. A agência não mexe mais no preço

Na tela de Configurações, o bloco de plano vira **somente leitura**: mostra o plano atual, a taxa, a mensalidade, se está em teste grátis e até quando. Quem altera isso é só você, no portal master.

## 4. Três portais

**Portal da agência (o que já existe)** — eventos, equipes, freelancers, ponto, fechamento, saldo e pagamentos. Sem acesso a preço, a outras agências ou a dados da plataforma.

**Painel de suporte (`/suporte`)** — para seu funcionário:

- lista de agências com saldo, plano e situação;
- busca de evento, cobrança ou pagamento de qualquer agência;
- pode reenviar um Pix que falhou e reconferir uma cobrança;
- não altera plano, preço, cupom nem cadastro de agência.

**Portal master (`/admin`)** — só você:

- **Agências**: plano, teste grátis (liberar/estender), bloquear/liberar, taxa e mensalidade específicas quando quiser fugir do plano;
- **Planos**: criar e editar Free / Pro / Enterprise com percentual, taxa por Pix e mensalidade;
- **Cupons**: código, desconto (% ou valor), validade, limite de uso e a quem se aplica;
- **Receita**: quanto a PayCrew faturou por período, por agência e por modelo;
- **Suporte**: quem pode entrar no painel de suporte.

## 5. Detalhes técnicos

Banco (uma migração):

- `planos` (nome, percentual, taxa fixa Pix, mensalidade, ativo);
- `cupons` (código, tipo, valor, validade, usos, empresa opcional);
- `assinaturas` por empresa (plano, trial_ate, cupom, status, overrides de percentual/mensalidade);
- `plataforma_usuarios` + enum `papel_plataforma` (`admin_master`, `suporte`) e função `tem_papel_plataforma()` `security definer` — papéis de plataforma ficam fora de `user_roles`, que é por agência;
- RLS: agência lê só a sua assinatura (sem update de preço); `planos`/`cupons`/`assinaturas` só escrevem com `admin_master`; políticas de leitura cruzada para `suporte`; grants para `authenticated`/`service_role`.

Preço efetivo passa a ser resolvido no servidor por `assinatura + plano + cupom`, substituindo a leitura direta de `configuracoes.percentual_plataforma` em `financeiro.functions.ts`; `configuracoes` mantém só as regras operacionais (selfie, GPS, confirmação).

Server functions novas em `src/lib/`: `iniciarRecarga` (cria a cobrança Asaas com `billingType` conforme o método, devolve QR/copia-e-cola/link), `conferirRecarga`; `admin.functions.ts` (planos, cupons, trial, override) e `suporte.functions.ts` (busca cross-tenant, reprocessar Pix), todas com verificação de papel de plataforma antes de qualquer escrita.

Rotas: `src/routes/_authenticated/saldo.tsx`, `admin.*` e `suporte.*`, com o menu lateral montado a partir dos papéis de plataforma.

Ambiente: `ASAAS_ENVIRONMENT` passa para `producao` — cobranças reais a partir daí.
