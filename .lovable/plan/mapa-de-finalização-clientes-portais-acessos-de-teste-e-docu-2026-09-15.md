# Mapa de finalização — clientes, portais, acessos de teste e documentos fiscais

## Resultado esperado

Finalizar a base B2B sem misturar estas três relações:

```text
Cliente contratante ── paga ──> Organização/agência
Prestador ── presta serviço ──> Organização/agência
Plataforma ── cobra software/taxa ──> Organização/agência
```

A organização reutiliza o mesmo cliente em vários eventos. Recursos para pagar prestadores ficam separados da receita da plataforma. Pagamentos e documentos fiscais continuam entidades distintas.

## Diagnóstico atual e divergências

### Já existe

- Login por e-mail/senha e Google, organização, clientes, eventos, equipes, escalas, ponto, fechamento e pagamentos.
- Três superfícies: portal da organização, suporte e administração master.
- Isolamento básico por organização no banco.
- Recarga/cobrança e Pix via parceiro financeiro.
- Planos, testes gratuitos, cupons e preços controlados pela administração master.

### Lacunas críticas

- O cadastro de cliente mostra apenas nome e observações. CPF/CNPJ, e-mail e telefone existem parcialmente no banco, mas não estão no formulário; isso já impede cobranças.
- Não há endereço, razão social, nome fantasia, inscrição municipal/estadual, responsável, situação cadastral nem preferências fiscais estruturadas.
- A matriz de permissões da organização existe, mas não protege todas as telas e ações. Hoje um perfil operacional pode alcançar ações financeiras.
- Não há convite de equipe nem criação segura dos três acessos de teste.
- Suporte não possui trilha de auditoria das ações executadas.
- O modelo atual chama recarga de “aporte” e credita um saldo interno. Isso não comprova segregação jurídica/custódia; precisa ser remodelado como funding vinculado a uma finalidade e ao parceiro financeiro.
- A base atual usa Lovable Cloud como fonte de verdade. Não existe FastAPI ativo nem cliente HTTP no projeto atual. Portanto, a exigência “não substituir o FastAPI” conflita com a arquitetura efetivamente implantada. Não será criado um segundo banco nem uma API paralela. Uma migração futura para FastAPI exigirá contrato e URL reais.
- O nome provisório aparece em textos e comentários atuais. Novos modelos e regras usarão nomes neutros; a retirada completa da marca será uma etapa controlada para não quebrar integrações.

## Escopo de implementação

### 1. Cadastro completo de clientes

Criar cadastro em seções, válido para pessoa jurídica e pessoa física:

- **Identificação:** tipo de pessoa, CPF/CNPJ, razão social/nome legal, nome fantasia/nome de exibição e situação ativa.
- **Contato:** e-mail financeiro, telefone, responsável, cargo e canal preferencial.
- **Endereço:** CEP, logradouro, número, complemento, bairro, cidade, UF e código do município.
- **Fiscal informativo:** inscrição municipal, inscrição estadual, indicador de isenção, regime/observação fiscal e código de serviço quando fornecido.
- **Cobrança:** vencimento preferencial, observações e identificador no parceiro financeiro.
- Validar CPF/CNPJ, e-mail, CEP/UF e campos condicionais no formulário e novamente no servidor/banco.
- Preservar os clientes existentes e migrar os campos atuais sem duplicar registros.
- Manter `Organization 1:N Client` e `Client 1:N Event`; impedir associação de cliente/evento entre organizações.
- Criar lista com busca por nome, documento, e-mail e situação; detalhe com eventos e cobranças relacionados.

### 2. Funding separado de receita

Substituir a ideia ambígua de “saldo/aporte” por uma estrutura neutra:

- **Funding:** recurso disponibilizado pela organização para uma finalidade/lote de pagamentos.
- **PaymentBatch:** conjunto aprovado de pagamentos a prestadores.
- **FundingAllocation:** vínculo entre funding e lote, com valores disponível, reservado, utilizado e devolvido.
- **PlatformCharge:** assinatura/taxa da plataforma, separada do funding e dos pagamentos dos prestadores.
- Estados do funding: `draft`, `pending`, `available`, `partially_reserved`, `reserved`, `consumed`, `refund_pending`, `refunded`, `failed`, `cancelled`.
- Estados do lote: `draft`, `awaiting_approval`, `approved`, `funding_pending`, `funded`, `processing`, `partially_paid`, `paid`, `failed`, `cancelled`.
- Preservar a integração financeira atual por uma camada adaptadora; não assumir carteira própria, custódia ou natureza de receita.
- Registrar idempotência, conciliação, estornos, sobras/devoluções e trilha de auditoria.

### 3. Documentos fiscais sem inventar tributação

Implementar somente registro e anexação, sem emissão ou cálculo automático:

- Entidade neutra **FiscalDocument**, ligada separadamente à organização, cliente, prestador, evento, pagamento ou taxa da plataforma.
- Tipos iniciais: `nfse`, `nfe`, `rpa`, `receipt`, `other`; número, série, chave de acesso, emissor, destinatário, competência, valor, status e observações.
- Upload privado de XML/PDF/imagem, com acesso restrito à organização e equipe autorizada da plataforma.
- Estados: `pending`, `received`, `validated_manually`, `rejected`, `cancelled`.
- Não calcular ISS, IR, INSS, retenções ou regras municipais; não transmitir notas automaticamente.
- **DANFE não é uma nota:** é a representação auxiliar da NF-e de mercadorias. Para o serviço principal, o documento normalmente relevante é NFS-e. O sistema aceitará DANFE/XML somente como anexo quando uma operação real de mercadorias justificar isso.
- Qualquer emissão futura dependerá de definição do emissor legal, CNAE, município, regime tributário, certificado e validação formal de contador/jurídico.

