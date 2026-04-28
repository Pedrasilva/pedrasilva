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
      bank_accounts: {
        Row: {
          account_name: string
          bank_name: string | null
          created_at: string
          currency: string
          id: string
          is_active: boolean
          notes: string | null
          updated_at: string
        }
        Insert: {
          account_name: string
          bank_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string
          bank_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bank_balance_snapshots: {
        Row: {
          balance: number
          bank_account_id: string
          created_at: string
          id: string
          notes: string | null
          snapshot_date: string
          source: string
        }
        Insert: {
          balance: number
          bank_account_id: string
          created_at?: string
          id?: string
          notes?: string | null
          snapshot_date: string
          source?: string
        }
        Update: {
          balance?: number
          bank_account_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          snapshot_date?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_balance_snapshots_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      benefit_balances: {
        Row: {
          categoria: Database["public"]["Enums"]["benefit_category"]
          collaborator_id: string
          created_at: string
          id: string
          notas: string | null
          saldo_inicial: number
          updated_at: string
        }
        Insert: {
          categoria: Database["public"]["Enums"]["benefit_category"]
          collaborator_id: string
          created_at?: string
          id?: string
          notas?: string | null
          saldo_inicial?: number
          updated_at?: string
        }
        Update: {
          categoria?: Database["public"]["Enums"]["benefit_category"]
          collaborator_id?: string
          created_at?: string
          id?: string
          notas?: string | null
          saldo_inicial?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_balances_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_balances_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators_directory"
            referencedColumns: ["id"]
          },
        ]
      }
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
          {
            foreignKeyName: "benefit_expenses_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      benefit_yearly_credits: {
        Row: {
          ano_fiscal: number
          categoria: Database["public"]["Enums"]["benefit_category"]
          collaborator_id: string
          created_at: string
          id: string
          notas: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          ano_fiscal: number
          categoria: Database["public"]["Enums"]["benefit_category"]
          collaborator_id: string
          created_at?: string
          id?: string
          notas?: string | null
          updated_at?: string
          valor?: number
        }
        Update: {
          ano_fiscal?: number
          categoria?: Database["public"]["Enums"]["benefit_category"]
          collaborator_id?: string
          created_at?: string
          id?: string
          notas?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "benefit_yearly_credits_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_yearly_credits_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators_directory"
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
          internal_threshold_pct: number
          margem_lucro_pct: number
          notas: string | null
          singleton: boolean
          updated_at: string
          utilization_target_max: number
          utilization_target_min: number
        }
        Insert: {
          created_at?: string
          custos_operacionais_anual?: number
          dias_uteis?: number
          horas_dia?: number
          id?: string
          internal_threshold_pct?: number
          margem_lucro_pct?: number
          notas?: string | null
          singleton?: boolean
          updated_at?: string
          utilization_target_max?: number
          utilization_target_min?: number
        }
        Update: {
          created_at?: string
          custos_operacionais_anual?: number
          dias_uteis?: number
          horas_dia?: number
          id?: string
          internal_threshold_pct?: number
          margem_lucro_pct?: number
          notas?: string | null
          singleton?: boolean
          updated_at?: string
          utilization_target_max?: number
          utilization_target_min?: number
        }
        Relationships: []
      }
      collaborators: {
        Row: {
          ano_fiscal: number
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          created_at: string
          daily_hours: number
          data_nascimento: string | null
          days_per_week: number
          departamento: Database["public"]["Enums"]["department"]
          dependentes_com_deficiencia: number
          dias_ferias_anuais: number
          dias_ferias_extra: number
          email: string | null
          estado_civil: string
          foto_path: string | null
          id: string
          inicio_carreira: string | null
          language_preference: string
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
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          daily_hours?: number
          data_nascimento?: string | null
          days_per_week?: number
          departamento?: Database["public"]["Enums"]["department"]
          dependentes_com_deficiencia?: number
          dias_ferias_anuais?: number
          dias_ferias_extra?: number
          email?: string | null
          estado_civil?: string
          foto_path?: string | null
          id?: string
          inicio_carreira?: string | null
          language_preference?: string
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
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          daily_hours?: number
          data_nascimento?: string | null
          days_per_week?: number
          departamento?: Database["public"]["Enums"]["department"]
          dependentes_com_deficiencia?: number
          dias_ferias_anuais?: number
          dias_ferias_extra?: number
          email?: string | null
          estado_civil?: string
          foto_path?: string | null
          id?: string
          inicio_carreira?: string | null
          language_preference?: string
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
          company_type: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          industria: string | null
          morada: string | null
          nif: string | null
          nome: string
          notas: string | null
          status: Database["public"]["Enums"]["company_status"]
          telefone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          company_type?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          industria?: string | null
          morada?: string | null
          nif?: string | null
          nome: string
          notas?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          telefone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          company_type?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          industria?: string | null
          morada?: string | null
          nif?: string | null
          nome?: string
          notas?: string | null
          status?: Database["public"]["Enums"]["company_status"]
          telefone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      company_expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["pm_expense_category"]
          created_at: string
          description: string
          id: string
          incurred_at: string | null
          notes: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["pm_expense_status"]
          supplier_id: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount?: number
          category?: Database["public"]["Enums"]["pm_expense_category"]
          created_at?: string
          description: string
          id?: string
          incurred_at?: string | null
          notes?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["pm_expense_status"]
          supplier_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["pm_expense_category"]
          created_at?: string
          description?: string
          id?: string
          incurred_at?: string | null
          notes?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["pm_expense_status"]
          supplier_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pm_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pm_suppliers_directory"
            referencedColumns: ["id"]
          },
        ]
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
      crm_accounts: {
        Row: {
          billing_details: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          notas: string | null
          updated_at: string
        }
        Insert: {
          billing_details?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notas?: string | null
          updated_at?: string
        }
        Update: {
          billing_details?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notas?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_accounts_company_id_fkey"
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
      crm_opportunities: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          estimated_fee: number
          expected_start_date: string | null
          id: string
          name: string
          notas: string | null
          primary_contact_id: string | null
          probability: number
          project_brief: string | null
          stage: Database["public"]["Enums"]["crm_opportunity_stage"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          estimated_fee?: number
          expected_start_date?: string | null
          id?: string
          name: string
          notas?: string | null
          primary_contact_id?: string | null
          probability?: number
          project_brief?: string | null
          stage?: Database["public"]["Enums"]["crm_opportunity_stage"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          estimated_fee?: number
          expected_start_date?: string | null
          id?: string
          name?: string
          notas?: string | null
          primary_contact_id?: string | null
          probability?: number
          project_brief?: string | null
          stage?: Database["public"]["Enums"]["crm_opportunity_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_opportunities_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_proposals: {
        Row: {
          account_id: string | null
          company_id: string | null
          construction_cost: number | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          data_decisao: string | null
          data_proposta: string | null
          fee_percentage: number | null
          fee_structure_type: Database["public"]["Enums"]["crm_fee_structure"]
          id: string
          notas: string | null
          opportunity_id: string | null
          parent_quote_id: string | null
          pipeline_status: Database["public"]["Enums"]["proposal_status"]
          pm_project_id: string | null
          pricing_multiplier: number
          probabilidade: number
          project_fee_calculation: Json
          proposal_description: string | null
          quote_category: Database["public"]["Enums"]["crm_quote_category"]
          quote_mode_ready: boolean
          quote_status: Database["public"]["Enums"]["crm_quote_status"]
          quote_type: Database["public"]["Enums"]["crm_quote_type"]
          revision_number: number
          time_based_settings: Json
          titulo: string
          updated_at: string
          valor: number
        }
        Insert: {
          account_id?: string | null
          company_id?: string | null
          construction_cost?: number | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          data_decisao?: string | null
          data_proposta?: string | null
          fee_percentage?: number | null
          fee_structure_type?: Database["public"]["Enums"]["crm_fee_structure"]
          id?: string
          notas?: string | null
          opportunity_id?: string | null
          parent_quote_id?: string | null
          pipeline_status?: Database["public"]["Enums"]["proposal_status"]
          pm_project_id?: string | null
          pricing_multiplier?: number
          probabilidade?: number
          project_fee_calculation?: Json
          proposal_description?: string | null
          quote_category?: Database["public"]["Enums"]["crm_quote_category"]
          quote_mode_ready?: boolean
          quote_status?: Database["public"]["Enums"]["crm_quote_status"]
          quote_type?: Database["public"]["Enums"]["crm_quote_type"]
          revision_number?: number
          time_based_settings?: Json
          titulo: string
          updated_at?: string
          valor?: number
        }
        Update: {
          account_id?: string | null
          company_id?: string | null
          construction_cost?: number | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          data_decisao?: string | null
          data_proposta?: string | null
          fee_percentage?: number | null
          fee_structure_type?: Database["public"]["Enums"]["crm_fee_structure"]
          id?: string
          notas?: string | null
          opportunity_id?: string | null
          parent_quote_id?: string | null
          pipeline_status?: Database["public"]["Enums"]["proposal_status"]
          pm_project_id?: string | null
          pricing_multiplier?: number
          probabilidade?: number
          project_fee_calculation?: Json
          proposal_description?: string | null
          quote_category?: Database["public"]["Enums"]["crm_quote_category"]
          quote_mode_ready?: boolean
          quote_status?: Database["public"]["Enums"]["crm_quote_status"]
          quote_type?: Database["public"]["Enums"]["crm_quote_type"]
          revision_number?: number
          time_based_settings?: Json
          titulo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fee_proposals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "fee_proposals_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_proposals_parent_quote_id_fkey"
            columns: ["parent_quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposals"
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
      financial_clients: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      financial_debt_payments: {
        Row: {
          actual_amount: number | null
          created_at: string
          debt_id: string
          due_date: string | null
          id: string
          notes: string | null
          paid_date: string | null
          period_id: string | null
          planned_amount: number
          status: Database["public"]["Enums"]["financial_debt_payment_status"]
          updated_at: string
        }
        Insert: {
          actual_amount?: number | null
          created_at?: string
          debt_id: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_date?: string | null
          period_id?: string | null
          planned_amount?: number
          status?: Database["public"]["Enums"]["financial_debt_payment_status"]
          updated_at?: string
        }
        Update: {
          actual_amount?: number | null
          created_at?: string
          debt_id?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_date?: string | null
          period_id?: string | null
          planned_amount?: number
          status?: Database["public"]["Enums"]["financial_debt_payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_debt_payments_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "financial_debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_debt_payments_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "financial_period_totals"
            referencedColumns: ["period_id"]
          },
          {
            foreignKeyName: "financial_debt_payments_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "financial_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_debts: {
        Row: {
          created_at: string
          creditor_name: string
          description: string | null
          end_date: string | null
          id: string
          notes: string | null
          original_amount: number
          outstanding_amount: number
          start_date: string | null
          status: Database["public"]["Enums"]["financial_debt_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          creditor_name: string
          description?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          original_amount?: number
          outstanding_amount?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["financial_debt_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          creditor_name?: string
          description?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          original_amount?: number
          outstanding_amount?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["financial_debt_status"]
          updated_at?: string
        }
        Relationships: []
      }
      financial_expense_items: {
        Row: {
          actual_amount_inc_vat: number | null
          amount_ex_vat: number
          amount_inc_vat: number | null
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          expense_type: Database["public"]["Enums"]["financial_expense_type"]
          id: string
          notes: string | null
          paid_date: string | null
          period_id: string | null
          status: Database["public"]["Enums"]["financial_expense_status"]
          supplier_id: string | null
          updated_at: string
          vat_amount: number | null
          vat_rate: number
        }
        Insert: {
          actual_amount_inc_vat?: number | null
          amount_ex_vat?: number
          amount_inc_vat?: number | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          expense_type?: Database["public"]["Enums"]["financial_expense_type"]
          id?: string
          notes?: string | null
          paid_date?: string | null
          period_id?: string | null
          status?: Database["public"]["Enums"]["financial_expense_status"]
          supplier_id?: string | null
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number
        }
        Update: {
          actual_amount_inc_vat?: number | null
          amount_ex_vat?: number
          amount_inc_vat?: number | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          expense_type?: Database["public"]["Enums"]["financial_expense_type"]
          id?: string
          notes?: string | null
          paid_date?: string | null
          period_id?: string | null
          status?: Database["public"]["Enums"]["financial_expense_status"]
          supplier_id?: string | null
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_expense_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_expense_items_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "financial_period_totals"
            referencedColumns: ["period_id"]
          },
          {
            foreignKeyName: "financial_expense_items_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "financial_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_expense_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "financial_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_import_logs: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string
          id: string
          import_type: string
          imported_at: string
          notes: string | null
          rows_bank_accounts: number
          rows_clients: number
          rows_debts: number
          rows_expenses: number
          rows_income: number
          rows_suppliers: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name: string
          id?: string
          import_type?: string
          imported_at?: string
          notes?: string | null
          rows_bank_accounts?: number
          rows_clients?: number
          rows_debts?: number
          rows_expenses?: number
          rows_income?: number
          rows_suppliers?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string
          id?: string
          import_type?: string
          imported_at?: string
          notes?: string | null
          rows_bank_accounts?: number
          rows_clients?: number
          rows_debts?: number
          rows_expenses?: number
          rows_income?: number
          rows_suppliers?: number
          updated_at?: string
        }
        Relationships: []
      }
      financial_income_items: {
        Row: {
          amount_ex_vat: number
          amount_inc_vat: number | null
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          expected_payment_date: string | null
          id: string
          invoice_number: string | null
          invoice_status: Database["public"]["Enums"]["financial_invoice_status"]
          issue_date: string | null
          notes: string | null
          paid_date: string | null
          period_id: string | null
          project_code: string | null
          project_id: string | null
          project_name: string | null
          updated_at: string
          vat_amount: number | null
          vat_rate: number
        }
        Insert: {
          amount_ex_vat?: number
          amount_inc_vat?: number | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expected_payment_date?: string | null
          id?: string
          invoice_number?: string | null
          invoice_status?: Database["public"]["Enums"]["financial_invoice_status"]
          issue_date?: string | null
          notes?: string | null
          paid_date?: string | null
          period_id?: string | null
          project_code?: string | null
          project_id?: string | null
          project_name?: string | null
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number
        }
        Update: {
          amount_ex_vat?: number
          amount_inc_vat?: number | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expected_payment_date?: string | null
          id?: string
          invoice_number?: string | null
          invoice_status?: Database["public"]["Enums"]["financial_invoice_status"]
          issue_date?: string | null
          notes?: string | null
          paid_date?: string | null
          period_id?: string | null
          project_code?: string | null
          project_id?: string | null
          project_name?: string | null
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_income_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "financial_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_income_items_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "financial_period_totals"
            referencedColumns: ["period_id"]
          },
          {
            foreignKeyName: "financial_income_items_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "financial_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_balance: number
          created_at: string
          id: string
          is_closed: boolean
          month: number
          month_name: string
          notes: string | null
          opening_balance: number
          status: Database["public"]["Enums"]["financial_period_status"]
          updated_at: string
          year: number
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_balance?: number
          created_at?: string
          id?: string
          is_closed?: boolean
          month: number
          month_name: string
          notes?: string | null
          opening_balance?: number
          status?: Database["public"]["Enums"]["financial_period_status"]
          updated_at?: string
          year: number
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_balance?: number
          created_at?: string
          id?: string
          is_closed?: boolean
          month?: number
          month_name?: string
          notes?: string | null
          opening_balance?: number
          status?: Database["public"]["Enums"]["financial_period_status"]
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      financial_suppliers: {
        Row: {
          created_at: string
          default_category_id: string | null
          id: string
          is_active: boolean
          name: string
          nif: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_category_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          nif?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_category_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          nif?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_suppliers_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
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
          status: Database["public"]["Enums"]["pm_allocation_status"]
          status_changed_at: string | null
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
          status?: Database["public"]["Enums"]["pm_allocation_status"]
          status_changed_at?: string | null
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
          status?: Database["public"]["Enums"]["pm_allocation_status"]
          status_changed_at?: string | null
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
          category: Database["public"]["Enums"]["pm_expense_category"]
          created_at: string
          description: string
          expense_date: string | null
          id: string
          incurred_at: string | null
          notes: string | null
          paid_at: string | null
          project_id: string
          purchase_price: number
          rebillable: boolean
          sale_price: number
          status: Database["public"]["Enums"]["pm_expense_status"]
          supplier_id: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["pm_expense_category"]
          created_at?: string
          description: string
          expense_date?: string | null
          id?: string
          incurred_at?: string | null
          notes?: string | null
          paid_at?: string | null
          project_id: string
          purchase_price?: number
          rebillable?: boolean
          sale_price?: number
          status?: Database["public"]["Enums"]["pm_expense_status"]
          supplier_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["pm_expense_category"]
          created_at?: string
          description?: string
          expense_date?: string | null
          id?: string
          incurred_at?: string | null
          notes?: string | null
          paid_at?: string | null
          project_id?: string
          purchase_price?: number
          rebillable?: boolean
          sale_price?: number
          status?: Database["public"]["Enums"]["pm_expense_status"]
          supplier_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pm_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pm_suppliers_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_internal_categories: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
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
          due_date: string | null
          id: string
          invoice_date: string | null
          invoice_reference: string | null
          markup_type: Database["public"]["Enums"]["pm_markup_type"]
          markup_value: number
          notes: string | null
          paid_at: string | null
          project_id: string
          purchase_price: number
          quantity: number
          sale_price: number
          sale_price_manual: boolean
          status: Database["public"]["Enums"]["pm_external_service_status"]
          supplier_contact: string | null
          supplier_id: string | null
          supplier_name: string | null
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          invoice_reference?: string | null
          markup_type?: Database["public"]["Enums"]["pm_markup_type"]
          markup_value?: number
          notes?: string | null
          paid_at?: string | null
          project_id: string
          purchase_price?: number
          quantity?: number
          sale_price?: number
          sale_price_manual?: boolean
          status?: Database["public"]["Enums"]["pm_external_service_status"]
          supplier_contact?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          invoice_date?: string | null
          invoice_reference?: string | null
          markup_type?: Database["public"]["Enums"]["pm_markup_type"]
          markup_value?: number
          notes?: string | null
          paid_at?: string | null
          project_id?: string
          purchase_price?: number
          quantity?: number
          sale_price?: number
          sale_price_manual?: boolean
          status?: Database["public"]["Enums"]["pm_external_service_status"]
          supplier_contact?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          unit_cost?: number
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
          {
            foreignKeyName: "pm_materials_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pm_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_materials_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pm_suppliers_directory"
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
          account_id: string | null
          client: string | null
          color: string
          company_id: string | null
          created_at: string
          external_id: string | null
          id: string
          name: string
          notes: string | null
          opportunity_id: string | null
          quote_id: string | null
          sold_at: string | null
          sold_external_fee: number | null
          sold_fee: number | null
          sold_internal_fee: number | null
          sold_pricing_multiplier: number | null
          start_date: string
          status: Database["public"]["Enums"]["pm_project_status"]
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          client?: string | null
          color?: string
          company_id?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          name: string
          notes?: string | null
          opportunity_id?: string | null
          quote_id?: string | null
          sold_at?: string | null
          sold_external_fee?: number | null
          sold_fee?: number | null
          sold_internal_fee?: number | null
          sold_pricing_multiplier?: number | null
          start_date?: string
          status?: Database["public"]["Enums"]["pm_project_status"]
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          client?: string | null
          color?: string
          company_id?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          opportunity_id?: string | null
          quote_id?: string | null
          sold_at?: string | null
          sold_external_fee?: number | null
          sold_fee?: number | null
          sold_internal_fee?: number | null
          sold_pricing_multiplier?: number | null
          start_date?: string
          status?: Database["public"]["Enums"]["pm_project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_projects_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_projects_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_projects_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposals"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "pm_resources_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators_directory"
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
          baseline_budget: number | null
          baseline_end_date: string | null
          baseline_locked_at: string | null
          baseline_notes: string | null
          baseline_start_date: string | null
          baseline_target_hours: number | null
          budget: number
          color: string
          created_at: string
          end_date: string
          external_id: string | null
          id: string
          name: string
          project_id: string
          sort_order: number
          start_date: string
          updated_at: string
        }
        Insert: {
          baseline_budget?: number | null
          baseline_end_date?: string | null
          baseline_locked_at?: string | null
          baseline_notes?: string | null
          baseline_start_date?: string | null
          baseline_target_hours?: number | null
          budget?: number
          color?: string
          created_at?: string
          end_date: string
          external_id?: string | null
          id?: string
          name: string
          project_id: string
          sort_order?: number
          start_date: string
          updated_at?: string
        }
        Update: {
          baseline_budget?: number | null
          baseline_end_date?: string | null
          baseline_locked_at?: string | null
          baseline_notes?: string | null
          baseline_start_date?: string | null
          baseline_target_hours?: number | null
          budget?: number
          color?: string
          created_at?: string
          end_date?: string
          external_id?: string | null
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
      pm_suppliers: {
        Row: {
          active: boolean
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pm_tasks: {
        Row: {
          activated_at: string | null
          allocation_id: string
          completed_at: string | null
          created_at: string
          external_id: string | null
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
          external_id?: string | null
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
          external_id?: string | null
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
          billable: boolean
          created_at: string
          ended_at: string | null
          entry_date: string
          entry_type: Database["public"]["Enums"]["pm_time_entry_type"]
          external_id: string | null
          hours: number
          id: string
          internal_category: string | null
          leave_type: string | null
          notes: string | null
          source: string
          started_at: string | null
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billable?: boolean
          created_at?: string
          ended_at?: string | null
          entry_date: string
          entry_type?: Database["public"]["Enums"]["pm_time_entry_type"]
          external_id?: string | null
          hours?: number
          id?: string
          internal_category?: string | null
          leave_type?: string | null
          notes?: string | null
          source?: string
          started_at?: string | null
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billable?: boolean
          created_at?: string
          ended_at?: string | null
          entry_date?: string
          entry_type?: Database["public"]["Enums"]["pm_time_entry_type"]
          external_id?: string | null
          hours?: number
          id?: string
          internal_category?: string | null
          leave_type?: string | null
          notes?: string | null
          source?: string
          started_at?: string | null
          task_id?: string | null
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
          {
            foreignKeyName: "projects_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "collaborators_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_block_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      proposal_blocks: {
        Row: {
          block_type: Database["public"]["Enums"]["proposal_block_type"]
          category_id: string | null
          created_at: string
          default_content: string
          id: string
          is_active: boolean
          language: string
          project_type_tags: string[]
          service_type_tags: string[]
          slug: string
          sort_order: number
          title: string
          updated_at: string
          variables: Json
          visibility: Database["public"]["Enums"]["proposal_block_visibility"]
        }
        Insert: {
          block_type?: Database["public"]["Enums"]["proposal_block_type"]
          category_id?: string | null
          created_at?: string
          default_content?: string
          id?: string
          is_active?: boolean
          language?: string
          project_type_tags?: string[]
          service_type_tags?: string[]
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
          variables?: Json
          visibility?: Database["public"]["Enums"]["proposal_block_visibility"]
        }
        Update: {
          block_type?: Database["public"]["Enums"]["proposal_block_type"]
          category_id?: string | null
          created_at?: string
          default_content?: string
          id?: string
          is_active?: boolean
          language?: string
          project_type_tags?: string[]
          service_type_tags?: string[]
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
          variables?: Json
          visibility?: Database["public"]["Enums"]["proposal_block_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "proposal_blocks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "proposal_block_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_allocations: {
        Row: {
          allocation_percentage: number | null
          cost_rate_snapshot: number
          created_at: string
          end_date: string
          hours_per_day: number
          id: string
          notes: string | null
          quote_id: string
          resource_id: string
          sale_rate_snapshot: number
          stage_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          allocation_percentage?: number | null
          cost_rate_snapshot?: number
          created_at?: string
          end_date: string
          hours_per_day?: number
          id?: string
          notes?: string | null
          quote_id: string
          resource_id: string
          sale_rate_snapshot?: number
          stage_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          allocation_percentage?: number | null
          cost_rate_snapshot?: number
          created_at?: string
          end_date?: string
          hours_per_day?: number
          id?: string
          notes?: string | null
          quote_id?: string
          resource_id?: string
          sale_rate_snapshot?: number
          stage_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_allocations_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_allocations_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_allocations_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "quote_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_external_services: {
        Row: {
          created_at: string
          description: string
          id: string
          markup_type: Database["public"]["Enums"]["quote_markup_type"]
          markup_value: number
          notes: string | null
          purchase_price: number
          quantity: number
          quote_id: string
          sale_price: number
          sale_price_manual: boolean
          stage_id: string | null
          status: Database["public"]["Enums"]["quote_external_service_status"]
          supplier_id: string | null
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          markup_type?: Database["public"]["Enums"]["quote_markup_type"]
          markup_value?: number
          notes?: string | null
          purchase_price?: number
          quantity?: number
          quote_id: string
          sale_price?: number
          sale_price_manual?: boolean
          stage_id?: string | null
          status?: Database["public"]["Enums"]["quote_external_service_status"]
          supplier_id?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          markup_type?: Database["public"]["Enums"]["quote_markup_type"]
          markup_value?: number
          notes?: string | null
          purchase_price?: number
          quantity?: number
          quote_id?: string
          sale_price?: number
          sale_price_manual?: boolean
          stage_id?: string | null
          status?: Database["public"]["Enums"]["quote_external_service_status"]
          supplier_id?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_external_services_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_external_services_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "quote_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_external_services_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pm_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_external_services_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pm_suppliers_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_payment_schedule_items: {
        Row: {
          amount_type: Database["public"]["Enums"]["quote_payment_amount_type"]
          amount_value: number
          created_at: string
          expected_invoice_date: string | null
          expected_payment_date: string | null
          generator_source: string | null
          id: string
          label: string
          manual_override: boolean
          notes: string | null
          quote_id: string
          sort_order: number
          stage_id: string | null
          trigger_type: Database["public"]["Enums"]["quote_payment_trigger"]
          updated_at: string
        }
        Insert: {
          amount_type: Database["public"]["Enums"]["quote_payment_amount_type"]
          amount_value?: number
          created_at?: string
          expected_invoice_date?: string | null
          expected_payment_date?: string | null
          generator_source?: string | null
          id?: string
          label: string
          manual_override?: boolean
          notes?: string | null
          quote_id: string
          sort_order?: number
          stage_id?: string | null
          trigger_type: Database["public"]["Enums"]["quote_payment_trigger"]
          updated_at?: string
        }
        Update: {
          amount_type?: Database["public"]["Enums"]["quote_payment_amount_type"]
          amount_value?: number
          created_at?: string
          expected_invoice_date?: string | null
          expected_payment_date?: string | null
          generator_source?: string | null
          id?: string
          label?: string
          manual_override?: boolean
          notes?: string | null
          quote_id?: string
          sort_order?: number
          stage_id?: string | null
          trigger_type?: Database["public"]["Enums"]["quote_payment_trigger"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_payment_schedule_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_payment_schedule_items_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "quote_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_proposal_document_blocks: {
        Row: {
          block_title: string
          block_type: Database["public"]["Enums"]["proposal_block_type"]
          content: string
          created_at: string
          generated_content: Json | null
          id: string
          is_included: boolean
          is_locked: boolean
          proposal_block_id: string | null
          proposal_document_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          block_title: string
          block_type?: Database["public"]["Enums"]["proposal_block_type"]
          content?: string
          created_at?: string
          generated_content?: Json | null
          id?: string
          is_included?: boolean
          is_locked?: boolean
          proposal_block_id?: string | null
          proposal_document_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          block_title?: string
          block_type?: Database["public"]["Enums"]["proposal_block_type"]
          content?: string
          created_at?: string
          generated_content?: Json | null
          id?: string
          is_included?: boolean
          is_locked?: boolean
          proposal_block_id?: string | null
          proposal_document_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_proposal_document_blocks_proposal_block_id_fkey"
            columns: ["proposal_block_id"]
            isOneToOne: false
            referencedRelation: "proposal_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_proposal_document_blocks_proposal_document_id_fkey"
            columns: ["proposal_document_id"]
            isOneToOne: false
            referencedRelation: "quote_proposal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_proposal_documents: {
        Row: {
          created_at: string
          created_by: string | null
          generated_at: string | null
          id: string
          language: string
          quote_id: string
          revision_number: number
          sent_at: string | null
          snapshot_json: Json
          status: Database["public"]["Enums"]["quote_proposal_document_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          generated_at?: string | null
          id?: string
          language?: string
          quote_id: string
          revision_number?: number
          sent_at?: string | null
          snapshot_json?: Json
          status?: Database["public"]["Enums"]["quote_proposal_document_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          generated_at?: string | null
          id?: string
          language?: string
          quote_id?: string
          revision_number?: number
          sent_at?: string | null
          snapshot_json?: Json
          status?: Database["public"]["Enums"]["quote_proposal_document_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_proposal_documents_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_stage_dependencies: {
        Row: {
          created_at: string
          id: string
          lag_days: number
          predecessor_stage_id: string
          quote_id: string
          successor_stage_id: string
          type: Database["public"]["Enums"]["quote_dep_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lag_days?: number
          predecessor_stage_id: string
          quote_id: string
          successor_stage_id: string
          type?: Database["public"]["Enums"]["quote_dep_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lag_days?: number
          predecessor_stage_id?: string
          quote_id?: string
          successor_stage_id?: string
          type?: Database["public"]["Enums"]["quote_dep_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_stage_dependencies_predecessor_stage_id_fkey"
            columns: ["predecessor_stage_id"]
            isOneToOne: false
            referencedRelation: "quote_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_stage_dependencies_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_stage_dependencies_successor_stage_id_fkey"
            columns: ["successor_stage_id"]
            isOneToOne: false
            referencedRelation: "quote_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_stages: {
        Row: {
          budget: number
          color: string
          created_at: string
          description: string | null
          end_date: string
          external_id: string | null
          id: string
          name: string
          quote_id: string
          sort_order: number
          start_date: string
          updated_at: string
        }
        Insert: {
          budget?: number
          color?: string
          created_at?: string
          description?: string | null
          end_date: string
          external_id?: string | null
          id?: string
          name: string
          quote_id: string
          sort_order?: number
          start_date: string
          updated_at?: string
        }
        Update: {
          budget?: number
          color?: string
          created_at?: string
          description?: string | null
          end_date?: string
          external_id?: string | null
          id?: string
          name?: string
          quote_id?: string
          sort_order?: number
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_stages_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_key: string
          role: Database["public"]["Enums"]["pm_role"]
          scope: string
        }
        Insert: {
          permission_key: string
          role: Database["public"]["Enums"]["pm_role"]
          scope?: string
        }
        Update: {
          permission_key?: string
          role?: Database["public"]["Enums"]["pm_role"]
          scope?: string
        }
        Relationships: []
      }
      salary_snapshots: {
        Row: {
          ajudas_custo_anual: number
          ano_fiscal: number
          beneficio_carro: number
          beneficio_ticket: number
          beneficio_variavel: number
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
          beneficio_variavel?: number
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
          beneficio_variavel?: number
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
          {
            foreignKeyName: "salary_snapshots_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          created_at: string
          granted: boolean
          id: string
          permission_key: string
          scope: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted?: boolean
          id?: string
          permission_key: string
          scope?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          id?: string
          permission_key?: string
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      user_role_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          notes: string | null
          role: Database["public"]["Enums"]["pm_role"]
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          notes?: string | null
          role: Database["public"]["Enums"]["pm_role"]
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          notes?: string | null
          role?: Database["public"]["Enums"]["pm_role"]
          user_id?: string
        }
        Relationships: []
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
          {
            foreignKeyName: "vacation_requests_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators_directory"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      collaborators_directory: {
        Row: {
          ano_fiscal: number | null
          archived_at: string | null
          archived_by: string | null
          created_at: string | null
          daily_hours: number | null
          data_nascimento: string | null
          days_per_week: number | null
          departamento: Database["public"]["Enums"]["department"] | null
          dias_ferias_anuais: number | null
          dias_ferias_extra: number | null
          email: string | null
          foto_path: string | null
          id: string | null
          inicio_carreira: string | null
          language_preference: string | null
          nome: string | null
          numero_colaborador: string | null
          updated_at: string | null
        }
        Insert: {
          ano_fiscal?: number | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string | null
          daily_hours?: number | null
          data_nascimento?: string | null
          days_per_week?: number | null
          departamento?: Database["public"]["Enums"]["department"] | null
          dias_ferias_anuais?: number | null
          dias_ferias_extra?: number | null
          email?: string | null
          foto_path?: string | null
          id?: string | null
          inicio_carreira?: string | null
          language_preference?: string | null
          nome?: string | null
          numero_colaborador?: string | null
          updated_at?: string | null
        }
        Update: {
          ano_fiscal?: number | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string | null
          daily_hours?: number | null
          data_nascimento?: string | null
          days_per_week?: number | null
          departamento?: Database["public"]["Enums"]["department"] | null
          dias_ferias_anuais?: number | null
          dias_ferias_extra?: number | null
          email?: string | null
          foto_path?: string | null
          id?: string | null
          inicio_carreira?: string | null
          language_preference?: string | null
          nome?: string | null
          numero_colaborador?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      financial_period_totals: {
        Row: {
          closing_balance: number | null
          debt_actual: number | null
          debt_planned: number | null
          expense_actual: number | null
          expense_projected: number | null
          income_actual: number | null
          income_projected: number | null
          is_closed: boolean | null
          month: number | null
          month_name: string | null
          net_cash_flow: number | null
          opening_balance: number | null
          period_id: string | null
          status: Database["public"]["Enums"]["financial_period_status"] | null
          year: number | null
        }
        Insert: {
          closing_balance?: number | null
          debt_actual?: never
          debt_planned?: never
          expense_actual?: never
          expense_projected?: never
          income_actual?: never
          income_projected?: never
          is_closed?: boolean | null
          month?: number | null
          month_name?: string | null
          net_cash_flow?: never
          opening_balance?: number | null
          period_id?: string | null
          status?: Database["public"]["Enums"]["financial_period_status"] | null
          year?: number | null
        }
        Update: {
          closing_balance?: number | null
          debt_actual?: never
          debt_planned?: never
          expense_actual?: never
          expense_projected?: never
          income_actual?: never
          income_projected?: never
          is_closed?: boolean | null
          month?: number | null
          month_name?: string | null
          net_cash_flow?: never
          opening_balance?: number | null
          period_id?: string | null
          status?: Database["public"]["Enums"]["financial_period_status"] | null
          year?: number | null
        }
        Relationships: []
      }
      pm_suppliers_directory: {
        Row: {
          active: boolean | null
          id: string | null
          name: string | null
        }
        Insert: {
          active?: boolean | null
          id?: string | null
          name?: string | null
        }
        Update: {
          active?: boolean | null
          id?: string | null
          name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_my_collaborator_id: { Args: never; Returns: string }
      has_module_permission: {
        Args: { _key: string; _required_scope: string; _user_id: string }
        Returns: boolean
      }
      has_permission: {
        Args: { _key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      list_user_effective_permissions: {
        Args: { _user_id: string }
        Returns: {
          permission_key: string
          scope: string
          source: string
        }[]
      }
      list_users_with_permissions: {
        Args: never
        Returns: {
          collaborator_id: string
          collaborator_nome: string
          email: string
          is_admin: boolean
          is_super_admin: boolean
          permissions: string[]
          user_id: string
        }[]
      }
      list_users_with_role_v2: {
        Args: never
        Returns: {
          assigned_role: Database["public"]["Enums"]["pm_role"]
          collaborator_id: string
          collaborator_nome: string
          effective_keys: string[]
          effective_scopes: string[]
          email: string
          is_admin: boolean
          is_super_admin: boolean
          override_keys: string[]
          suggested_role: Database["public"]["Enums"]["pm_role"]
          user_id: string
        }[]
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
      pm_list_user_resource_map: {
        Args: never
        Returns: {
          collaborator_id: string
          color: string
          foto_path: string
          name: string
          resource_id: string
          user_id: string
        }[]
      }
      set_user_admin: {
        Args: { _is_admin: boolean; _user_id: string }
        Returns: undefined
      }
      set_user_permission: {
        Args: { _granted: boolean; _key: string; _user_id: string }
        Returns: undefined
      }
      set_user_permission_v2: {
        Args: { _key: string; _scope: string; _state: string; _user_id: string }
        Returns: undefined
      }
      set_user_role: {
        Args: {
          _apply_preset?: boolean
          _role: Database["public"]["Enums"]["pm_role"]
          _user_id: string
        }
        Returns: undefined
      }
      suggest_role_for_user: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["pm_role"]
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
      crm_fee_structure: "fixed" | "staged" | "monthly"
      crm_opportunity_stage:
        | "lead"
        | "proposal"
        | "negotiation"
        | "won"
        | "lost"
      crm_quote_category: "project" | "consultancy" | "time_based" | "retainer"
      crm_quote_status: "draft" | "sent" | "approved" | "rejected"
      crm_quote_type:
        | "standard_project"
        | "construction_retainer"
        | "consultancy_hours_package"
      department: "Projecto" | "Backoffice"
      expense_status: "pendente" | "aprovada" | "rejeitada" | "paga"
      financial_debt_payment_status: "planned" | "paid" | "overdue" | "skipped"
      financial_debt_status: "open" | "partially_paid" | "paid" | "renegotiated"
      financial_expense_status:
        | "projected"
        | "confirmed"
        | "paid"
        | "overdue"
        | "cancelled"
      financial_expense_type:
        | "operational"
        | "debt"
        | "project"
        | "consultant"
        | "tax"
        | "other"
        | "materials"
      financial_invoice_status:
        | "planned"
        | "issued"
        | "paid"
        | "overdue"
        | "cancelled"
      financial_period_status: "projected" | "active" | "validated" | "closed"
      pm_allocation_status: "tentative" | "committed"
      pm_dep_type: "FS" | "SS" | "FF" | "SF"
      pm_expense_category:
        | "travel"
        | "accommodation"
        | "food"
        | "transport"
        | "printing"
        | "misc"
      pm_expense_status: "draft" | "submitted" | "approved" | "paid"
      pm_external_service_status:
        | "draft"
        | "approved"
        | "ordered"
        | "invoiced"
        | "partially_paid"
        | "paid"
        | "cancelled"
      pm_invoice_status: "draft" | "sent" | "paid" | "overdue" | "cancelled"
      pm_markup_type: "percent" | "fixed"
      pm_project_status: "active" | "paused" | "archived"
      pm_role:
        | "admin"
        | "partner"
        | "project_lead"
        | "architect"
        | "hr"
        | "finance"
      pm_task_status: "pending" | "active" | "paused" | "done"
      pm_time_entry_type: "project" | "internal" | "non_working"
      project_status:
        | "proposta"
        | "em_curso"
        | "pausado"
        | "concluido"
        | "cancelado"
      proposal_block_type:
        | "editable_text"
        | "generated_section"
        | "legal_reference"
      proposal_block_visibility: "client" | "internal" | "both"
      proposal_status:
        | "lead"
        | "proposta_enviada"
        | "negociacao"
        | "ganho"
        | "perdido"
      quote_dep_type: "FS" | "SS" | "FF" | "SF"
      quote_external_service_status:
        | "draft"
        | "pending"
        | "invoiced"
        | "paid"
        | "cancelled"
      quote_markup_type: "percent" | "fixed"
      quote_payment_amount_type: "fixed" | "percent"
      quote_payment_trigger:
        | "project_start"
        | "stage_start"
        | "stage_end"
        | "manual_date"
        | "monthly"
      quote_proposal_document_status:
        | "draft"
        | "ready"
        | "sent"
        | "accepted"
        | "archived"
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
      crm_fee_structure: ["fixed", "staged", "monthly"],
      crm_opportunity_stage: ["lead", "proposal", "negotiation", "won", "lost"],
      crm_quote_category: ["project", "consultancy", "time_based", "retainer"],
      crm_quote_status: ["draft", "sent", "approved", "rejected"],
      crm_quote_type: [
        "standard_project",
        "construction_retainer",
        "consultancy_hours_package",
      ],
      department: ["Projecto", "Backoffice"],
      expense_status: ["pendente", "aprovada", "rejeitada", "paga"],
      financial_debt_payment_status: ["planned", "paid", "overdue", "skipped"],
      financial_debt_status: ["open", "partially_paid", "paid", "renegotiated"],
      financial_expense_status: [
        "projected",
        "confirmed",
        "paid",
        "overdue",
        "cancelled",
      ],
      financial_expense_type: [
        "operational",
        "debt",
        "project",
        "consultant",
        "tax",
        "other",
        "materials",
      ],
      financial_invoice_status: [
        "planned",
        "issued",
        "paid",
        "overdue",
        "cancelled",
      ],
      financial_period_status: ["projected", "active", "validated", "closed"],
      pm_allocation_status: ["tentative", "committed"],
      pm_dep_type: ["FS", "SS", "FF", "SF"],
      pm_expense_category: [
        "travel",
        "accommodation",
        "food",
        "transport",
        "printing",
        "misc",
      ],
      pm_expense_status: ["draft", "submitted", "approved", "paid"],
      pm_external_service_status: [
        "draft",
        "approved",
        "ordered",
        "invoiced",
        "partially_paid",
        "paid",
        "cancelled",
      ],
      pm_invoice_status: ["draft", "sent", "paid", "overdue", "cancelled"],
      pm_markup_type: ["percent", "fixed"],
      pm_project_status: ["active", "paused", "archived"],
      pm_role: [
        "admin",
        "partner",
        "project_lead",
        "architect",
        "hr",
        "finance",
      ],
      pm_task_status: ["pending", "active", "paused", "done"],
      pm_time_entry_type: ["project", "internal", "non_working"],
      project_status: [
        "proposta",
        "em_curso",
        "pausado",
        "concluido",
        "cancelado",
      ],
      proposal_block_type: [
        "editable_text",
        "generated_section",
        "legal_reference",
      ],
      proposal_block_visibility: ["client", "internal", "both"],
      proposal_status: [
        "lead",
        "proposta_enviada",
        "negociacao",
        "ganho",
        "perdido",
      ],
      quote_dep_type: ["FS", "SS", "FF", "SF"],
      quote_external_service_status: [
        "draft",
        "pending",
        "invoiced",
        "paid",
        "cancelled",
      ],
      quote_markup_type: ["percent", "fixed"],
      quote_payment_amount_type: ["fixed", "percent"],
      quote_payment_trigger: [
        "project_start",
        "stage_start",
        "stage_end",
        "manual_date",
        "monthly",
      ],
      quote_proposal_document_status: [
        "draft",
        "ready",
        "sent",
        "accepted",
        "archived",
      ],
      subsidios_modo: ["tradicional", "duodecimos_50", "duodecimos_100"],
    },
  },
} as const
