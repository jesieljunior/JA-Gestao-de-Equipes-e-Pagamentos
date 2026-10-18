export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      alocacoes_funding: {
        Row: {
          atualizado_em: string;
          criado_em: string;
          empresa_id: string;
          funding_id: string;
          id: string;
          lote_id: string;
          valor_devolvido: number;
          valor_reservado: number;
          valor_utilizado: number;
        };
        Insert: {
          atualizado_em?: string;
          criado_em?: string;
          empresa_id: string;
          funding_id: string;
          id?: string;
          lote_id: string;
          valor_devolvido?: number;
          valor_reservado: number;
          valor_utilizado?: number;
        };
        Update: {
          atualizado_em?: string;
          criado_em?: string;
          empresa_id?: string;
          funding_id?: string;
          id?: string;
          lote_id?: string;
          valor_devolvido?: number;
          valor_reservado?: number;
          valor_utilizado?: number;
        };
        Relationships: [
          {
            foreignKeyName: "alocacoes_funding_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alocacoes_funding_funding_id_fkey";
            columns: ["funding_id"];
            isOneToOne: false;
            referencedRelation: "fundings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alocacoes_funding_lote_id_fkey";
            columns: ["lote_id"];
            isOneToOne: false;
            referencedRelation: "lotes_pagamento";
            referencedColumns: ["id"];
          },
        ];
      };
      assinaturas: {
        Row: {
          atualizado_em: string;
          criado_em: string;
          cupom_id: string | null;
          empresa_id: string;
          id: string;
          inicio_ciclo: string;
          mensalidade_override: number | null;
          observacoes: string | null;
          percentual_override: number | null;
          plano_id: string | null;
          status: string;
          taxa_fixa_override: number | null;
          trial_ate: string | null;
        };
        Insert: {
          atualizado_em?: string;
          criado_em?: string;
          cupom_id?: string | null;
          empresa_id: string;
          id?: string;
          inicio_ciclo?: string;
          mensalidade_override?: number | null;
          observacoes?: string | null;
          percentual_override?: number | null;
          plano_id?: string | null;
          status?: string;
          taxa_fixa_override?: number | null;
          trial_ate?: string | null;
        };
        Update: {
          atualizado_em?: string;
          criado_em?: string;
          cupom_id?: string | null;
          empresa_id?: string;
          id?: string;
          inicio_ciclo?: string;
          mensalidade_override?: number | null;
          observacoes?: string | null;
          percentual_override?: number | null;
          plano_id?: string | null;
          status?: string;
          taxa_fixa_override?: number | null;
          trial_ate?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "assinaturas_cupom_id_fkey";
            columns: ["cupom_id"];
            isOneToOne: false;
            referencedRelation: "cupons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assinaturas_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: true;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assinaturas_plano_id_fkey";
            columns: ["plano_id"];
            isOneToOne: false;
            referencedRelation: "planos";
            referencedColumns: ["id"];
          },
        ];
      };
      assinaturas_historico: {
        Row: {
          alterado_por: string | null;
          criado_em: string;
          empresa_id: string;
          id: string;
          plano_anterior_id: string | null;
          plano_novo_id: string | null;
        };
        Insert: {
          alterado_por?: string | null;
          criado_em?: string;
          empresa_id: string;
          id?: string;
          plano_anterior_id?: string | null;
          plano_novo_id?: string | null;
        };
        Update: {
          alterado_por?: string | null;
          criado_em?: string;
          empresa_id?: string;
          id?: string;
          plano_anterior_id?: string | null;
          plano_novo_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "assinaturas_historico_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assinaturas_historico_plano_anterior_id_fkey";
            columns: ["plano_anterior_id"];
            isOneToOne: false;
            referencedRelation: "planos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assinaturas_historico_plano_novo_id_fkey";
            columns: ["plano_novo_id"];
            isOneToOne: false;
            referencedRelation: "planos";
            referencedColumns: ["id"];
          },
        ];
      };
      auditoria_ponto_publico: {
        Row: {
          acao: string;
          criado_em: string;
          detalhes: Json;
          empresa_id: string;
          escala_id: string | null;
          id: string;
          ponto_id: string | null;
          resultado: string;
        };
        Insert: {
          acao: string;
          criado_em?: string;
          detalhes?: Json;
          empresa_id: string;
          escala_id?: string | null;
          id?: string;
          ponto_id?: string | null;
          resultado: string;
        };
        Update: {
          acao?: string;
          criado_em?: string;
          detalhes?: Json;
          empresa_id?: string;
          escala_id?: string | null;
          id?: string;
          ponto_id?: string | null;
          resultado?: string;
        };
        Relationships: [
          {
            foreignKeyName: "auditoria_ponto_publico_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "auditoria_ponto_publico_escala_id_fkey";
            columns: ["escala_id"];
            isOneToOne: false;
            referencedRelation: "escalas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "auditoria_ponto_publico_ponto_id_fkey";
            columns: ["ponto_id"];
            isOneToOne: false;
            referencedRelation: "pontos";
            referencedColumns: ["id"];
          },
        ];
      };
      ciclos_cobranca: {
        Row: {
          assinatura_id: string | null;
          criado_em: string;
          desconto_tipo: string | null;
          desconto_valor: number;
          empresa_id: string;
          fim: string;
          id: string;
          inicio: string;
          mensalidade: number;
          participacoes_incluidas: number;
          plano_id: string | null;
          plano_nome: string;
          trial_ate: string | null;
          valor_excedente: number;
        };
        Insert: {
          assinatura_id?: string | null;
          criado_em?: string;
          desconto_tipo?: string | null;
          desconto_valor?: number;
          empresa_id: string;
          fim: string;
          id?: string;
          inicio: string;
          mensalidade: number;
          participacoes_incluidas: number;
          plano_id?: string | null;
          plano_nome: string;
          trial_ate?: string | null;
          valor_excedente: number;
        };
        Update: {
          assinatura_id?: string | null;
          criado_em?: string;
          desconto_tipo?: string | null;
          desconto_valor?: number;
          empresa_id?: string;
          fim?: string;
          id?: string;
          inicio?: string;
          mensalidade?: number;
          participacoes_incluidas?: number;
          plano_id?: string | null;
          plano_nome?: string;
          trial_ate?: string | null;
          valor_excedente?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ciclos_cobranca_assinatura_id_fkey";
            columns: ["assinatura_id"];
            isOneToOne: false;
            referencedRelation: "assinaturas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ciclos_cobranca_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ciclos_cobranca_plano_id_fkey";
            columns: ["plano_id"];
            isOneToOne: false;
            referencedRelation: "planos";
            referencedColumns: ["id"];
          },
        ];
      };
      clientes: {
        Row: {
          ativo: boolean;
          atualizado_em: string;
          bairro: string | null;
          canal_preferencial: string | null;
          cep: string | null;
          cidade: string | null;
          codigo_municipio: string | null;
          codigo_servico: string | null;
          complemento: string | null;
          cpf_cnpj: string | null;
          criado_em: string;
          email: string | null;
          email_financeiro: string | null;
          empresa_id: string;
          id: string;
          inscricao_estadual: string | null;
          inscricao_estadual_isento: boolean;
          inscricao_municipal: string | null;
          logradouro: string | null;
          nome: string;
          nome_fantasia: string | null;
          numero: string | null;
          observacoes: string | null;
          parceiro_cliente_id: string | null;
          razao_social: string | null;
          regime_fiscal: string | null;
          responsavel_cargo: string | null;
          responsavel_nome: string | null;
          telefone: string | null;
          tipo_pessoa: Database["public"]["Enums"]["tipo_pessoa"];
          uf: string | null;
          vencimento_preferencial: number | null;
        };
        Insert: {
          ativo?: boolean;
          atualizado_em?: string;
          bairro?: string | null;
          canal_preferencial?: string | null;
          cep?: string | null;
          cidade?: string | null;
          codigo_municipio?: string | null;
          codigo_servico?: string | null;
          complemento?: string | null;
          cpf_cnpj?: string | null;
          criado_em?: string;
          email?: string | null;
          email_financeiro?: string | null;
          empresa_id: string;
          id?: string;
          inscricao_estadual?: string | null;
          inscricao_estadual_isento?: boolean;
          inscricao_municipal?: string | null;
          logradouro?: string | null;
          nome: string;
          nome_fantasia?: string | null;
          numero?: string | null;
          observacoes?: string | null;
          parceiro_cliente_id?: string | null;
          razao_social?: string | null;
          regime_fiscal?: string | null;
          responsavel_cargo?: string | null;
          responsavel_nome?: string | null;
          telefone?: string | null;
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"];
          uf?: string | null;
          vencimento_preferencial?: number | null;
        };
        Update: {
          ativo?: boolean;
          atualizado_em?: string;
          bairro?: string | null;
          canal_preferencial?: string | null;
          cep?: string | null;
          cidade?: string | null;
          codigo_municipio?: string | null;
          codigo_servico?: string | null;
          complemento?: string | null;
          cpf_cnpj?: string | null;
          criado_em?: string;
          email?: string | null;
          email_financeiro?: string | null;
          empresa_id?: string;
          id?: string;
          inscricao_estadual?: string | null;
          inscricao_estadual_isento?: boolean;
          inscricao_municipal?: string | null;
          logradouro?: string | null;
          nome?: string;
          nome_fantasia?: string | null;
          numero?: string | null;
          observacoes?: string | null;
          parceiro_cliente_id?: string | null;
          razao_social?: string | null;
          regime_fiscal?: string | null;
          responsavel_cargo?: string | null;
          responsavel_nome?: string | null;
          telefone?: string | null;
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"];
          uf?: string | null;
          vencimento_preferencial?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "clientes_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      cobrancas: {
        Row: {
          atualizado_em: string;
          chave_idempotencia: string | null;
          cliente_id: string | null;
          criado_em: string;
          descricao: string;
          empresa_id: string;
          erro: string | null;
          evento_id: string | null;
          forma: Database["public"]["Enums"]["forma_cobranca"];
          id: string;
          link_pagamento: string | null;
          pago_em: string | null;
          parceiro_cobranca_id: string | null;
          pix_copia_cola: string | null;
          provedor_pagamento: string;
          provedor_status: string | null;
          status: Database["public"]["Enums"]["status_cobranca"];
          tipo: Database["public"]["Enums"]["tipo_cobranca"];
          valor: number;
          vencimento: string | null;
        };
        Insert: {
          atualizado_em?: string;
          chave_idempotencia?: string | null;
          cliente_id?: string | null;
          criado_em?: string;
          descricao?: string;
          empresa_id: string;
          erro?: string | null;
          evento_id?: string | null;
          forma?: Database["public"]["Enums"]["forma_cobranca"];
          id?: string;
          link_pagamento?: string | null;
          pago_em?: string | null;
          parceiro_cobranca_id?: string | null;
          pix_copia_cola?: string | null;
          provedor_pagamento?: string;
          provedor_status?: string | null;
          status?: Database["public"]["Enums"]["status_cobranca"];
          tipo: Database["public"]["Enums"]["tipo_cobranca"];
          valor: number;
          vencimento?: string | null;
        };
        Update: {
          atualizado_em?: string;
          chave_idempotencia?: string | null;
          cliente_id?: string | null;
          criado_em?: string;
          descricao?: string;
          empresa_id?: string;
          erro?: string | null;
          evento_id?: string | null;
          forma?: Database["public"]["Enums"]["forma_cobranca"];
          id?: string;
          link_pagamento?: string | null;
          pago_em?: string | null;
          parceiro_cobranca_id?: string | null;
          pix_copia_cola?: string | null;
          provedor_pagamento?: string;
          provedor_status?: string | null;
          status?: Database["public"]["Enums"]["status_cobranca"];
          tipo?: Database["public"]["Enums"]["tipo_cobranca"];
          valor?: number;
          vencimento?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cobrancas_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cobrancas_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cobrancas_evento_id_fkey";
            columns: ["evento_id"];
            isOneToOne: false;
            referencedRelation: "eventos";
            referencedColumns: ["id"];
          },
        ];
      };
      cobrancas_plataforma: {
        Row: {
          assinatura_id: string | null;
          atualizado_em: string;
          competencia: string | null;
          criado_em: string;
          descricao: string;
          empresa_id: string;
          id: string;
          referencia_parceiro: string | null;
          status: Database["public"]["Enums"]["status_cobranca"];
          tipo: string;
          valor: number;
        };
        Insert: {
          assinatura_id?: string | null;
          atualizado_em?: string;
          competencia?: string | null;
          criado_em?: string;
          descricao: string;
          empresa_id: string;
          id?: string;
          referencia_parceiro?: string | null;
          status?: Database["public"]["Enums"]["status_cobranca"];
          tipo: string;
          valor: number;
        };
        Update: {
          assinatura_id?: string | null;
          atualizado_em?: string;
          competencia?: string | null;
          criado_em?: string;
          descricao?: string;
          empresa_id?: string;
          id?: string;
          referencia_parceiro?: string | null;
          status?: Database["public"]["Enums"]["status_cobranca"];
          tipo?: string;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "cobrancas_plataforma_assinatura_id_fkey";
            columns: ["assinatura_id"];
            isOneToOne: false;
            referencedRelation: "assinaturas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cobrancas_plataforma_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      configuracoes: {
        Row: {
          atualizado_em: string;
          checkin_exige_gps: boolean;
          checkin_exige_selfie: boolean;
          criado_em: string;
          empresa_id: string;
          escala_exige_confirmacao_presenca: boolean;
          id: string;
          mensalidade: number;
          modelo_cobranca: Database["public"]["Enums"]["modelo_cobranca"];
          ocorrencias_habilitadas: boolean;
          percentual_plataforma: number;
          selfie_retencao_dias: number;
          substituicao_habilitada: boolean;
          taxa_fixa_pix: number;
        };
        Insert: {
          atualizado_em?: string;
          checkin_exige_gps?: boolean;
          checkin_exige_selfie?: boolean;
          criado_em?: string;
          empresa_id: string;
          escala_exige_confirmacao_presenca?: boolean;
          id?: string;
          mensalidade?: number;
          modelo_cobranca?: Database["public"]["Enums"]["modelo_cobranca"];
          ocorrencias_habilitadas?: boolean;
          percentual_plataforma?: number;
          selfie_retencao_dias?: number;
          substituicao_habilitada?: boolean;
          taxa_fixa_pix?: number;
        };
        Update: {
          atualizado_em?: string;
          checkin_exige_gps?: boolean;
          checkin_exige_selfie?: boolean;
          criado_em?: string;
          empresa_id?: string;
          escala_exige_confirmacao_presenca?: boolean;
          id?: string;
          mensalidade?: number;
          modelo_cobranca?: Database["public"]["Enums"]["modelo_cobranca"];
          ocorrencias_habilitadas?: boolean;
          percentual_plataforma?: number;
          selfie_retencao_dias?: number;
          substituicao_habilitada?: boolean;
          taxa_fixa_pix?: number;
        };
        Relationships: [
          {
            foreignKeyName: "configuracoes_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: true;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      convites_equipe: {
        Row: {
          aceito_em: string | null;
          atualizado_em: string;
          convidado_por: string;
          criado_em: string;
          email: string;
          empresa_id: string;
          expira_em: string;
          id: string;
          papel: Database["public"]["Enums"]["papel_usuario"];
          revogado_em: string | null;
          token_hash: string;
        };
        Insert: {
          aceito_em?: string | null;
          atualizado_em?: string;
          convidado_por: string;
          criado_em?: string;
          email: string;
          empresa_id: string;
          expira_em: string;
          id?: string;
          papel: Database["public"]["Enums"]["papel_usuario"];
          revogado_em?: string | null;
          token_hash: string;
        };
        Update: {
          aceito_em?: string | null;
          atualizado_em?: string;
          convidado_por?: string;
          criado_em?: string;
          email?: string;
          empresa_id?: string;
          expira_em?: string;
          id?: string;
          papel?: Database["public"]["Enums"]["papel_usuario"];
          revogado_em?: string | null;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "convites_equipe_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      cupons: {
        Row: {
          ativo: boolean;
          atualizado_em: string;
          codigo: string;
          criado_em: string;
          empresa_id: string | null;
          id: string;
          limite_usos: number | null;
          tipo: string;
          usos: number;
          validade: string | null;
          valor: number;
        };
        Insert: {
          ativo?: boolean;
          atualizado_em?: string;
          codigo: string;
          criado_em?: string;
          empresa_id?: string | null;
          id?: string;
          limite_usos?: number | null;
          tipo?: string;
          usos?: number;
          validade?: string | null;
          valor?: number;
        };
        Update: {
          ativo?: boolean;
          atualizado_em?: string;
          codigo?: string;
          criado_em?: string;
          empresa_id?: string | null;
          id?: string;
          limite_usos?: number | null;
          tipo?: string;
          usos?: number;
          validade?: string | null;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "cupons_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      custos_meio_pagamento: {
        Row: {
          cobranca_id: string | null;
          criado_em: string;
          custo: number;
          empresa_id: string;
          fatura_id: string | null;
          id: string;
          metodo: string;
          taxa_aplicada: number;
          valor_cobrado: number;
          valor_liquido: number;
        };
        Insert: {
          cobranca_id?: string | null;
          criado_em?: string;
          custo: number;
          empresa_id: string;
          fatura_id?: string | null;
          id?: string;
          metodo: string;
          taxa_aplicada: number;
          valor_cobrado: number;
          valor_liquido: number;
        };
        Update: {
          cobranca_id?: string | null;
          criado_em?: string;
          custo?: number;
          empresa_id?: string;
          fatura_id?: string | null;
          id?: string;
          metodo?: string;
          taxa_aplicada?: number;
          valor_cobrado?: number;
          valor_liquido?: number;
        };
        Relationships: [
          {
            foreignKeyName: "custos_meio_pagamento_cobranca_id_fkey";
            columns: ["cobranca_id"];
            isOneToOne: false;
            referencedRelation: "cobrancas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "custos_meio_pagamento_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "custos_meio_pagamento_fatura_id_fkey";
            columns: ["fatura_id"];
            isOneToOne: false;
            referencedRelation: "faturas_plataforma";
            referencedColumns: ["id"];
          },
        ];
      };
      documentos_fiscais: {
        Row: {
          arquivo_caminho: string | null;
          arquivo_nome: string | null;
          arquivo_tipo: string | null;
          atualizado_em: string;
          chave_acesso: string | null;
          cliente_id: string | null;
          cobranca_plataforma_id: string | null;
          competencia: string | null;
          criado_em: string;
          criado_por: string;
          destinatario_documento: string | null;
          destinatario_nome: string | null;
          emissor_documento: string | null;
          emissor_nome: string | null;
          empresa_id: string;
          evento_id: string | null;
          freelancer_id: string | null;
          id: string;
          numero: string | null;
          observacoes: string | null;
          pagamento_id: string | null;
          serie: string | null;
          status: Database["public"]["Enums"]["status_documento_fiscal"];
          tipo: Database["public"]["Enums"]["tipo_documento_fiscal"];
          validado_em: string | null;
          validado_por: string | null;
          valor: number | null;
        };
        Insert: {
          arquivo_caminho?: string | null;
          arquivo_nome?: string | null;
          arquivo_tipo?: string | null;
          atualizado_em?: string;
          chave_acesso?: string | null;
          cliente_id?: string | null;
          cobranca_plataforma_id?: string | null;
          competencia?: string | null;
          criado_em?: string;
          criado_por: string;
          destinatario_documento?: string | null;
          destinatario_nome?: string | null;
          emissor_documento?: string | null;
          emissor_nome?: string | null;
          empresa_id: string;
          evento_id?: string | null;
          freelancer_id?: string | null;
          id?: string;
          numero?: string | null;
          observacoes?: string | null;
          pagamento_id?: string | null;
          serie?: string | null;
          status?: Database["public"]["Enums"]["status_documento_fiscal"];
          tipo: Database["public"]["Enums"]["tipo_documento_fiscal"];
          validado_em?: string | null;
          validado_por?: string | null;
          valor?: number | null;
        };
        Update: {
          arquivo_caminho?: string | null;
          arquivo_nome?: string | null;
          arquivo_tipo?: string | null;
          atualizado_em?: string;
          chave_acesso?: string | null;
          cliente_id?: string | null;
          cobranca_plataforma_id?: string | null;
          competencia?: string | null;
          criado_em?: string;
          criado_por?: string;
          destinatario_documento?: string | null;
          destinatario_nome?: string | null;
          emissor_documento?: string | null;
          emissor_nome?: string | null;
          empresa_id?: string;
          evento_id?: string | null;
          freelancer_id?: string | null;
          id?: string;
          numero?: string | null;
          observacoes?: string | null;
          pagamento_id?: string | null;
          serie?: string | null;
          status?: Database["public"]["Enums"]["status_documento_fiscal"];
          tipo?: Database["public"]["Enums"]["tipo_documento_fiscal"];
          validado_em?: string | null;
          validado_por?: string | null;
          valor?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "documentos_fiscais_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documentos_fiscais_cobranca_plataforma_id_fkey";
            columns: ["cobranca_plataforma_id"];
            isOneToOne: false;
            referencedRelation: "cobrancas_plataforma";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documentos_fiscais_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documentos_fiscais_evento_id_fkey";
            columns: ["evento_id"];
            isOneToOne: false;
            referencedRelation: "eventos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documentos_fiscais_freelancer_id_fkey";
            columns: ["freelancer_id"];
            isOneToOne: false;
            referencedRelation: "freelancers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documentos_fiscais_pagamento_id_fkey";
            columns: ["pagamento_id"];
            isOneToOne: false;
            referencedRelation: "pagamentos";
            referencedColumns: ["id"];
          },
        ];
      };
      empresas: {
        Row: {
          ativa: boolean;
          atualizado_em: string;
          cnpj: string;
          codigo_servico: string | null;
          criado_em: string;
          email_cobranca: string | null;
          fiscal_status: string;
          fiscal_validado_em: string | null;
          fiscal_validado_por: string | null;
          gateway_ativo: string;
          id: string;
          municipio: string | null;
          nome: string;
          parceiro_aprovada_em: string | null;
          parceiro_conta_status: string;
          parceiro_wallet_id: string | null;
          razao_social: string | null;
          regime_fiscal: string | null;
          subconta_parceiro_id: string | null;
          uf: string | null;
        };
        Insert: {
          ativa?: boolean;
          atualizado_em?: string;
          cnpj: string;
          codigo_servico?: string | null;
          criado_em?: string;
          email_cobranca?: string | null;
          fiscal_status?: string;
          fiscal_validado_em?: string | null;
          fiscal_validado_por?: string | null;
          gateway_ativo?: string;
          id?: string;
          municipio?: string | null;
          nome: string;
          parceiro_aprovada_em?: string | null;
          parceiro_conta_status?: string;
          parceiro_wallet_id?: string | null;
          razao_social?: string | null;
          regime_fiscal?: string | null;
          subconta_parceiro_id?: string | null;
          uf?: string | null;
        };
        Update: {
          ativa?: boolean;
          atualizado_em?: string;
          cnpj?: string;
          codigo_servico?: string | null;
          criado_em?: string;
          email_cobranca?: string | null;
          fiscal_status?: string;
          fiscal_validado_em?: string | null;
          fiscal_validado_por?: string | null;
          gateway_ativo?: string;
          id?: string;
          municipio?: string | null;
          nome?: string;
          parceiro_aprovada_em?: string | null;
          parceiro_conta_status?: string;
          parceiro_wallet_id?: string | null;
          razao_social?: string | null;
          regime_fiscal?: string | null;
          subconta_parceiro_id?: string | null;
          uf?: string | null;
        };
        Relationships: [];
      };
      equipes: {
        Row: {
          atualizado_em: string;
          criado_em: string;
          evento_id: string;
          id: string;
          nome: string;
          supervisor_id: string | null;
        };
        Insert: {
          atualizado_em?: string;
          criado_em?: string;
          evento_id: string;
          id?: string;
          nome: string;
          supervisor_id?: string | null;
        };
        Update: {
          atualizado_em?: string;
          criado_em?: string;
          evento_id?: string;
          id?: string;
          nome?: string;
          supervisor_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "equipes_evento_id_fkey";
            columns: ["evento_id"];
            isOneToOne: false;
            referencedRelation: "eventos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "equipes_supervisor_id_fkey";
            columns: ["supervisor_id"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
        ];
      };
      escalas: {
        Row: {
          atualizado_em: string;
          confirmado_em: string | null;
          convite_enviado_em: string | null;
          criado_em: string;
          equipe_id: string;
          freelancer_id: string;
          id: string;
          status: Database["public"]["Enums"]["status_escala"];
          substituido_por_id: string | null;
          tipo_valor: Database["public"]["Enums"]["tipo_valor"];
          valor_combinado: number;
        };
        Insert: {
          atualizado_em?: string;
          confirmado_em?: string | null;
          convite_enviado_em?: string | null;
          criado_em?: string;
          equipe_id: string;
          freelancer_id: string;
          id?: string;
          status?: Database["public"]["Enums"]["status_escala"];
          substituido_por_id?: string | null;
          tipo_valor: Database["public"]["Enums"]["tipo_valor"];
          valor_combinado: number;
        };
        Update: {
          atualizado_em?: string;
          confirmado_em?: string | null;
          convite_enviado_em?: string | null;
          criado_em?: string;
          equipe_id?: string;
          freelancer_id?: string;
          id?: string;
          status?: Database["public"]["Enums"]["status_escala"];
          substituido_por_id?: string | null;
          tipo_valor?: Database["public"]["Enums"]["tipo_valor"];
          valor_combinado?: number;
        };
        Relationships: [
          {
            foreignKeyName: "escalas_equipe_id_fkey";
            columns: ["equipe_id"];
            isOneToOne: false;
            referencedRelation: "equipes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "escalas_freelancer_id_fkey";
            columns: ["freelancer_id"];
            isOneToOne: false;
            referencedRelation: "freelancers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "escalas_substituido_por_id_fkey";
            columns: ["substituido_por_id"];
            isOneToOne: false;
            referencedRelation: "escalas";
            referencedColumns: ["id"];
          },
        ];
      };
      eventos: {
        Row: {
          atualizado_em: string;
          cliente_id: string | null;
          criado_em: string;
          data_fim: string | null;
          data_inicio: string;
          empresa_id: string;
          id: string;
          local: string | null;
          nome: string;
          qr_code_expira_em: string | null;
          qr_code_gerado_em: string;
          qr_code_token: string;
          status: Database["public"]["Enums"]["status_evento"];
        };
        Insert: {
          atualizado_em?: string;
          cliente_id?: string | null;
          criado_em?: string;
          data_fim?: string | null;
          data_inicio: string;
          empresa_id: string;
          id?: string;
          local?: string | null;
          nome: string;
          qr_code_expira_em?: string | null;
          qr_code_gerado_em?: string;
          qr_code_token?: string;
          status?: Database["public"]["Enums"]["status_evento"];
        };
        Update: {
          atualizado_em?: string;
          cliente_id?: string | null;
          criado_em?: string;
          data_fim?: string | null;
          data_inicio?: string;
          empresa_id?: string;
          id?: string;
          local?: string | null;
          nome?: string;
          qr_code_expira_em?: string | null;
          qr_code_gerado_em?: string;
          qr_code_token?: string;
          status?: Database["public"]["Enums"]["status_evento"];
        };
        Relationships: [
          {
            foreignKeyName: "eventos_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "eventos_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      faturas_plataforma: {
        Row: {
          assinatura_id: string | null;
          atualizado_em: string;
          ciclo_fim: string;
          ciclo_inicio: string;
          clt_ativos: number;
          criado_em: string;
          desconto: number;
          empresa_id: string;
          id: string;
          mensalidade: number;
          pago_em: string | null;
          participacoes_excedentes: number;
          participacoes_incluidas: number;
          participacoes_usadas: number;
          plano_id: string | null;
          plano_nome: string;
          provedor: string | null;
          referencia_provedor: string | null;
          status: string;
          total: number;
          valor_excedente_total: number;
          valor_excedente_unit: number;
          vencimento: string;
        };
        Insert: {
          assinatura_id?: string | null;
          atualizado_em?: string;
          ciclo_fim: string;
          ciclo_inicio: string;
          clt_ativos?: number;
          criado_em?: string;
          desconto?: number;
          empresa_id: string;
          id?: string;
          mensalidade: number;
          pago_em?: string | null;
          participacoes_excedentes: number;
          participacoes_incluidas: number;
          participacoes_usadas: number;
          plano_id?: string | null;
          plano_nome: string;
          provedor?: string | null;
          referencia_provedor?: string | null;
          status?: string;
          total: number;
          valor_excedente_total: number;
          valor_excedente_unit: number;
          vencimento: string;
        };
        Update: {
          assinatura_id?: string | null;
          atualizado_em?: string;
          ciclo_fim?: string;
          ciclo_inicio?: string;
          clt_ativos?: number;
          criado_em?: string;
          desconto?: number;
          empresa_id?: string;
          id?: string;
          mensalidade?: number;
          pago_em?: string | null;
          participacoes_excedentes?: number;
          participacoes_incluidas?: number;
          participacoes_usadas?: number;
          plano_id?: string | null;
          plano_nome?: string;
          provedor?: string | null;
          referencia_provedor?: string | null;
          status?: string;
          total?: number;
          valor_excedente_total?: number;
          valor_excedente_unit?: number;
          vencimento?: string;
        };
        Relationships: [
          {
            foreignKeyName: "faturas_plataforma_assinatura_id_fkey";
            columns: ["assinatura_id"];
            isOneToOne: false;
            referencedRelation: "assinaturas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "faturas_plataforma_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "faturas_plataforma_plano_id_fkey";
            columns: ["plano_id"];
            isOneToOne: false;
            referencedRelation: "planos";
            referencedColumns: ["id"];
          },
        ];
      };
      fechamentos: {
        Row: {
          aprovado_em: string | null;
          aprovado_por_id: string | null;
          atualizado_em: string;
          criado_em: string;
          escala_id: string;
          horas_trabalhadas: number;
          id: string;
          status: Database["public"]["Enums"]["status_fechamento"];
          valor_calculado: number;
        };
        Insert: {
          aprovado_em?: string | null;
          aprovado_por_id?: string | null;
          atualizado_em?: string;
          criado_em?: string;
          escala_id: string;
          horas_trabalhadas: number;
          id?: string;
          status?: Database["public"]["Enums"]["status_fechamento"];
          valor_calculado: number;
        };
        Update: {
          aprovado_em?: string | null;
          aprovado_por_id?: string | null;
          atualizado_em?: string;
          criado_em?: string;
          escala_id?: string;
          horas_trabalhadas?: number;
          id?: string;
          status?: Database["public"]["Enums"]["status_fechamento"];
          valor_calculado?: number;
        };
        Relationships: [
          {
            foreignKeyName: "fechamentos_aprovado_por_id_fkey";
            columns: ["aprovado_por_id"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fechamentos_escala_id_fkey";
            columns: ["escala_id"];
            isOneToOne: true;
            referencedRelation: "escalas";
            referencedColumns: ["id"];
          },
        ];
      };
      freelancers: {
        Row: {
          ativo: boolean;
          atualizado_em: string;
          chave_pix: string;
          cpf: string;
          criado_em: string;
          empresa_id: string;
          funcao: string | null;
          id: string;
          nome: string;
          salario_mensal: number | null;
          telefone: string | null;
          tipo_vinculo: string;
        };
        Insert: {
          ativo?: boolean;
          atualizado_em?: string;
          chave_pix: string;
          cpf: string;
          criado_em?: string;
          empresa_id: string;
          funcao?: string | null;
          id?: string;
          nome: string;
          salario_mensal?: number | null;
          telefone?: string | null;
          tipo_vinculo?: string;
        };
        Update: {
          ativo?: boolean;
          atualizado_em?: string;
          chave_pix?: string;
          cpf?: string;
          criado_em?: string;
          empresa_id?: string;
          funcao?: string | null;
          id?: string;
          nome?: string;
          salario_mensal?: number | null;
          telefone?: string | null;
          tipo_vinculo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "freelancers_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      fundings: {
        Row: {
          atualizado_em: string;
          chave_idempotencia: string;
          cobranca_id: string | null;
          criado_em: string;
          criado_por: string;
          empresa_id: string;
          finalidade: string;
          id: string;
          provedor_pagamento: string;
          referencia_parceiro: string | null;
          status: Database["public"]["Enums"]["status_funding"];
          valor_devolvido: number;
          valor_disponivel: number;
          valor_reservado: number;
          valor_total: number;
          valor_utilizado: number;
        };
        Insert: {
          atualizado_em?: string;
          chave_idempotencia: string;
          cobranca_id?: string | null;
          criado_em?: string;
          criado_por: string;
          empresa_id: string;
          finalidade: string;
          id?: string;
          provedor_pagamento?: string;
          referencia_parceiro?: string | null;
          status?: Database["public"]["Enums"]["status_funding"];
          valor_devolvido?: number;
          valor_disponivel?: number;
          valor_reservado?: number;
          valor_total: number;
          valor_utilizado?: number;
        };
        Update: {
          atualizado_em?: string;
          chave_idempotencia?: string;
          cobranca_id?: string | null;
          criado_em?: string;
          criado_por?: string;
          empresa_id?: string;
          finalidade?: string;
          id?: string;
          provedor_pagamento?: string;
          referencia_parceiro?: string | null;
          status?: Database["public"]["Enums"]["status_funding"];
          valor_devolvido?: number;
          valor_disponivel?: number;
          valor_reservado?: number;
          valor_total?: number;
          valor_utilizado?: number;
        };
        Relationships: [
          {
            foreignKeyName: "fundings_cobranca_id_fkey";
            columns: ["cobranca_id"];
            isOneToOne: false;
            referencedRelation: "cobrancas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fundings_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      logs_auditoria: {
        Row: {
          acao: string;
          ator_contexto: string;
          ator_id: string;
          criado_em: string;
          detalhes: Json;
          empresa_id: string | null;
          id: string;
          recurso_id: string | null;
          recurso_tipo: string;
          resultado: string;
        };
        Insert: {
          acao: string;
          ator_contexto: string;
          ator_id: string;
          criado_em?: string;
          detalhes?: Json;
          empresa_id?: string | null;
          id?: string;
          recurso_id?: string | null;
          recurso_tipo: string;
          resultado: string;
        };
        Update: {
          acao?: string;
          ator_contexto?: string;
          ator_id?: string;
          criado_em?: string;
          detalhes?: Json;
          empresa_id?: string | null;
          id?: string;
          recurso_id?: string | null;
          recurso_tipo?: string;
          resultado?: string;
        };
        Relationships: [
          {
            foreignKeyName: "logs_auditoria_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      lotes_pagamento: {
        Row: {
          aprovado_em: string | null;
          aprovado_por: string | null;
          atualizado_em: string;
          chave_idempotencia: string | null;
          criado_em: string;
          descricao: string;
          empresa_id: string;
          evento_id: string | null;
          id: string;
          status: Database["public"]["Enums"]["status_lote_pagamento"];
          valor_total: number;
        };
        Insert: {
          aprovado_em?: string | null;
          aprovado_por?: string | null;
          atualizado_em?: string;
          chave_idempotencia?: string | null;
          criado_em?: string;
          descricao: string;
          empresa_id: string;
          evento_id?: string | null;
          id?: string;
          status?: Database["public"]["Enums"]["status_lote_pagamento"];
          valor_total?: number;
        };
        Update: {
          aprovado_em?: string | null;
          aprovado_por?: string | null;
          atualizado_em?: string;
          chave_idempotencia?: string | null;
          criado_em?: string;
          descricao?: string;
          empresa_id?: string;
          evento_id?: string | null;
          id?: string;
          status?: Database["public"]["Enums"]["status_lote_pagamento"];
          valor_total?: number;
        };
        Relationships: [
          {
            foreignKeyName: "lotes_pagamento_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lotes_pagamento_evento_id_fkey";
            columns: ["evento_id"];
            isOneToOne: false;
            referencedRelation: "eventos";
            referencedColumns: ["id"];
          },
        ];
      };
      mercado_pago_contas: {
        Row: {
          access_token_cifrado: string;
          atualizado_em: string;
          criado_em: string;
          empresa_id: string;
          escopos: string | null;
          id: string;
          mercado_pago_user_id: string;
          refresh_token_cifrado: string | null;
          status: string;
          token_expira_em: string | null;
        };
        Insert: {
          access_token_cifrado: string;
          atualizado_em?: string;
          criado_em?: string;
          empresa_id: string;
          escopos?: string | null;
          id?: string;
          mercado_pago_user_id: string;
          refresh_token_cifrado?: string | null;
          status?: string;
          token_expira_em?: string | null;
        };
        Update: {
          access_token_cifrado?: string;
          atualizado_em?: string;
          criado_em?: string;
          empresa_id?: string;
          escopos?: string | null;
          id?: string;
          mercado_pago_user_id?: string;
          refresh_token_cifrado?: string | null;
          status?: string;
          token_expira_em?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mercado_pago_contas_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: true;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      mercado_pago_oauth_estados: {
        Row: {
          criado_em: string;
          empresa_id: string;
          estado_hash: string;
          expira_em: string;
          id: string;
          redirect_uri: string;
          usado_em: string | null;
          user_id: string;
        };
        Insert: {
          criado_em?: string;
          empresa_id: string;
          estado_hash: string;
          expira_em: string;
          id?: string;
          redirect_uri: string;
          usado_em?: string | null;
          user_id: string;
        };
        Update: {
          criado_em?: string;
          empresa_id?: string;
          estado_hash?: string;
          expira_em?: string;
          id?: string;
          redirect_uri?: string;
          usado_em?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mercado_pago_oauth_estados_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      movimentos_saldo: {
        Row: {
          atualizado_em: string;
          cobranca_id: string | null;
          criado_em: string;
          descricao: string;
          empresa_id: string;
          id: string;
          pagamento_id: string | null;
          taxa_id: string | null;
          tipo: Database["public"]["Enums"]["tipo_movimento"];
          valor: number;
        };
        Insert: {
          atualizado_em?: string;
          cobranca_id?: string | null;
          criado_em?: string;
          descricao?: string;
          empresa_id: string;
          id?: string;
          pagamento_id?: string | null;
          taxa_id?: string | null;
          tipo: Database["public"]["Enums"]["tipo_movimento"];
          valor: number;
        };
        Update: {
          atualizado_em?: string;
          cobranca_id?: string | null;
          criado_em?: string;
          descricao?: string;
          empresa_id?: string;
          id?: string;
          pagamento_id?: string | null;
          taxa_id?: string | null;
          tipo?: Database["public"]["Enums"]["tipo_movimento"];
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "movimentos_saldo_cobranca_id_fkey";
            columns: ["cobranca_id"];
            isOneToOne: false;
            referencedRelation: "cobrancas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "movimentos_saldo_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "movimentos_saldo_pagamento_id_fkey";
            columns: ["pagamento_id"];
            isOneToOne: false;
            referencedRelation: "pagamentos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "movimentos_saldo_taxa_id_fkey";
            columns: ["taxa_id"];
            isOneToOne: false;
            referencedRelation: "taxas_plataforma";
            referencedColumns: ["id"];
          },
        ];
      };
      ocorrencias: {
        Row: {
          atualizado_em: string;
          criado_em: string;
          descricao: string;
          escala_id: string;
          id: string;
          registrado_por_id: string | null;
        };
        Insert: {
          atualizado_em?: string;
          criado_em?: string;
          descricao: string;
          escala_id: string;
          id?: string;
          registrado_por_id?: string | null;
        };
        Update: {
          atualizado_em?: string;
          criado_em?: string;
          descricao?: string;
          escala_id?: string;
          id?: string;
          registrado_por_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ocorrencias_escala_id_fkey";
            columns: ["escala_id"];
            isOneToOne: false;
            referencedRelation: "escalas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ocorrencias_registrado_por_id_fkey";
            columns: ["registrado_por_id"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
        ];
      };
      pagamentos: {
        Row: {
          atualizado_em: string;
          chave_idempotencia: string;
          chave_pix_destino: string | null;
          comprovante_url: string | null;
          criado_em: string;
          data_agendada: string | null;
          erro: string | null;
          executado_em: string | null;
          fechamento_id: string;
          id: string;
          parceiro_transferencia_id: string | null;
          provedor_pagamento: string;
          status: Database["public"]["Enums"]["status_pagamento"];
          tentativas: number;
          txid_parceiro: string | null;
          valor: number;
        };
        Insert: {
          atualizado_em?: string;
          chave_idempotencia: string;
          chave_pix_destino?: string | null;
          comprovante_url?: string | null;
          criado_em?: string;
          data_agendada?: string | null;
          erro?: string | null;
          executado_em?: string | null;
          fechamento_id: string;
          id?: string;
          parceiro_transferencia_id?: string | null;
          provedor_pagamento?: string;
          status?: Database["public"]["Enums"]["status_pagamento"];
          tentativas?: number;
          txid_parceiro?: string | null;
          valor: number;
        };
        Update: {
          atualizado_em?: string;
          chave_idempotencia?: string;
          chave_pix_destino?: string | null;
          comprovante_url?: string | null;
          criado_em?: string;
          data_agendada?: string | null;
          erro?: string | null;
          executado_em?: string | null;
          fechamento_id?: string;
          id?: string;
          parceiro_transferencia_id?: string | null;
          provedor_pagamento?: string;
          status?: Database["public"]["Enums"]["status_pagamento"];
          tentativas?: number;
          txid_parceiro?: string | null;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pagamentos_fechamento_id_fkey";
            columns: ["fechamento_id"];
            isOneToOne: true;
            referencedRelation: "fechamentos";
            referencedColumns: ["id"];
          },
        ];
      };
      participacoes_operacionais: {
        Row: {
          ativa: boolean;
          atualizado_em: string;
          data_evento: string;
          desativada_em: string | null;
          empresa_id: string;
          evento_id: string;
          freelancer_id: string;
          id: string;
          primeira_confirmacao_em: string;
        };
        Insert: {
          ativa?: boolean;
          atualizado_em?: string;
          data_evento: string;
          desativada_em?: string | null;
          empresa_id: string;
          evento_id: string;
          freelancer_id: string;
          id?: string;
          primeira_confirmacao_em?: string;
        };
        Update: {
          ativa?: boolean;
          atualizado_em?: string;
          data_evento?: string;
          desativada_em?: string | null;
          empresa_id?: string;
          evento_id?: string;
          freelancer_id?: string;
          id?: string;
          primeira_confirmacao_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: "participacoes_operacionais_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "participacoes_operacionais_evento_id_fkey";
            columns: ["evento_id"];
            isOneToOne: false;
            referencedRelation: "eventos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "participacoes_operacionais_freelancer_id_fkey";
            columns: ["freelancer_id"];
            isOneToOne: false;
            referencedRelation: "freelancers";
            referencedColumns: ["id"];
          },
        ];
      };
      planos: {
        Row: {
          ativo: boolean;
          atualizado_em: string;
          aviso_vendas_acima: number | null;
          codigo: string | null;
          criado_em: string;
          descricao: string | null;
          dias_trial: number;
          id: string;
          limite_clt: number | null;
          limite_eventos_ciclo: number | null;
          limite_pessoas_evento: number | null;
          limite_supervisores: number | null;
          mensalidade: number;
          modelo: Database["public"]["Enums"]["modelo_cobranca"];
          nome: string;
          ordem: number;
          participacoes_incluidas: number;
          percentual: number;
          recursos: Json;
          retencao_evidencias_dias: number | null;
          taxa_fixa_pix: number;
          valor_excedente: number;
        };
        Insert: {
          ativo?: boolean;
          atualizado_em?: string;
          aviso_vendas_acima?: number | null;
          codigo?: string | null;
          criado_em?: string;
          descricao?: string | null;
          dias_trial?: number;
          id?: string;
          limite_clt?: number | null;
          limite_eventos_ciclo?: number | null;
          limite_pessoas_evento?: number | null;
          limite_supervisores?: number | null;
          mensalidade?: number;
          modelo?: Database["public"]["Enums"]["modelo_cobranca"];
          nome: string;
          ordem?: number;
          participacoes_incluidas?: number;
          percentual?: number;
          recursos?: Json;
          retencao_evidencias_dias?: number | null;
          taxa_fixa_pix?: number;
          valor_excedente?: number;
        };
        Update: {
          ativo?: boolean;
          atualizado_em?: string;
          aviso_vendas_acima?: number | null;
          codigo?: string | null;
          criado_em?: string;
          descricao?: string | null;
          dias_trial?: number;
          id?: string;
          limite_clt?: number | null;
          limite_eventos_ciclo?: number | null;
          limite_pessoas_evento?: number | null;
          limite_supervisores?: number | null;
          mensalidade?: number;
          modelo?: Database["public"]["Enums"]["modelo_cobranca"];
          nome?: string;
          ordem?: number;
          participacoes_incluidas?: number;
          percentual?: number;
          recursos?: Json;
          retencao_evidencias_dias?: number | null;
          taxa_fixa_pix?: number;
          valor_excedente?: number;
        };
        Relationships: [];
      };
      planos_historico: {
        Row: {
          alterado_por: string | null;
          antes: Json;
          criado_em: string;
          depois: Json;
          id: string;
          plano_id: string;
        };
        Insert: {
          alterado_por?: string | null;
          antes: Json;
          criado_em?: string;
          depois: Json;
          id?: string;
          plano_id: string;
        };
        Update: {
          alterado_por?: string | null;
          antes?: Json;
          criado_em?: string;
          depois?: Json;
          id?: string;
          plano_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "planos_historico_plano_id_fkey";
            columns: ["plano_id"];
            isOneToOne: false;
            referencedRelation: "planos";
            referencedColumns: ["id"];
          },
        ];
      };
      plataforma_usuarios: {
        Row: {
          criado_em: string;
          id: string;
          papel: Database["public"]["Enums"]["papel_plataforma"];
          user_id: string;
        };
        Insert: {
          criado_em?: string;
          id?: string;
          papel: Database["public"]["Enums"]["papel_plataforma"];
          user_id: string;
        };
        Update: {
          criado_em?: string;
          id?: string;
          papel?: Database["public"]["Enums"]["papel_plataforma"];
          user_id?: string;
        };
        Relationships: [];
      };
      pontos: {
        Row: {
          aprovado_em: string | null;
          aprovado_por_id: string | null;
          atualizado_em: string;
          criado_em: string;
          device_hash: string | null;
          escala_id: string;
          evidencia_expira_em: string | null;
          fora_horario: boolean;
          foto_url: string | null;
          gps_lat: number | null;
          gps_lng: number | null;
          id: string;
          metodo: Database["public"]["Enums"]["metodo_check"];
          motivo_recusa: string | null;
          registrado_em: string;
          selfie_consentimento_aceito_em: string | null;
          selfie_expira_em: string | null;
          status: Database["public"]["Enums"]["status_ponto"];
          tipo: Database["public"]["Enums"]["tipo_ponto"];
        };
        Insert: {
          aprovado_em?: string | null;
          aprovado_por_id?: string | null;
          atualizado_em?: string;
          criado_em?: string;
          device_hash?: string | null;
          escala_id: string;
          evidencia_expira_em?: string | null;
          fora_horario?: boolean;
          foto_url?: string | null;
          gps_lat?: number | null;
          gps_lng?: number | null;
          id?: string;
          metodo: Database["public"]["Enums"]["metodo_check"];
          motivo_recusa?: string | null;
          registrado_em?: string;
          selfie_consentimento_aceito_em?: string | null;
          selfie_expira_em?: string | null;
          status?: Database["public"]["Enums"]["status_ponto"];
          tipo: Database["public"]["Enums"]["tipo_ponto"];
        };
        Update: {
          aprovado_em?: string | null;
          aprovado_por_id?: string | null;
          atualizado_em?: string;
          criado_em?: string;
          device_hash?: string | null;
          escala_id?: string;
          evidencia_expira_em?: string | null;
          fora_horario?: boolean;
          foto_url?: string | null;
          gps_lat?: number | null;
          gps_lng?: number | null;
          id?: string;
          metodo?: Database["public"]["Enums"]["metodo_check"];
          motivo_recusa?: string | null;
          registrado_em?: string;
          selfie_consentimento_aceito_em?: string | null;
          selfie_expira_em?: string | null;
          status?: Database["public"]["Enums"]["status_ponto"];
          tipo?: Database["public"]["Enums"]["tipo_ponto"];
        };
        Relationships: [
          {
            foreignKeyName: "pontos_aprovado_por_id_fkey";
            columns: ["aprovado_por_id"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pontos_escala_id_fkey";
            columns: ["escala_id"];
            isOneToOne: false;
            referencedRelation: "escalas";
            referencedColumns: ["id"];
          },
        ];
      };
      suporte_atendimentos: {
        Row: {
          empresa_id: string;
          encerrado_em: string | null;
          id: string;
          iniciado_em: string;
          motivo: string;
          usuario_id: string;
        };
        Insert: {
          empresa_id: string;
          encerrado_em?: string | null;
          id?: string;
          iniciado_em?: string;
          motivo: string;
          usuario_id: string;
        };
        Update: {
          empresa_id?: string;
          encerrado_em?: string | null;
          id?: string;
          iniciado_em?: string;
          motivo?: string;
          usuario_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "suporte_atendimentos_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      taxas_meio_pagamento: {
        Row: {
          ativo: boolean;
          atualizado_em: string;
          id: string;
          metodo: string;
          rotulo: string;
          taxa: number;
        };
        Insert: {
          ativo?: boolean;
          atualizado_em?: string;
          id?: string;
          metodo: string;
          rotulo: string;
          taxa: number;
        };
        Update: {
          ativo?: boolean;
          atualizado_em?: string;
          id?: string;
          metodo?: string;
          rotulo?: string;
          taxa?: number;
        };
        Relationships: [];
      };
      taxas_plataforma: {
        Row: {
          atualizado_em: string;
          base_calculo: number;
          cobranca_id: string | null;
          criado_em: string;
          empresa_id: string;
          evento_id: string | null;
          id: string;
          modelo: Database["public"]["Enums"]["modelo_cobranca"];
          pagamento_id: string | null;
          status: Database["public"]["Enums"]["status_taxa"];
          valor: number;
        };
        Insert: {
          atualizado_em?: string;
          base_calculo?: number;
          cobranca_id?: string | null;
          criado_em?: string;
          empresa_id: string;
          evento_id?: string | null;
          id?: string;
          modelo: Database["public"]["Enums"]["modelo_cobranca"];
          pagamento_id?: string | null;
          status?: Database["public"]["Enums"]["status_taxa"];
          valor: number;
        };
        Update: {
          atualizado_em?: string;
          base_calculo?: number;
          cobranca_id?: string | null;
          criado_em?: string;
          empresa_id?: string;
          evento_id?: string | null;
          id?: string;
          modelo?: Database["public"]["Enums"]["modelo_cobranca"];
          pagamento_id?: string | null;
          status?: Database["public"]["Enums"]["status_taxa"];
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "taxas_plataforma_cobranca_id_fkey";
            columns: ["cobranca_id"];
            isOneToOne: false;
            referencedRelation: "cobrancas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "taxas_plataforma_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "taxas_plataforma_evento_id_fkey";
            columns: ["evento_id"];
            isOneToOne: false;
            referencedRelation: "eventos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "taxas_plataforma_pagamento_id_fkey";
            columns: ["pagamento_id"];
            isOneToOne: false;
            referencedRelation: "pagamentos";
            referencedColumns: ["id"];
          },
        ];
      };
      tentativas_ponto_publico: {
        Row: {
          acao: string;
          cpf_hash: string | null;
          criado_em: string;
          id: string;
          ip_hash: string;
          sucesso: boolean;
          token_hash: string;
        };
        Insert: {
          acao: string;
          cpf_hash?: string | null;
          criado_em?: string;
          id?: string;
          ip_hash: string;
          sucesso?: boolean;
          token_hash: string;
        };
        Update: {
          acao?: string;
          cpf_hash?: string | null;
          criado_em?: string;
          id?: string;
          ip_hash?: string;
          sucesso?: boolean;
          token_hash?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          criado_em: string;
          id: string;
          role: Database["public"]["Enums"]["papel_usuario"];
          user_id: string;
        };
        Insert: {
          criado_em?: string;
          id?: string;
          role: Database["public"]["Enums"]["papel_usuario"];
          user_id: string;
        };
        Update: {
          criado_em?: string;
          id?: string;
          role?: Database["public"]["Enums"]["papel_usuario"];
          user_id?: string;
        };
        Relationships: [];
      };
      usuarios: {
        Row: {
          ativo: boolean;
          atualizado_em: string;
          criado_em: string;
          email: string;
          empresa_id: string | null;
          id: string;
          nome: string;
        };
        Insert: {
          ativo?: boolean;
          atualizado_em?: string;
          criado_em?: string;
          email?: string;
          empresa_id?: string | null;
          id: string;
          nome?: string;
        };
        Update: {
          ativo?: boolean;
          atualizado_em?: string;
          criado_em?: string;
          email?: string;
          empresa_id?: string | null;
          id?: string;
          nome?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usuarios_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_eventos: {
        Row: {
          atualizado_em: string;
          chave_idempotencia: string;
          criado_em: string;
          evento: string;
          id: string;
          payload: Json;
          provedor: string;
          status: string;
        };
        Insert: {
          atualizado_em?: string;
          chave_idempotencia: string;
          criado_em?: string;
          evento: string;
          id?: string;
          payload?: Json;
          provedor?: string;
          status?: string;
        };
        Update: {
          atualizado_em?: string;
          chave_idempotencia?: string;
          criado_em?: string;
          evento?: string;
          id?: string;
          payload?: Json;
          provedor?: string;
          status?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      abrir_ciclo_cobranca: { Args: { _empresa_id: string }; Returns: string };
      ciclo_da_empresa: {
        Args: { _empresa_id: string; _ref?: string };
        Returns: {
          fim: string;
          inicio: string;
        }[];
      };
      contar_clt_ativos: { Args: { _empresa_id: string }; Returns: number };
      contar_eventos_ciclo: {
        Args: { _empresa_id: string; _ref?: string };
        Returns: number;
      };
      contar_participacoes_ciclo: {
        Args: { _empresa_id: string; _ref?: string };
        Returns: number;
      };
      criar_empresa: { Args: { _cnpj: string; _nome: string }; Returns: string };
      eh_equipe_plataforma: { Args: never; Returns: boolean };
      empresa_atual: { Args: never; Returns: string };
      empresa_da_equipe: { Args: { _equipe_id: string }; Returns: string };
      empresa_da_escala: { Args: { _escala_id: string }; Returns: string };
      empresa_do_fechamento: {
        Args: { _fechamento_id: string };
        Returns: string;
      };
      empresa_fiscal_validada: {
        Args: { _empresa_id: string };
        Returns: boolean;
      };
      encerrar_atendimento: {
        Args: { _atendimento_id: string };
        Returns: undefined;
      };
      fechar_fatura_ciclo: {
        Args: { _empresa_id: string; _ref: string };
        Returns: string;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["papel_usuario"];
          _user_id: string;
        };
        Returns: boolean;
      };
      iniciar_atendimento: {
        Args: { _empresa_id: string; _motivo: string };
        Returns: string;
      };
      plano_da_empresa: {
        Args: { _empresa_id: string };
        Returns: {
          ativo: boolean;
          atualizado_em: string;
          aviso_vendas_acima: number | null;
          codigo: string | null;
          criado_em: string;
          descricao: string | null;
          dias_trial: number;
          id: string;
          limite_clt: number | null;
          limite_eventos_ciclo: number | null;
          limite_pessoas_evento: number | null;
          limite_supervisores: number | null;
          mensalidade: number;
          modelo: Database["public"]["Enums"]["modelo_cobranca"];
          nome: string;
          ordem: number;
          participacoes_incluidas: number;
          percentual: number;
          recursos: Json;
          retencao_evidencias_dias: number | null;
          taxa_fixa_pix: number;
          valor_excedente: number;
        };
        SetofOptions: {
          from: "*";
          to: "planos";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      preco_efetivo: {
        Args: { _empresa_id: string };
        Returns: {
          cupom_codigo: string;
          em_trial: boolean;
          mensalidade: number;
          modelo: Database["public"]["Enums"]["modelo_cobranca"];
          percentual: number;
          plano_nome: string;
          status: string;
          taxa_fixa_pix: number;
          trial_ate: string;
        }[];
      };
      processar_cobranca_v2: { Args: never; Returns: undefined };
      recurso_habilitado: {
        Args: { _empresa_id: string; _recurso: string };
        Returns: boolean;
      };
      resumo_uso_empresa: {
        Args: { _empresa_id: string };
        Returns: {
          aviso_vendas: boolean;
          ciclo_fim: string;
          ciclo_inicio: string;
          clt_ativos: number;
          estimativa: number;
          eventos_usados: number;
          limite_clt: number;
          limite_eventos: number;
          limite_pessoas_evento: number;
          limite_supervisores: number;
          mensalidade: number;
          participacoes_excedentes: number;
          participacoes_incluidas: number;
          participacoes_usadas: number;
          plano_codigo: string;
          plano_id: string;
          plano_nome: string;
          recursos: Json;
          valor_excedente: number;
        }[];
      };
      saldo_empresa: { Args: { _empresa_id: string }; Returns: number };
      sincronizar_participacao: {
        Args: { _evento_id: string; _freelancer_id: string };
        Returns: undefined;
      };
      tem_capacidade: {
        Args: { _capacidade: string; _user_id: string };
        Returns: boolean;
      };
      tem_papel_plataforma: {
        Args: {
          _papel: Database["public"]["Enums"]["papel_plataforma"];
          _user_id: string;
        };
        Returns: boolean;
      };
      validar_acesso_cobranca: {
        Args: { _empresa_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      forma_cobranca: "pix" | "boleto" | "cartao";
      metodo_check: "qrcode" | "selfie" | "manual";
      modelo_cobranca: "percentual_evento" | "taxa_fixa_pix" | "assinatura_percentual";
      papel_plataforma: "admin_master" | "suporte";
      papel_usuario: "admin" | "coordenador" | "financeiro" | "supervisor";
      status_cobranca: "rascunho" | "aguardando_pagamento" | "pago" | "vencido" | "cancelado";
      status_documento_fiscal:
        "pending" | "received" | "validated_manually" | "rejected" | "cancelled";
      status_escala: "convidado" | "confirmado" | "recusado" | "substituido";
      status_evento:
        | "planejamento"
        | "escala"
        | "confirmacoes"
        | "pronto"
        | "em_execucao"
        | "encerrando"
        | "fechamento"
        | "pagamento"
        | "concluido"
        | "arquivado"
        | "cancelado";
      status_fechamento: "pendente_aprovacao" | "aprovado" | "contestado";
      status_funding:
        | "draft"
        | "pending"
        | "available"
        | "partially_reserved"
        | "reserved"
        | "consumed"
        | "refund_pending"
        | "refunded"
        | "failed"
        | "cancelled";
      status_lote_pagamento:
        | "draft"
        | "awaiting_approval"
        | "approved"
        | "funding_pending"
        | "funded"
        | "processing"
        | "partially_paid"
        | "paid"
        | "failed"
        | "cancelled";
      status_pagamento: "pendente" | "agendado" | "executado" | "falhou";
      status_ponto: "pendente" | "aprovado" | "recusado";
      status_taxa: "pendente" | "cobrada" | "isenta";
      tipo_cobranca: "aporte_agencia" | "cobranca_cliente";
      tipo_documento_fiscal: "nfse" | "nfe" | "rpa" | "receipt" | "other";
      tipo_movimento: "credito" | "debito";
      tipo_pessoa: "pf" | "pj";
      tipo_ponto: "entrada" | "saida" | "inicio_intervalo" | "fim_intervalo";
      tipo_valor: "diaria" | "hora";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      forma_cobranca: ["pix", "boleto", "cartao"],
      metodo_check: ["qrcode", "selfie", "manual"],
      modelo_cobranca: ["percentual_evento", "taxa_fixa_pix", "assinatura_percentual"],
      papel_plataforma: ["admin_master", "suporte"],
      papel_usuario: ["admin", "coordenador", "financeiro", "supervisor"],
      status_cobranca: ["rascunho", "aguardando_pagamento", "pago", "vencido", "cancelado"],
      status_documento_fiscal: [
        "pending",
        "received",
        "validated_manually",
        "rejected",
        "cancelled",
      ],
      status_escala: ["convidado", "confirmado", "recusado", "substituido"],
      status_evento: [
        "planejamento",
        "escala",
        "confirmacoes",
        "pronto",
        "em_execucao",
        "encerrando",
        "fechamento",
        "pagamento",
        "concluido",
        "arquivado",
        "cancelado",
      ],
      status_fechamento: ["pendente_aprovacao", "aprovado", "contestado"],
      status_funding: [
        "draft",
        "pending",
        "available",
        "partially_reserved",
        "reserved",
        "consumed",
        "refund_pending",
        "refunded",
        "failed",
        "cancelled",
      ],
      status_lote_pagamento: [
        "draft",
        "awaiting_approval",
        "approved",
        "funding_pending",
        "funded",
        "processing",
        "partially_paid",
        "paid",
        "failed",
        "cancelled",
      ],
      status_pagamento: ["pendente", "agendado", "executado", "falhou"],
      status_ponto: ["pendente", "aprovado", "recusado"],
      status_taxa: ["pendente", "cobrada", "isenta"],
      tipo_cobranca: ["aporte_agencia", "cobranca_cliente"],
      tipo_documento_fiscal: ["nfse", "nfe", "rpa", "receipt", "other"],
      tipo_movimento: ["credito", "debito"],
      tipo_pessoa: ["pf", "pj"],
      tipo_ponto: ["entrada", "saida", "inicio_intervalo", "fim_intervalo"],
      tipo_valor: ["diaria", "hora"],
    },
  },
} as const;
