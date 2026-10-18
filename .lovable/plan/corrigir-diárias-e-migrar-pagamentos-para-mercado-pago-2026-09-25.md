# Corrigir diárias e migrar pagamentos para Mercado Pago

## Resultado esperado

- Valores de diária como `R$ 5,00` e `R$ 3,00` chegam corretamente ao fechamento e ao financeiro.
- Diária paga o valor combinado mesmo sem entrada/saída completas, mas o fechamento exibe alerta e oferece correção antes da aprovação.
- Novas cobranças usam Mercado Pago dentro da PayCrew, com uma conta conectada por agência.
- Cobranças e repasses antigos do Asaas continuam consultáveis e reconciliáveis, sem misturar identificadores dos dois provedores.

## 1. Corrigir o valor da diária

- Criar uma única função de moeda brasileira para aceitar número, `5,00`, `R$ 5,00` e separadores de milhar, rejeitando valor inválido em vez de assumir zero.
- Aplicá-la no cadastro e substituição de escalas, cobranças, recargas e demais campos monetários envolvidos.
- Corrigir a regra de fechamento:
  - `diária`: sempre usa o valor combinado da escala;
  - `hora`: continua dependendo das horas apuradas;
  - pontos ausentes, pendentes ou inconsistentes geram aviso, sem zerar a diária.
- Exibir o aviso antes de gerar/aprovar o fechamento e oferecer ações para abrir a operação do evento ou corrigir o valor da escala/fechamento conforme a permissão do usuário.
- Impedir a criação de pagamento com valor inválido ou abaixo de R$ 0,01.
- Mover geração, correção e agendamento do pagamento para ações protegidas no servidor, usando o fechamento aprovado como fonte do valor.

## 2. Reparar registros já afetados

- Identificar fechamentos de modalidade diária com valor zero.
- Recalcular somente registros ainda não pagos.
- Atualizar pagamentos pendentes, agendados ou falhos que ainda não tenham transferência executada.
- Nunca alterar pagamento já executado; listar esses casos para revisão manual.
- Registrar cada correção no histórico de auditoria.

## 3. Preparar dois provedores durante a transição

- Adicionar o provedor (`asaas` ou `mercado_pago`) às cobranças, pagamentos, movimentações e eventos de webhook relevantes.
- Manter o código Asaas apenas para consultar/processar operações históricas já existentes.
- Criar uma interface única de cobrança, consulta, estorno e repasse para evitar regras duplicadas.
- Direcionar todas as novas operações ao Mercado Pago após a ativação; nenhum registro antigo será recriado automaticamente.

## 4. Conectar cada agência ao Mercado Pago

- Implementar autorização OAuth para cada agência conectar sua própria conta Mercado Pago.
- Guardar tokens de acesso criptografados no servidor, com renovação, revogação e estado de conexão; nunca expor tokens ao navegador.
- Exibir em Configurações o estado da conexão e bloquear cobranças novas quando a conta estiver desconectada ou pendente.
- Aplicar a taxa PayCrew pelo recurso de marketplace/split do Mercado Pago, usando o preço efetivo definido pelo administrador — nunca um valor editável pela agência.

## 5. Checkout dentro da PayCrew

- Integrar o Checkout Transparente/Bricks para Pix, boleto e cartões, tokenizando dados sensíveis diretamente com o Mercado Pago.
- Para Pix, mostrar QR Code e copia-e-cola; para boleto, exigir e validar o endereço necessário; para cartão, não armazenar número ou código de segurança.
- Usar chave de idempotência em toda criação de cobrança e apresentar estados claros de pendente, aprovado, recusado, vencido e cancelado.
- Manter os mesmos fluxos para cobrança de cliente e aporte da agência, com rastreabilidade separada.

## 6. Webhooks, saldo e reconciliação

- Criar um endpoint Mercado Pago com validação criptográfica da assinatura e consulta do pagamento na API antes de alterar saldo.
- Tornar crédito, taxa, funding e registro do webhook uma operação atômica e idempotente.
- Manter o webhook Asaas ativo enquanto existirem operações históricas abertas.
- Atualizar sincronização manual e painel de suporte para escolher o provedor correto de cada registro.
- Criar rotina de reconciliação para detectar cobrança aprovada sem crédito, crédito duplicado, repasse sem débito e divergência de valores.

## 7. Repasse aos colaboradores

- Antes do corte definitivo, validar comercialmente que a conta PayCrew possui **Payouts/marketplace** habilitado no Mercado Pago para o modelo brasileiro.
- Se o recurso aceitar o destino exigido, adaptar o cadastro do colaborador aos dados bancários obrigatórios e executar repasses com idempotência, reserva atômica de saldo e confirmação por webhook/consulta.
- Se o Mercado Pago não liberar envio para chave Pix arbitrária, não simular nem marcar como pago: novas cobranças podem migrar, mas o repasse permanece temporariamente no Asaas até existir um meio aprovado. Essa é uma dependência externa obrigatória para substituir 100% o gateway.

## 8. Testes e corte

- Testes unitários com `3`, `5`, `3,00`, `R$ 5,00`, valores com milhar e entradas inválidas.
- Testes do fechamento: diária sem pontos, pontos pendentes, pontos completos, hora sem saída e hora completa.
- Teste entre duas agências para confirmar isolamento de conta, cobrança, taxa, saldo e webhook.
- Testes no ambiente de teste do Mercado Pago para Pix, boleto, crédito, débito quando disponível, recusa, vencimento, duplicidade de webhook e reenvio.
- Corte controlado: bloquear novas operações Asaas, preservar consultas históricas, ativar Mercado Pago por agência e monitorar reconciliação.

## Critérios de aceite

- Nenhuma diária válida vira R$ 0,00 por ausência de ponto ou formatação brasileira.
- O usuário vê o alerta e consegue corrigir antes da aprovação.
- Pagamentos são gerados do valor aprovado, não de campos livres do navegador.
- Uma agência nunca usa conta, saldo, clientes ou transações de outra.
- Operações antigas do Asaas continuam legíveis e sincronizáveis.
- Nenhum repasse Mercado Pago entra em produção sem confirmação de Payouts e testes reais do destino bancário.

## Dependências externas

- Credenciais da aplicação Mercado Pago serão solicitadas de forma segura somente depois de criarmos as URLs de autorização e webhook.
- A conta Mercado Pago precisa ter marketplace/split e Payouts aprovados. Checkout, split e repasse são produtos distintos; habilitar cobrança não garante envio de Pix a colaboradores.
