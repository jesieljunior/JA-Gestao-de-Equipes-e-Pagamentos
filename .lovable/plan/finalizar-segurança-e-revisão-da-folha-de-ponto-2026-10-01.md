# Finalizar segurança e revisão da folha de ponto

## Resultado esperado

- O colaborador registra o ponto ao chegar ao local, inclusive após o horário previsto, sem perder o registro.
- Pontos feitos depois do encerramento ficam destacados e pendentes para decisão do supervisor.
- O QR expira 12 horas após o encerramento do evento e pode ser trocado por um responsável.
- Duplicidades, sequência inválida e tentativas automatizadas são bloqueadas no servidor.
- Selfie e localização ficam disponíveis somente para quem supervisiona a operação, com consentimento explícito.
- Selfies são mantidas por 90 dias; o painel avisa em três momentos antes da exclusão e permite baixar as evidências.
- Aprovações, recusas, lançamentos manuais e trocas de QR ficam registrados no histórico.

## Implementação

1. Ampliar os dados de eventos, pontos e configurações para controlar validade do QR, registro fora do horário, motivo de recusa, consentimento e prazo da selfie.
2. Criar controle protegido de tentativas públicas usando identificadores criptografados, sem guardar CPF ou endereço de rede em texto aberto.
3. Validar no servidor a ordem entrada → intervalo → retorno → saída e impedir repetição.
4. Trocar a prova automática de piscadas por captura de selfie com aviso e aceite para revisão humana.
5. Mostrar foto, localização e alerta de horário ao supervisor; exigir justificativa para recusa.
6. Mover decisões e lançamentos manuais para ações protegidas, com autorização e histórico.
7. Adicionar troca do QR e avisos de expiração/exclusão, incluindo download das selfies do evento.
8. Testar cálculo, sequência, expiração, tentativas, revisão e telas em computador e celular.

## Regras definidas

- A chegada real ao local é o momento do registro; não bloquear por início previsto.
- Até 12 horas após o fim, o ponto é aceito como pendente e o supervisor é avisado de que foi feito fora do horário.
- Depois de 12 horas, o QR é recusado.
- Selfies expiram em 90 dias, com três avisos no painel antes da exclusão.
