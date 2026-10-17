# PayCrew — Modelo de cobrança V2

## Objetivo

Substituir a cobrança percentual sobre eventos por uma assinatura mensal com excedente de participações operacionais, mantendo controle de ponto, valores de trabalhadores e custos do Mercado Pago fora da receita da plataforma.

## Regras fechadas

- O ciclo mensal começa no dia da assinatura de cada organização, não no mês calendário.
- Uma participação é o par único `pessoa + evento`, considerando somente a escala final com status confirmado.
- A mesma pessoa em várias equipes do mesmo evento conta uma vez; em eventos diferentes, conta uma vez por evento.
- Escalas recusadas, substituídas ou removidas antes da operação não contam.
- A competência da participação segue a data de início do evento dentro do ciclo da assinatura.
- A assinatura antiga atualmente ativa será migrada para o Pro V2.
- Nenhuma cobrança futura usará percentual sobre o valor do evento, fechamento, folha ou Pix.
- Valores e limites dos planos serão dados editáveis pelo admin; o código consumirá a configuração vigente e snapshots históricos.

## Implementação

### 1. Planos V2 e participações operacionais

- Evoluir os planos com mensalidade, participações incluídas, excedente unitário, limite de eventos, limite de pessoas por evento, capacidade CLT, supervisores permitidos e flags de recursos.
- Cadastrar Free, Start, Pro e Scale com os valores iniciais informados, por operação de dados separada da mudança estrutural.
- Manter as colunas antigas apenas para preservar histórico, marcá-las como obsoletas e retirar seu uso do aplicativo.
- Criar ciclos de faturamento por organização, ancorados na data da assinatura, com início, fim, plano e tabela de preços congelados para auditoria.
- Criar participações operacionais deduplicadas por organização, evento e pessoa. Um sincronizador no banco ativa a participação enquanto existir ao menos uma escala final confirmada e a desativa quando não existir mais.
- Implementar o serviço central `contarParticipacoesDoCiclo(organizacaoId, referencia)` e um resumo de uso que retorne incluídas, usadas, excedentes e estimativa.
- Criar contagem separada de CLT ativo por ciclo, com snapshot mensal para preservar o histórico mesmo após mudança de vínculo ou desativação.

### 2. Limites e bloqueios do Free

- Transferir criação de eventos, inclusão/alteração de escalas e gestão de supervisores para funções protegidas no servidor.
- Aplicar os limites do plano também no banco, com bloqueio transacional contra requisições simultâneas ou tentativas diretas pelo navegador.
- No Free, impedir o quarto evento do ciclo e a 31ª pessoa única no evento; duplicidade da mesma pessoa em outra equipe não consome nova vaga.
- Impedir fechamento financeiro, gestão financeira, agendamento de Pix, pagamentos, Pix em massa, importação avançada, relatórios avançados e API no servidor.
- Fixar no Free a retenção de foto e geolocalização em 30 dias. A limpeza remove a evidência sensível, preservando apenas o registro operacional necessário.
- Exibir mensagens de limite com CTA de upgrade, sem permitir que a interface e o servidor discordem.

### 3. Fatura mensal da plataforma

- Criar faturas e itens de fatura próprios para a receita SaaS, separados das cobranças/aportes usados para pagar trabalhadores.
- No fechamento do ciclo, congelar: plano, mensalidade, participações incluídas, participações usadas, excedentes, preço unitário e descontos aplicáveis.
- Calcular `mensalidade + participações excedentes × valor unitário`, com idempotência para nunca gerar duas faturas do mesmo ciclo.
- Registrar status pendente, paga, atrasada, cancelada e falha, datas de vencimento/pagamento e referência do Mercado Pago.
- Disponibilizar histórico ao cliente com detalhamento legível, por exemplo: `mensalidade R$ 499 + 120 excedentes × R$ 2,50 = R$ 799`.
- Cupons e ajustes passam a afetar explicitamente a fatura V2, sem reativar percentuais sobre eventos.

### 4. Uso em tempo real e comparação de planos

