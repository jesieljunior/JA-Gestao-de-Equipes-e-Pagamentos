# PayCrew — o que falta para finalizar

## Onde estamos hoje

- O banco no Lovable Cloud já está criado e completo: agências, usuários e papéis, configurações, clientes, freelancers, eventos, equipes, escalas, pontos, ocorrências, fechamentos e pagamentos — com isolamento por agência.
- As regras de negócio do backend Python já foram portadas para `src/lib/dominio.ts` (máquina de estados do evento, cálculo de horas líquidas e valores, rótulos, permissões por papel).
- As telas atuais ainda são as da Etapa 1: um esqueleto de navegação com páginas "em breve", ainda apontando para a API FastAPI que não existe mais. Nenhuma tela lê ou grava no banco novo. É isso que falta.

## O que falta construir

### 1. Login e entrada na agência

- Tela de acesso com e-mail/senha e entrar com Google.
- Primeiro acesso: criar a agência (nome + CNPJ) — quem cria vira administrador.
- Área do app protegida por sessão real; topo mostra usuário, agência e papel, com sair.
- Remover a "sessão simulada" e toda a camada antiga de API HTTP.

### 2. Cadastros

- Clientes: lista, busca, criar, editar, observações.
- Freelancers: lista com busca e filtro por ativo/função, criar e editar (nome, CPF, telefone, função, chave Pix), ativar/inativar.
- Configurações da agência: selfie no check-in, GPS no check-in, exigir confirmação de presença, permitir substituição, habilitar ocorrências. Essas opções passam a valer de verdade nas telas de operação.

### 3. Eventos e escala

- Lista de eventos com filtro por status e busca; criação com cliente, local, datas.
- Página do evento: cabeçalho com status e a linha do ciclo (Planejamento → Escala → Confirmações → Pronto → Em execução → Encerrando → Fechamento → Pagamento → Concluído → Arquivado), botão de avançar apenas para o próximo estado válido e cancelar quando permitido.
- Equipes dentro do evento, com supervisor responsável.
- Escalar freelancers na equipe com valor combinado por diária ou por hora; convidar, confirmar, recusar e substituir.
- QR Code do evento para o check-in em campo.

### 4. Operação em campo (pensada para celular)

- Página pública de ponto pelo QR Code: o freelancer se identifica por CPF e registra entrada, início/fim de intervalo e saída — com selfie e localização quando a agência exigir.
- Painel do supervisor: quem confirmou, quem chegou, quem está em intervalo, quem saiu; aprovar ou recusar pontos; lançar ponto manual; registrar ocorrências.

### 5. Fechamento

- Gerar o fechamento do evento: para cada escala, horas líquidas (descontando intervalos, só com pontos aprovados) e valor calculado.
- Tela de conferência com totais por evento; aprovar ou contestar cada linha.

### 6. Financeiro e pagamentos

- Fila de pagamentos a partir dos fechamentos aprovados, com chave Pix do freelancer.
- Agendar e executar pagamento simulado (com número de transação e comprovante fictícios), tratar falha e permitir nova tentativa.
- Visão de totais: a pagar, agendado, pago, falhou.

### 7. Relatórios e fechamento do ciclo

- Relatório do evento: equipe, presenças, horas, custo total, pagamentos.
- Exportação em CSV.
- Painel inicial: eventos em andamento, pendências de aprovação de ponto, fechamentos e pagamentos aguardando ação.

## Detalhes técnicos

- Frontend TanStack Start + TanStack Query falando direto com o banco do Lovable Cloud via cliente gerado; leitura protegida por RLS por agência.
- A página pública de ponto por QR Code é a única superfície sem login: ela roda por função de servidor validando o token do evento e o CPF, sem expor dados da agência.
- Cálculo de horas e valores permanece em `src/lib/dominio.ts`, espelhando o serviço Python original; transições de estado validadas pela mesma função em toda tela.
- Pix simulado: nenhum provedor externo; os registros de pagamento gravam status, data de execução e identificador fictício, prontos para trocar por um provedor real depois.
- Limpeza: remover `src/api/*` e `src/auth/*` antigos após a migração das telas.

## Ordem de entrega

Login/agência → cadastros e configurações → eventos e escala → operação → fechamento → financeiro → relatórios. Cada bloco fica utilizável ao final dele.