### 4. Três portais e autorização real

**Portal da organização**

- Clientes, eventos, prestadores, operação, fechamentos, funding, lotes, pagamentos e documentos próprios.
- Perfis internos: administrador, coordenador, financeiro e supervisor.
- Administração gerencia equipe e configurações; financeiro gerencia funding/pagamentos; coordenador gerencia cadastros/eventos; supervisor opera campo.

**Portal de suporte**

- Busca e consulta entre organizações, conferência/reprocessamento autorizado e visualização de documentos quando necessário.
- Sem alteração de planos, preços ou papéis master.
- Toda ação gera auditoria com usuário, organização, ação, alvo, data e resultado.

**Portal master**

- Organizações, planos, trials, cupons, cobranças da plataforma, equipe de suporte e auditoria.
- Não mistura receita da plataforma com funding destinado aos prestadores.

A proteção será aplicada na navegação, em funções de servidor e nas políticas do banco. Ocultar botão não será considerado segurança.

### 5. Três acessos de teste

- Criar três contas separadas: **organização**, **suporte** e **admin master**.
- Provisionar por fluxo administrativo seguro, com senha temporária e troca obrigatória; nenhuma senha ficará no código, migração ou chat.
- Popular dados demonstrativos claramente marcados como teste e isolados de dados reais.
- O perfil organização terá uma empresa de demonstração, cliente, evento, prestador e lote fictícios; nenhuma transação real será disparada.
- Exibir um guia interno com a URL e o papel de cada acesso, sem revelar credenciais.

### 6. Neutralização do nome provisório

- Novas tabelas, tipos, funções e componentes usarão nomes neutros (`Client`, `Organization`, `ServiceProvider`, `Funding`, `PaymentBatch`, `PlatformCharge`, `FiscalDocument`).
- Centralizar o nome exibido do produto em uma configuração única.
- Remover a marca fixa de regras e descrições financeiras; manter compatibilidade temporária com nomes antigos do banco até migração segura.

## Modelo de dados proposto

```text
Organization 1 ── N Client 1 ── N Event
Organization 1 ── N ServiceProvider
Event 1 ── N PaymentBatch 1 ── N Payment
Organization 1 ── N Funding N ── N PaymentBatch
Organization 1 ── N PlatformCharge
FiscalDocument ── opcionalmente referencia Client/Event/Provider/Payment/PlatformCharge
AuditLog ── ator + organização + ação + recurso + resultado
```

As migrações serão aditivas, com `GRANT`, RLS e índices no mesmo arquivo. Dados existentes serão preservados e mapeados; nenhuma tabela duplicada será criada quando a entidade atual puder ser evoluída.

## Ordem de execução

1. Corrigir autorização por papel nas ações financeiras e operacionais existentes.
2. Evoluir o cadastro de clientes e a relação segura com eventos.
3. Criar equipe/convites e provisionamento dos três acessos de teste.
4. Criar funding, lotes, alocações e taxas separadas; migrar o histórico atual.
5. Criar documentos fiscais como registro/anexo privado.
6. Ajustar os três portais e acrescentar auditoria.
7. Centralizar o nome provisório e neutralizar regras/componentes novos.
8. Executar testes de isolamento entre organizações, permissões, idempotência, conciliação, uploads e regressão do ciclo completo.

## Validação e testes obrigatórios

- Organização A não lê nem altera cliente, funding, pagamento ou documento da organização B.
- Supervisor não cria funding nem envia Pix; suporte não altera plano; master não depende de controles visuais para autorização.
- Cliente sem dados mínimos não avança para cobrança, com mensagem clara.
- Um cliente pode ser reutilizado em vários eventos da mesma organização.
- Funding nunca é somado à receita da plataforma; taxa nunca é usada como saldo de prestadores.
- Reserva e consumo não ultrapassam o valor disponível, mesmo com duas ações simultâneas.
- Reprocessamento e webhooks são idempotentes.
- Arquivos fiscais privados não ficam acessíveis por URL pública.
- Nenhum teste dispara cobrança ou Pix real.

## Fora deste escopo

- Emissão automática de NFS-e/NF-e, geração de DANFE, cálculo de tributos ou retenções.
- Regras fiscais específicas por município.
- Custódia/carteira financeira própria ou afirmação de conformidade regulatória sem parecer jurídico.
- Integração definitiva com novo banco/parceiro financeiro.
- Criação de um FastAPI paralelo sem contratos reais e estratégia explícita de migração.

## Dependências externas antes de emissão fiscal real

- Contador definir documento e emissor em cada relação.
- Jurídico validar o papel da plataforma no fluxo financeiro e eventual mandato de emissão.
- Definir CNAE, regime tributário, municípios atendidos, retenções e guarda documental.
- Escolher um provedor fiscal compatível somente depois dessas decisões.