- Adicionar ao painel da organização o consumo do ciclo atual, franquia, excedente previsto, headcount CLT e estimativa da próxima fatura.
- Para o Free, mostrar eventos usados e ocupação por evento; para CLT excedente, apenas sinalizar contratação personalizada.
- Criar comparação de Free, Start, Pro e Scale com dados lidos do banco.
- Calcular dinamicamente os pontos de virada entre planos com base na mensalidade, franquia e excedente configurados; não colocar valores no código.
- No Scale, sinalizar contato comercial quando o uso recorrente ultrapassar a franquia configurada, sem preço Enterprise automático.
- Exibir no módulo CLT: “Módulo em processo de validação jurídica trabalhista”.

### 5. Painel do admin

- Permitir editar todos os preços, franquias, limites e recursos dos planos por funções exclusivas do admin master, com histórico de alterações.
- Mostrar uso corrente por organização antes do fechamento, faturas e alertas de limite.
- Separar receita recorrente de mensalidade e receita variável de excedente, sem incluir aportes ou pagamentos aos trabalhadores.
- Registrar mudanças Free → pago e calcular conversão por período, com trilha de alterações de assinatura.
- Remover os controles antigos de percentual próprio, percentual por evento e taxa SaaS por Pix.

### 6. Capacidade CLT independente

- Contar CLTs ativos por organização e ciclo sem criar participações ou cobranças por evento.
- Aplicar limites de 20, 50 e 150 nos planos iniciais Start, Pro e Scale; Free não libera o módulo financeiro CLT.
- Ao exceder o limite, bloquear novas ativações CLT e orientar contratação personalizada, sem cobrar excedente automaticamente.
- Preservar folha e ponto CLT como operação separada da métrica de faturamento.

### 7. Mercado Pago e separação contábil

- Implementar a cobrança das faturas SaaS via Mercado Pago, usando Pix e cartão, com webhook assinado, idempotência e reconciliação.
- Reaproveitar as estruturas preparadas de conta conectada, mas adicionar o código de integração que ainda não existe e manter credenciais somente no servidor.
- Criar configuração administrativa das taxas do meio de pagamento por método e prazo de recebimento.
- Calcular o repasse com a função única `valorLiquido / (1 - taxa)`, arredondamento monetário consistente e snapshot da taxa usada.
- Registrar o custo do Mercado Pago em entidade própria, sem incorporá-lo à mensalidade nem classificá-lo como receita.
- Manter três livros e relatórios independentes:
  1. receita SaaS: mensalidade e excedente;
  2. recursos de terceiros: aportes e pagamentos de trabalhadores;
  3. custo financeiro: tarifas de Pix/cartão do Mercado Pago.
- Preservar cobranças e taxas históricas do Asaas somente para consulta/reconciliação; novos ciclos V2 não criarão `taxas_plataforma` percentuais.

## Migração e segurança

- Fazer mudanças de banco de forma aditiva, com RLS e grants explícitos em todas as novas tabelas.
- Migrar a assinatura ativa antiga para Pro V2 sem recalcular nem alterar lançamentos passados.
- Proteger contadores, fechamento de fatura, mudanças de plano e limites com funções autenticadas e validação da organização no servidor.
- Usar trava transacional/advisory lock nos limites e no fechamento mensal para evitar ultrapassagens por concorrência.
- Manter snapshots de preço e plano nas faturas; alterações do admin só afetam ciclos futuros, salvo ajuste manual auditado.
- Registrar em auditoria: mudança de plano, mudança de preço, bloqueio por limite, fechamento/reabertura de fatura e confirmação do gateway.

## Validação

- Testar deduplicação pessoa/evento, múltiplas equipes, substituições, cancelamentos e eventos na borda do ciclo.
- Testar concorrência no quarto evento Free, na 31ª pessoa e no limite de supervisores/CLT.
- Testar faturamento dos quatro planos, excedente zero, cupons, mudança de plano e idempotência.
- Testar bloqueios Free por chamada direta, não apenas pela tela.
- Testar segregação contábil e garantir que valor de evento/folha nunca componha receita SaaS.
- Testar webhook Mercado Pago duplicado, atrasado e fora de ordem, além de reconciliação de Pix/cartão.
- Validar isolamento entre organizações, permissões de cliente/suporte/admin e visualização em desktop e celular.
