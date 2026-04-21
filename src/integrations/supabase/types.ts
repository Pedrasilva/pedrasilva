export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      benefit_expenses: {
        Row: {
          ano_fiscal: number
          aprovado_em: string | null
          aprovado_por: string | null
          categoria: Database["public"]["Enums"]["benefit_category"]
          collaborator_id: string
          created_at: string
          data_despesa: string
          descricao: string
          estado: Database["public"]["Enums"]["expense_status"]
          foto_path: string | null
          id: string
          notas_aprovacao: string | null
          notas_colaborador: string | null
          pago_em: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          ano_fiscal?: number
          aprovado_em?: string | null
          aprovado_por?: string | null
          categoria: Database["public"]["Enums"]["benefit_category"]
          collaborator_id: string
          created_at?: string
          data_despesa: string
          descricao: string
          estado?: Database["public"]["Enums"]["expense_status"]
          foto_path?: string | null
          id?: string
          notas_aprovacao?: string | null
          notas_colaborador?: string | null
          pago_em?: string | null
          updated_at?: string
          valor: number
        }
        Update: {
          ano_fiscal?: number
          aprovado_em?: string | null
          aprovado_por?: string | null
          categoria?: Database["public"]["Enums"]["benefit_category"]
          collaborator_id?: string
          created_at?: string
          data_despesa?: string
          descricao?: string
          estado?: Database["public"]["Enums"]["expense_status"]
          foto_path?: string | null
          id?: string
          notas_aprovacao?: string | null
          notas_colaborador?: string | null
          pago_em?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "benefit_expenses_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      bo_settings: {
        Row: {
          created_at: string
          custos_operacionais_anual: number
          dias_uteis: number
          horas_dia: number
          id: string
          margem_lucro_pct: number
          notas: string | null
          singleton: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          custos_operacionais_anual?: number
          dias_uteis?: number
          horas_dia?: number
          id?: string
          margem_lucro_pct?: number
          notas?: string | null
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          custos_operacionais_anual?: number
          dias_uteis?: number
          horas_dia?: number
          id?: string
          margem_lucro_pct?: number
          notas?: string | null
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      collaborators: {
        Row: {
          ano_fiscal: number
          created_at: string
          data_nascimento: string | null
          departamento: Database["public"]["Enums"]["department"]
          dependentes_com_deficiencia: number
          dias_ferias_anuais: number
          dias_ferias_extra: number
          email: string | null
          estado_civil: string
          id: string
          inicio_carreira: string | null
          localizacao: string
          margem_lucro_pct_override: number | null
          nome: string
          numero_colaborador: string | null
          numero_dependentes: number
          numero_titulares: number
          saldo_ferias_anterior: number
          situacao_contractual: string | null
          updated_at: string
        }
        Insert: {
          ano_fiscal?: number
          created_at?: string
          data_nascimento?: string | null
          departamento?: Database["public"]["Enums"]["department"]
          dependentes_com_deficiencia?: number
          dias_ferias_anuais?: number
          dias_ferias_extra?: number
          email?: string | null
          estado_civil?: string
          id?: string
          inicio_carreira?: string | null
          localizacao?: string
          margem_lucro_pct_override?: number | null
          nome: string
          numero_colaborador?: string | null
          numero_dependentes?: number
          numero_titulares?: number
          saldo_ferias_anterior?: number
          situacao_contractual?: string | null
          updated_at?: string
        }
        Update: {
          ano_fiscal?: number
          created_at?: string
          data_nascimento?: string | null
          departamento?: Database["public"]["Enums"]["department"]
          dependentes_com_deficiencia?: number
          dias_ferias_anuais?: number
          dias_ferias_extra?: number
          email?: string | null
          estado_civil?: string
          id?: string
          inicio_carreira?: string | null
          localizacao?: string
          margem_lucro_pct_override?: number | null
          nome?: string
          numero_colaborador?: string | null
          numero_dependentes?: number
          numero_titulares?: number
          saldo_ferias_anterior?: number
          situacao_contractual?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          industria: string | null
          morada: string | null
          nome: string
          notas: string | null
          status: Database["public"]["Enums"]["company_status"]
          telefone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          industria?: string | null
          morada?: string | null
          nome: string
          notas?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          telefone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          industria?: string | null
          morada?: string | null
          nome?: string
          notas?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          telefone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          apelido: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          notas: string | null
          posicao: string | null
          primeiro_nome: string
          telefone: string | null
          telemovel: string | null
          titulo: string | null
          updated_at: string
        }
        Insert: {
          apelido?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          notas?: string | null
          posicao?: string | null
          primeiro_nome: string
          telefone?: string | null
          telemovel?: string | null
          titulo?: string | null
          updated_at?: string
        }
        Update: {
          apelido?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          notas?: string | null
          posicao?: string | null
          primeiro_nome?: string
          telefone?: string | null
          telemovel?: string | null
          titulo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          data_actividade: string
          detalhes: string | null
          id: string
          proposal_id: string | null
          resumo: string
          tipo: Database["public"]["Enums"]["crm_activity_type"]
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          data_actividade?: string
          detalhes?: string | null
          id?: string
          proposal_id?: string | null
          resumo: string
          tipo?: Database["public"]["Enums"]["crm_activity_type"]
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          data_actividade?: string
          detalhes?: string | null
          id?: string
          proposal_id?: string | null
          resumo?: string
          tipo?: Database["public"]["Enums"]["crm_activity_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "fee_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_proposals: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          data_decisao: string | null
          data_proposta: string | null
          id: string
          notas: string | null
          pipeline_status: Database["public"]["Enums"]["proposal_status"]
          pm_project_id: string | null
          probabilidade: number
          titulo: string
          updated_at: string
          valor: number
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          data_decisao?: string | null
          data_proposta?: string | null
          id?: string
          notas?: string | null
          pipeline_status?: Database["public"]["Enums"]["proposal_status"]
          pm_project_id?: string | null
          probabilidade?: number
          titulo: string
          updated_at?: string
          valor?: number
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          data_decisao?: string | null
          data_proposta?: string | null
          id?: string
          notas?: string | null
          pipeline_status?: Database["public"]["Enums"]["proposal_status"]
          pm_project_id?: string | null
          probabilidade?: number
          titulo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fee_proposals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_proposals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_proposals_pm_project_id_fkey"
            columns: ["pm_project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          data: string
          id: string
          nome: string
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: string
          id?: string
          nome: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: string
          id?: string
          nome?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      irs_tax_brackets: {
        Row: {
          ano_fiscal: number
          created_at: string
          formula_constante: number | null
          formula_factor: number | null
          id: string
          localizacao: string
          notas: string | null
          numero_dependentes: number
          parcela_abater: number
          parcela_adicional_por_dependente: number
          rendimento_max: number | null
          rendimento_min: number
          tabela: string
          taxa: number
          updated_at: string
        }
        Insert: {
          ano_fiscal: number
          created_at?: string
          formula_constante?: number | null
          formula_factor?: number | null
          id?: string
          localizacao: string
          notas?: string | null
          numero_dependentes?: number
          parcela_abater?: number
          parcela_adicional_por_dependente?: number
          rendimento_max?: number | null
          rendimento_min: number
          tabela: string
          taxa: number
          updated_at?: string
        }
        Update: {
          ano_fiscal?: number
          created_at?: string
          formula_constante?: number | null
          formula_factor?: number | null
          id?: string
          localizacao?: string
          notas?: string | null
          numero_dependentes?: number
          parcela_abater?: number
          parcela_adicional_por_dependente?: number
          rendimento_max?: number | null
          rendimento_min?: number
          tabela?: string
          taxa?: number
          updated_at?: string
        }
        Relationships: []
      }
      meal_allowance_rates: {
        Row: {
          ano: number
          created_at: string
          id: string
          notas: string | null
          updated_at: string
          valor_cartao: number
          valor_dinheiro: number
        }
        Insert: {
          ano: number
          created_at?: string
          id?: string
          notas?: string | null
          updated_at?: string
          valor_cartao?: number
          valor_dinheiro?: number
        }
        Update: {
          ano?: number
          created_at?: string
          id?: string
          notas?: string | null
          updated_at?: string
          valor_cartao?: number
          valor_dinheiro?: number
        }
        Relationships: []
      }
      pm_activities: {
        Row: {
          author_resource_id: string | null
          body: string | null
          created_at: string
          id: string
          logged_date: string | null
          logged_hours: number
          project_id: string
          stage_id: string | null
          task_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_resource_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          logged_date?: string | null
          logged_hours?: number
          project_id: string
          stage_id?: string | null
          task_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_resource_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          logged_date?: string | null
          logged_hours?: number
          project_id?: string
          stage_id?: string | null
          task_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_activities_author_resource_id_fkey"
            columns: ["author_resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_activities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_activities_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pm_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_activities_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_activity_replies: {
        Row: {
          activity_id: string
          author_resource_id: string | null
          body: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          author_resource_id?: string | null
          body: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          author_resource_id?: string | null
          body?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_activity_replies_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "pm_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_activity_replies_author_resource_id_fkey"
            columns: ["author_resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_allocations: {
        Row: {
          created_at: string
          end_date: string
          hours_per_day: number
          id: string
          resource_id: string
          stage_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          hours_per_day?: number
          id?: string
          resource_id: string
          stage_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          hours_per_day?: number
          id?: string
          resource_id?: string
          stage_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_allocations_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_allocations_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pm_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_expenses: {
        Row: {
          created_at: string
          description: string
          expense_date: string | null
          id: string
          notes: string | null
          project_id: string
          purchase_price: number
          sale_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          expense_date?: string | null
          id?: string
          notes?: string | null
          project_id: string
          purchase_price?: number
          sale_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          expense_date?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          purchase_price?: number
          sale_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          rate: number
          sort_order: number
          stage_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          rate?: number
          sort_order?: number
          stage_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          rate?: number
          sort_order?: number
          stage_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "pm_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_invoice_items_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pm_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_invoice_settings: {
        Row: {
          bank_name: string | null
          company_address: string | null
          company_email: string | null
          company_name: string
          company_nif: string | null
          company_phone: string | null
          created_at: string
          default_notes: string | null
          file_name: string | null
          iban: string | null
          id: string
          invoice_prefix: string
          next_invoice_number: number
          payment_terms_days: number
          project_id: string | null
          singleton: boolean
          updated_at: string
          vat_rate: number
          wd_amount: boolean
          wd_date: boolean
          wd_description: boolean
          wd_group_by: string
          wd_hours: boolean
          wd_include_non_billable: boolean
          wd_owner: boolean
          wd_rate: boolean
          wd_subject: boolean
        }
        Insert: {
          bank_name?: string | null
          company_address?: string | null
          company_email?: string | null
          company_name?: string
          company_nif?: string | null
          company_phone?: string | null
          created_at?: string
          default_notes?: string | null
          file_name?: string | null
          iban?: string | null
          id?: string
          invoice_prefix?: string
          next_invoice_number?: number
          payment_terms_days?: number
          project_id?: string | null
          singleton?: boolean
          updated_at?: string
          vat_rate?: number
          wd_amount?: boolean
          wd_date?: boolean
          wd_description?: boolean
          wd_group_by?: string
          wd_hours?: boolean
          wd_include_non_billable?: boolean
          wd_owner?: boolean
          wd_rate?: boolean
          wd_subject?: boolean
        }
        Update: {
          bank_name?: string | null
          company_address?: string | null
          company_email?: string | null
          company_name?: string
          company_nif?: string | null
          company_phone?: string | null
          created_at?: string
          default_notes?: string | null
          file_name?: string | null
          iban?: string | null
          id?: string
          invoice_prefix?: string
          next_invoice_number?: number
          payment_terms_days?: number
          project_id?: string | null
          singleton?: boolean
          updated_at?: string
          vat_rate?: number
          wd_amount?: boolean
          wd_date?: boolean
          wd_description?: boolean
          wd_group_by?: string
          wd_hours?: boolean
          wd_include_non_billable?: boolean
          wd_owner?: boolean
          wd_rate?: boolean
          wd_subject?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pm_invoice_settings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_invoices: {
        Row: {
          bill_to_address: string | null
          bill_to_email: string | null
          bill_to_name: string | null
          client_address: string | null
          client_name: string
          client_nif: string | null
          contact_name: string | null
          created_at: string
          due_date: string | null
          id: string
          invoice_number: string
          notes: string | null
          paid_date: string | null
          project_id: string
          raised_date: string
          reference: string | null
          status: Database["public"]["Enums"]["pm_invoice_status"]
          subtotal: number
          tax_rate: number
          title: string | null
          total: number
          updated_at: string
          vat_amount: number
        }
        Insert: {
          bill_to_address?: string | null
          bill_to_email?: string | null
          bill_to_name?: string | null
          client_address?: string | null
          client_name?: string
          client_nif?: string | null
          contact_name?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number: string
          notes?: string | null
          paid_date?: string | null
          project_id: string
          raised_date?: string
          reference?: string | null
          status?: Database["public"]["Enums"]["pm_invoice_status"]
          subtotal?: number
          tax_rate?: number
          title?: string | null
          total?: number
          updated_at?: string
          vat_amount?: number
        }
        Update: {
          bill_to_address?: string | null
          bill_to_email?: string | null
          bill_to_name?: string | null
          client_address?: string | null
          client_name?: string
          client_nif?: string | null
          contact_name?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          notes?: string | null
          paid_date?: string | null
          project_id?: string
          raised_date?: string
          reference?: string | null
          status?: Database["public"]["Enums"]["pm_invoice_status"]
          subtotal?: number
          tax_rate?: number
          title?: string | null
          total?: number
          updated_at?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "pm_invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_materials: {
        Row: {
          created_at: string
          description: string
          id: string
          notes: string | null
          project_id: string
          purchase_price: number
          quantity: number
          sale_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          notes?: string | null
          project_id: string
          purchase_price?: number
          quantity?: number
          sale_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          notes?: string | null
          project_id?: string
          purchase_price?: number
          quantity?: number
          sale_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_materials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_project_rate_overrides: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          project_id: string
          project_rate: number
          resource_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          project_id: string
          project_rate?: number
          resource_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          project_id?: string
          project_rate?: number
          resource_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_project_rate_overrides_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_project_rate_overrides_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_projects: {
        Row: {
          client: string | null
          color: string
          created_at: string
          id: string
          name: string
          notes: string | null
          start_date: string
          status: Database["public"]["Enums"]["pm_project_status"]
          updated_at: string
        }
        Insert: {
          client?: string | null
          color?: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["pm_project_status"]
          updated_at?: string
        }
        Update: {
          client?: string | null
          color?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["pm_project_status"]
          updated_at?: string
        }
        Relationships: []
      }
      pm_resource_rates: {
        Row: {
          cost_rate: number
          created_at: string
          effective_from: string
          id: string
          notes: string | null
          resource_id: string
          sale_rate: number
          updated_at: string
        }
        Insert: {
          cost_rate?: number
          created_at?: string
          effective_from: string
          id?: string
          notes?: string | null
          resource_id: string
          sale_rate?: number
          updated_at?: string
        }
        Update: {
          cost_rate?: number
          created_at?: string
          effective_from?: string
          id?: string
          notes?: string | null
          resource_id?: string
          sale_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_resource_rates_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_resources: {
        Row: {
          active: boolean
          collaborator_id: string | null
          color: string
          cost_rate: number
          created_at: string
          email: string | null
          full_name: string | null
          hourly_rate: number
          id: string
          name: string
          notes: string | null
          phone: string | null
          rate_effective_from: string
          role: string | null
          sale_rate: number
          team: string
          updated_at: string
          weekly_capacity: number
        }
        Insert: {
          active?: boolean
          collaborator_id?: string | null
          color?: string
          cost_rate?: number
          created_at?: string
          email?: string | null
          full_name?: string | null
          hourly_rate?: number
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          rate_effective_from?: string
          role?: string | null
          sale_rate?: number
          team?: string
          updated_at?: string
          weekly_capacity?: number
        }
        Update: {
          active?: boolean
          collaborator_id?: string | null
          color?: string
          cost_rate?: number
          created_at?: string
          email?: string | null
          full_name?: string | null
          hourly_rate?: number
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          rate_effective_from?: string
          role?: string | null
          sale_rate?: number
          team?: string
          updated_at?: string
          weekly_capacity?: number
        }
        Relationships: [
          {
            foreignKeyName: "pm_resources_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_stage_dependencies: {
        Row: {
          created_at: string
          id: string
          lag_days: number
          predecessor_id: string
          successor_id: string
          type: Database["public"]["Enums"]["pm_dep_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lag_days?: number
          predecessor_id: string
          successor_id: string
          type?: Database["public"]["Enums"]["pm_dep_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lag_days?: number
          predecessor_id?: string
          successor_id?: string
          type?: Database["public"]["Enums"]["pm_dep_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_stage_dependencies_predecessor_id_fkey"
            columns: ["predecessor_id"]
            isOneToOne: false
            referencedRelation: "pm_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_stage_dependencies_successor_id_fkey"
            columns: ["successor_id"]
            isOneToOne: false
            referencedRelation: "pm_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_stages: {
        Row: {
          budget: number
          color: string
          created_at: string
          end_date: string
          id: string
          name: string
          project_id: string
          sort_order: number
          start_date: string
          updated_at: string
        }
        Insert: {
          budget?: number
          color?: string
          created_at?: string
          end_date: string
          id?: string
          name: string
          project_id: string
          sort_order?: number
          start_date: string
          updated_at?: string
        }
        Update: {
          budget?: number
          color?: string
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          project_id?: string
          sort_order?: number
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_stages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_tasks: {
        Row: {
          activated_at: string | null
          allocation_id: string
          completed_at: string | null
          created_at: string
          id: string
          name: string
          status: Database["public"]["Enums"]["pm_task_status"]
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          allocation_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["pm_task_status"]
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          allocation_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["pm_task_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_tasks_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: true
            referencedRelation: "pm_allocations"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_time_entries: {
        Row: {
          created_at: string
          ended_at: string | null
          entry_date: string
          hours: number
          id: string
          notes: string | null
          source: string
          started_at: string | null
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          entry_date: string
          hours?: number
          id?: string
          notes?: string | null
          source?: string
          started_at?: string | null
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          entry_date?: string
          hours?: number
          id?: string
          notes?: string | null
          source?: string
          started_at?: string | null
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          codigo: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          data_fim: string | null
          data_inicio: string | null
          id: string
          nome: string
          notas: string | null
          orcamento: number | null
          responsavel_id: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          codigo?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: string
          nome: string
          notas?: string | null
          orcamento?: number | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          codigo?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: string
          nome?: string
          notas?: string | null
          orcamento?: number | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_snapshots: {
        Row: {
          ajudas_custo_anual: number
          ano_fiscal: number
          beneficio_carro: number
          beneficio_ticket: number
          collaborator_id: string
          created_at: string
          dependentes_com_deficiencia: number
          dias_uteis: number
          estado_civil: string
          id: string
          irs_calculado_auto: boolean
          irs_pct: number
          is_effective: boolean
          label: string
          localizacao: string
          meses_pagos: number
          notas: string | null
          numero_dependentes: number
          numero_titulares: number
          outros_beneficios: number
          premio_associado: number
          reference_date: string
          ss_atelier_pct: number
          ss_colaborador_pct: number
          subsidio_alimentacao_diario: number
          subsidio_alimentacao_diario_manual: number
          subsidio_alimentacao_manual: boolean
          subsidios_modo: Database["public"]["Enums"]["subsidios_modo"]
          updated_at: string
          valor_base: number
        }
        Insert: {
          ajudas_custo_anual?: number
          ano_fiscal?: number
          beneficio_carro?: number
          beneficio_ticket?: number
          collaborator_id: string
          created_at?: string
          dependentes_com_deficiencia?: number
          dias_uteis?: number
          estado_civil?: string
          id?: string
          irs_calculado_auto?: boolean
          irs_pct?: number
          is_effective?: boolean
          label: string
          localizacao?: string
          meses_pagos?: number
          notas?: string | null
          numero_dependentes?: number
          numero_titulares?: number
          outros_beneficios?: number
          premio_associado?: number
          reference_date: string
          ss_atelier_pct?: number
          ss_colaborador_pct?: number
          subsidio_alimentacao_diario?: number
          subsidio_alimentacao_diario_manual?: number
          subsidio_alimentacao_manual?: boolean
          subsidios_modo?: Database["public"]["Enums"]["subsidios_modo"]
          updated_at?: string
          valor_base?: number
        }
        Update: {
          ajudas_custo_anual?: number
          ano_fiscal?: number
          beneficio_carro?: number
          beneficio_ticket?: number
          collaborator_id?: string
          created_at?: string
          dependentes_com_deficiencia?: number
          dias_uteis?: number
          estado_civil?: string
          id?: string
          irs_calculado_auto?: boolean
          irs_pct?: number
          is_effective?: boolean
          label?: string
          localizacao?: string
          meses_pagos?: number
          notas?: string | null
          numero_dependentes?: number
          numero_titulares?: number
          outros_beneficios?: number
          premio_associado?: number
          reference_date?: string
          ss_atelier_pct?: number
          ss_colaborador_pct?: number
          subsidio_alimentacao_diario?: number
          subsidio_alimentacao_diario_manual?: number
          subsidio_alimentacao_manual?: boolean
          subsidios_modo?: Database["public"]["Enums"]["subsidios_modo"]
          updated_at?: string
          valor_base?: number
        }
        Relationships: [
          {
            foreignKeyName: "salary_snapshots_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vacation_requests: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          collaborator_id: string
          created_at: string
          data_fim: string
          data_inicio: string
          dias_uteis: number
          estado: string
          id: string
          notas: string | null
          tipo: Database["public"]["Enums"]["absence_type"]
          updated_at: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          collaborator_id: string
          created_at?: string
          data_fim: string
          data_inicio: string
          dias_uteis?: number
          estado?: string
          id?: string
          notas?: string | null
          tipo?: Database["public"]["Enums"]["absence_type"]
          updated_at?: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          collaborator_id?: string
          created_at?: string
          data_fim?: string
          data_inicio?: string
          dias_uteis?: number
          estado?: string
          id?: string
          notas?: string | null
          tipo?: Database["public"]["Enums"]["absence_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacation_requests_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_collaborator_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_users_with_roles: {
        Args: never
        Returns: {
          collaborator_departamento: string
          collaborator_id: string
          collaborator_nome: string
          created_at: string
          email: string
          is_admin: boolean
          user_id: string
        }[]
      }
      pm_get_my_resource_id: { Args: never; Returns: string }
      set_user_admin: {
        Args: { _is_admin: boolean; _user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      absence_type:
        | "ferias"
        | "casamento"
        | "falecimento_familiar"
        | "assistencia_filho"
        | "nascimento_filho"
        | "trabalhador_estudante"
        | "doacao_sangue"
        | "autorizada_paga"
        | "autorizada_nao_paga"
      app_role: "admin" | "user"
      benefit_category: "carro" | "ticket" | "premio" | "outros"
      company_status: "activo" | "prospecto" | "inactivo"
      crm_activity_type: "chamada" | "email" | "reuniao" | "nota" | "outro"
      department: "Projecto" | "Backoffice"
      expense_status: "pendente" | "aprovada" | "rejeitada" | "paga"
      pm_dep_type: "FS" | "SS" | "FF" | "SF"
      pm_invoice_status: "draft" | "sent" | "paid" | "overdue" | "cancelled"
      pm_project_status: "active" | "paused" | "archived"
      pm_task_status: "pending" | "active" | "paused" | "done"
      project_status:
        | "proposta"
        | "em_curso"
        | "pausado"
        | "concluido"
        | "cancelado"
      proposal_status:
        | "lead"
        | "proposta_enviada"
        | "negociacao"
        | "ganho"
        | "perdido"
      subsidios_modo: "tradicional" | "duodecimos_50" | "duodecimos_100"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      absence_type: [
        "ferias",
        "casamento",
        "falecimento_familiar",
        "assistencia_filho",
        "nascimento_filho",
        "trabalhador_estudante",
        "doacao_sangue",
        "autorizada_paga",
        "autorizada_nao_paga",
      ],
      app_role: ["admin", "user"],
      benefit_category: ["carro", "ticket", "premio", "outros"],
      company_status: ["activo", "prospecto", "inactivo"],
      crm_activity_type: ["chamada", "email", "reuniao", "nota", "outro"],
      department: ["Projecto", "Backoffice"],
      expense_status: ["pendente", "aprovada", "rejeitada", "paga"],
      pm_dep_type: ["FS", "SS", "FF", "SF"],
      pm_invoice_status: ["draft", "sent", "paid", "overdue", "cancelled"],
      pm_project_status: ["active", "paused", "archived"],
      pm_task_status: ["pending", "active", "paused", "done"],
      project_status: [
        "proposta",
        "em_curso",
        "pausado",
        "concluido",
        "cancelado",
      ],
      proposal_status: [
        "lead",
        "proposta_enviada",
        "negociacao",
        "ganho",
        "perdido",
      ],
      subsidios_modo: ["tradicional", "duodecimos_50", "duodecimos_100"],
    },
  },
} as const
