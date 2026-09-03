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
      backup_runs: {
        Row: {
          created_at: string
          drive_file_id: string | null
          drive_file_name: string | null
          drive_folder_id: string | null
          drive_url: string | null
          error: string | null
          finished_at: string | null
          id: string
          rows_count: number | null
          size_bytes: number | null
          started_at: string
          status: Database["public"]["Enums"]["backup_status"]
          tables_count: number | null
          trigger: Database["public"]["Enums"]["backup_trigger"]
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          drive_file_id?: string | null
          drive_file_name?: string | null
          drive_folder_id?: string | null
          drive_url?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          rows_count?: number | null
          size_bytes?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["backup_status"]
          tables_count?: number | null
          trigger: Database["public"]["Enums"]["backup_trigger"]
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          drive_file_id?: string | null
          drive_file_name?: string | null
          drive_folder_id?: string | null
          drive_url?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          rows_count?: number | null
          size_bytes?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["backup_status"]
          tables_count?: number | null
          trigger?: Database["public"]["Enums"]["backup_trigger"]
          triggered_by?: string | null
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_kind: Database["public"]["Enums"]["bank_account_kind"]
          account_name: string
          account_number: string | null
          archived_at: string | null
          bank_name: string | null
          bic: string | null
          created_at: string
          currency: string
          iban: string | null
          id: string
          is_active: boolean
          notes: string | null
          opening_balance: number | null
          opening_balance_date: string | null
          updated_at: string
        }
        Insert: {
          account_kind?: Database["public"]["Enums"]["bank_account_kind"]
          account_name: string
          account_number?: string | null
          archived_at?: string | null
          bank_name?: string | null
          bic?: string | null
          created_at?: string
          currency?: string
          iban?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          opening_balance?: number | null
          opening_balance_date?: string | null
          updated_at?: string
        }
        Update: {
          account_kind?: Database["public"]["Enums"]["bank_account_kind"]
          account_name?: string
          account_number?: string | null
          archived_at?: string | null
          bank_name?: string | null
          bic?: string | null
          created_at?: string
          currency?: string
          iban?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          opening_balance?: number | null
          opening_balance_date?: string | null
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
      bank_classification_rules: {
        Row: {
          active: boolean
          case_sensitive: boolean
          classification_id: string | null
          created_at: string
          id: string
          match_type: Database["public"]["Enums"]["bank_rule_match_type"]
          name: string
          needs_review: boolean
          pattern: string
          priority: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          case_sensitive?: boolean
          classification_id?: string | null
          created_at?: string
          id?: string
          match_type?: Database["public"]["Enums"]["bank_rule_match_type"]
          name: string
          needs_review?: boolean
          pattern: string
          priority?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          case_sensitive?: boolean
          classification_id?: string | null
          created_at?: string
          id?: string
          match_type?: Database["public"]["Enums"]["bank_rule_match_type"]
          name?: string
          needs_review?: boolean
          pattern?: string
          priority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_classification_rules_classification_id_fkey"
            columns: ["classification_id"]
            isOneToOne: false
            referencedRelation: "financial_classifications"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_imports: {
        Row: {
          bank_account_id: string
          created_at: string
          exported_at: string | null
          file_checksum: string
          file_name: string
          id: string
          imported_at: string
          imported_by: string | null
          moved_at: string | null
          moved_by: string | null
          notes: string | null
          original_account_id: string | null
          period_end: string | null
          period_start: string | null
          rows_imported: number
          rows_skipped: number
          rows_total: number
          source_file_size_bytes: number | null
          status: Database["public"]["Enums"]["bank_import_status"]
          undo_reason: string | null
          undone_at: string | null
          undone_by: string | null
          updated_at: string
        }
        Insert: {
          bank_account_id: string
          created_at?: string
          exported_at?: string | null
          file_checksum: string
          file_name: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          moved_at?: string | null
          moved_by?: string | null
          notes?: string | null
          original_account_id?: string | null
          period_end?: string | null
          period_start?: string | null
          rows_imported?: number
          rows_skipped?: number
          rows_total?: number
          source_file_size_bytes?: number | null
          status?: Database["public"]["Enums"]["bank_import_status"]
          undo_reason?: string | null
          undone_at?: string | null
          undone_by?: string | null
          updated_at?: string
        }
        Update: {
          bank_account_id?: string
          created_at?: string
          exported_at?: string | null
          file_checksum?: string
          file_name?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          moved_at?: string | null
          moved_by?: string | null
          notes?: string | null
          original_account_id?: string | null
          period_end?: string | null
          period_start?: string | null
          rows_imported?: number
          rows_skipped?: number
          rows_total?: number
          source_file_size_bytes?: number | null
          status?: Database["public"]["Enums"]["bank_import_status"]
          undo_reason?: string | null
          undone_at?: string | null
          undone_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_imports_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_periods: {
        Row: {
          bank_account_id: string
          closing_balance: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          opening_balance: number
          period_end_date: string
          period_start_date: string
          statement_number: string
          updated_at: string
        }
        Insert: {
          bank_account_id: string
          closing_balance?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          opening_balance?: number
          period_end_date: string
          period_start_date: string
          statement_number: string
          updated_at?: string
        }
        Update: {
          bank_account_id?: string
          closing_balance?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          opening_balance?: number
          period_end_date?: string
          period_start_date?: string
          statement_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_periods_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transaction_classifications: {
        Row: {
          amount: number
          bank_transaction_id: string
          classification_id: string
          client_id: string | null
          collaborator_id: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          project_id: string | null
          reimbursable: boolean
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          bank_transaction_id: string
          classification_id: string
          client_id?: string | null
          collaborator_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          project_id?: string | null
          reimbursable?: boolean
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_transaction_id?: string
          classification_id?: string
          client_id?: string | null
          collaborator_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          project_id?: string | null
          reimbursable?: boolean
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transaction_classifications_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transaction_classifications_classification_id_fkey"
            columns: ["classification_id"]
            isOneToOne: false
            referencedRelation: "financial_classifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transaction_classifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transaction_classifications_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transaction_classifications_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transaction_classifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transaction_classifications_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string
          classified_at: string | null
          classified_by: string | null
          created_at: string
          currency: string
          description: string
          id: string
          ignored_reason: string | null
          notes: string | null
          raw_row: Json | null
          reconciled_at: string | null
          reconciled_by: string | null
          row_checksum: string
          running_balance: number | null
          statement_import_id: string | null
          statement_period_id: string | null
          status: Database["public"]["Enums"]["bank_tx_status"]
          suggested_by_rule_id: string | null
          suggested_classification_id: string | null
          transaction_date: string
          updated_at: string
          value_date: string | null
        }
        Insert: {
          amount: number
          bank_account_id: string
          classified_at?: string | null
          classified_by?: string | null
          created_at?: string
          currency?: string
          description: string
          id?: string
          ignored_reason?: string | null
          notes?: string | null
          raw_row?: Json | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          row_checksum: string
          running_balance?: number | null
          statement_import_id?: string | null
          statement_period_id?: string | null
          status?: Database["public"]["Enums"]["bank_tx_status"]
          suggested_by_rule_id?: string | null
          suggested_classification_id?: string | null
          transaction_date: string
          updated_at?: string
          value_date?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string
          classified_at?: string | null
          classified_by?: string | null
          created_at?: string
          currency?: string
          description?: string
          id?: string
          ignored_reason?: string | null
          notes?: string | null
          raw_row?: Json | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          row_checksum?: string
          running_balance?: number | null
          statement_import_id?: string | null
          statement_period_id?: string | null
          status?: Database["public"]["Enums"]["bank_tx_status"]
          suggested_by_rule_id?: string | null
          suggested_classification_id?: string | null
          transaction_date?: string
          updated_at?: string
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_statement_import_id_fkey"
            columns: ["statement_import_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_statement_period_id_fkey"
            columns: ["statement_period_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_suggested_classification_id_fkey"
            columns: ["suggested_classification_id"]
            isOneToOne: false
            referencedRelation: "financial_classifications"
            referencedColumns: ["id"]
          },
        ]
      }
      benefit_balances: {
        Row: {
          categoria: Database["public"]["Enums"]["benefit_category"]
          category_id: string | null
          collaborator_id: string
          created_at: string
          id: string
          notas: string | null
          saldo_inicial: number
          updated_at: string
        }
        Insert: {
          categoria: Database["public"]["Enums"]["benefit_category"]
          category_id?: string | null
          collaborator_id: string
          created_at?: string
          id?: string
          notas?: string | null
          saldo_inicial?: number
          updated_at?: string
        }
        Update: {
          categoria?: Database["public"]["Enums"]["benefit_category"]
          category_id?: string | null
          collaborator_id?: string
          created_at?: string
          id?: string
          notas?: string | null
          saldo_inicial?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_balances_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "benefit_categories"
            referencedColumns: ["id"]
          },
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
      benefit_categories: {
        Row: {
          active: boolean
          classification_id: string | null
          code: string
          created_at: string
          icon: string | null
          id: string
          label_en: string
          label_pt: string
          legacy_enum: Database["public"]["Enums"]["benefit_category"] | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          classification_id?: string | null
          code: string
          created_at?: string
          icon?: string | null
          id?: string
          label_en: string
          label_pt: string
          legacy_enum?: Database["public"]["Enums"]["benefit_category"] | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          classification_id?: string | null
          code?: string
          created_at?: string
          icon?: string | null
          id?: string
          label_en?: string
          label_pt?: string
          legacy_enum?: Database["public"]["Enums"]["benefit_category"] | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_categories_classification_id_fkey"
            columns: ["classification_id"]
            isOneToOne: false
            referencedRelation: "financial_classifications"
            referencedColumns: ["id"]
          },
        ]
      }
      benefit_category_legacy_aliases: {
        Row: {
          category_id: string
          legacy_enum: Database["public"]["Enums"]["benefit_category"]
        }
        Insert: {
          category_id: string
          legacy_enum: Database["public"]["Enums"]["benefit_category"]
        }
        Update: {
          category_id?: string
          legacy_enum?: Database["public"]["Enums"]["benefit_category"]
        }
        Relationships: [
          {
            foreignKeyName: "benefit_category_legacy_aliases_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "benefit_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      benefit_drive_folders: {
        Row: {
          created_at: string
          drive_folder_id: string
          folder_path: string
        }
        Insert: {
          created_at?: string
          drive_folder_id: string
          folder_path: string
        }
        Update: {
          created_at?: string
          drive_folder_id?: string
          folder_path?: string
        }
        Relationships: []
      }
      benefit_expense_drive_sync: {
        Row: {
          attempts: number
          created_at: string
          drive_file_id: string | null
          drive_file_name: string | null
          drive_folder_id: string | null
          expense_id: string
          last_error: string | null
          source_checksum: string | null
          status: Database["public"]["Enums"]["benefit_drive_sync_status"]
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          drive_file_id?: string | null
          drive_file_name?: string | null
          drive_folder_id?: string | null
          expense_id: string
          last_error?: string | null
          source_checksum?: string | null
          status?: Database["public"]["Enums"]["benefit_drive_sync_status"]
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          drive_file_id?: string | null
          drive_file_name?: string | null
          drive_folder_id?: string | null
          expense_id?: string
          last_error?: string | null
          source_checksum?: string | null
          status?: Database["public"]["Enums"]["benefit_drive_sync_status"]
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_expense_drive_sync_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: true
            referencedRelation: "benefit_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_expense_drive_sync_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: true
            referencedRelation: "benefit_expenses_v"
            referencedColumns: ["id"]
          },
        ]
      }
      benefit_expense_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          expense_id: string
          from_status: Database["public"]["Enums"]["expense_status"] | null
          id: string
          metadata: Json | null
          notes: string | null
          to_status: Database["public"]["Enums"]["expense_status"] | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          expense_id: string
          from_status?: Database["public"]["Enums"]["expense_status"] | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          to_status?: Database["public"]["Enums"]["expense_status"] | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          expense_id?: string
          from_status?: Database["public"]["Enums"]["expense_status"] | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          to_status?: Database["public"]["Enums"]["expense_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "benefit_expense_events_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "benefit_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_expense_events_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "benefit_expenses_v"
            referencedColumns: ["id"]
          },
        ]
      }
      benefit_expense_ocr_extractions: {
        Row: {
          collaborator_id: string
          confidence: Json | null
          created_at: string
          error: string | null
          expense_id: string | null
          extracted: Json | null
          id: string
          matched_company_id: string | null
          processed_at: string | null
          provider: string | null
          raw_response: Json | null
          status: string
          storage_path: string
        }
        Insert: {
          collaborator_id: string
          confidence?: Json | null
          created_at?: string
          error?: string | null
          expense_id?: string | null
          extracted?: Json | null
          id?: string
          matched_company_id?: string | null
          processed_at?: string | null
          provider?: string | null
          raw_response?: Json | null
          status?: string
          storage_path: string
        }
        Update: {
          collaborator_id?: string
          confidence?: Json | null
          created_at?: string
          error?: string | null
          expense_id?: string | null
          extracted?: Json | null
          id?: string
          matched_company_id?: string | null
          processed_at?: string | null
          provider?: string | null
          raw_response?: Json | null
          status?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_expense_ocr_extractions_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_expense_ocr_extractions_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_expense_ocr_extractions_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "benefit_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_expense_ocr_extractions_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "benefit_expenses_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_expense_ocr_extractions_matched_company_id_fkey"
            columns: ["matched_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      benefit_expenses: {
        Row: {
          amount_ex_vat: number | null
          ano_fiscal: number
          aprovado_em: string | null
          aprovado_por: string | null
          bank_transaction_id: string | null
          categoria: Database["public"]["Enums"]["benefit_category"]
          category_id: string | null
          classification_id: string | null
          collaborator_id: string
          created_at: string
          data_despesa: string
          descricao: string
          document_number: string | null
          estado: Database["public"]["Enums"]["expense_status"]
          financial_document_id: string | null
          foto_path: string | null
          id: string
          notas_aprovacao: string | null
          notas_colaborador: string | null
          ocr_extraction_id: string | null
          origin: string
          pago_em: string | null
          pago_por: string | null
          payment_account_id: string | null
          payment_source_label: string | null
          payment_source_type: string | null
          supplier_company_id: string | null
          supplier_name_snapshot: string | null
          supplier_nif: string | null
          updated_at: string
          valor: number
          vat_amount: number | null
          vat_rate: number | null
        }
        Insert: {
          amount_ex_vat?: number | null
          ano_fiscal?: number
          aprovado_em?: string | null
          aprovado_por?: string | null
          bank_transaction_id?: string | null
          categoria: Database["public"]["Enums"]["benefit_category"]
          category_id?: string | null
          classification_id?: string | null
          collaborator_id: string
          created_at?: string
          data_despesa: string
          descricao: string
          document_number?: string | null
          estado?: Database["public"]["Enums"]["expense_status"]
          financial_document_id?: string | null
          foto_path?: string | null
          id?: string
          notas_aprovacao?: string | null
          notas_colaborador?: string | null
          ocr_extraction_id?: string | null
          origin?: string
          pago_em?: string | null
          pago_por?: string | null
          payment_account_id?: string | null
          payment_source_label?: string | null
          payment_source_type?: string | null
          supplier_company_id?: string | null
          supplier_name_snapshot?: string | null
          supplier_nif?: string | null
          updated_at?: string
          valor: number
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Update: {
          amount_ex_vat?: number | null
          ano_fiscal?: number
          aprovado_em?: string | null
          aprovado_por?: string | null
          bank_transaction_id?: string | null
          categoria?: Database["public"]["Enums"]["benefit_category"]
          category_id?: string | null
          classification_id?: string | null
          collaborator_id?: string
          created_at?: string
          data_despesa?: string
          descricao?: string
          document_number?: string | null
          estado?: Database["public"]["Enums"]["expense_status"]
          financial_document_id?: string | null
          foto_path?: string | null
          id?: string
          notas_aprovacao?: string | null
          notas_colaborador?: string | null
          ocr_extraction_id?: string | null
          origin?: string
          pago_em?: string | null
          pago_por?: string | null
          payment_account_id?: string | null
          payment_source_label?: string | null
          payment_source_type?: string | null
          supplier_company_id?: string | null
          supplier_name_snapshot?: string | null
          supplier_nif?: string | null
          updated_at?: string
          valor?: number
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "benefit_expenses_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "benefit_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_expenses_classification_id_fkey"
            columns: ["classification_id"]
            isOneToOne: false
            referencedRelation: "financial_classifications"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "benefit_expenses_financial_document_id_fkey"
            columns: ["financial_document_id"]
            isOneToOne: false
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_expenses_ocr_extraction_id_fkey"
            columns: ["ocr_extraction_id"]
            isOneToOne: false
            referencedRelation: "benefit_expense_ocr_extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_expenses_payment_account_id_fkey"
            columns: ["payment_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_expenses_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      benefit_notification_queue: {
        Row: {
          audience: string
          created_at: string
          event: string
          expense_id: string
          id: string
          processed_at: string | null
        }
        Insert: {
          audience?: string
          created_at?: string
          event: string
          expense_id: string
          id?: string
          processed_at?: string | null
        }
        Update: {
          audience?: string
          created_at?: string
          event?: string
          expense_id?: string
          id?: string
          processed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "benefit_notification_queue_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "benefit_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_notification_queue_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "benefit_expenses_v"
            referencedColumns: ["id"]
          },
        ]
      }
      benefit_yearly_credits: {
        Row: {
          ano_fiscal: number
          categoria: Database["public"]["Enums"]["benefit_category"]
          category_id: string | null
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
          category_id?: string | null
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
          category_id?: string | null
          collaborator_id?: string
          created_at?: string
          id?: string
          notas?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "benefit_yearly_credits_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "benefit_categories"
            referencedColumns: ["id"]
          },
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
          backoffice_pct: number
          billing_role: string | null
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
          include_in_planning: boolean
          inicio_carreira: string | null
          language_preference: string
          localizacao: string
          margem_lucro_pct_override: number | null
          nome: string
          numero_colaborador: string | null
          numero_dependentes: number
          numero_titulares: number
          proposal_role: string | null
          resource_classification: Database["public"]["Enums"]["resource_classification"]
          saldo_ferias_anterior: number
          seniority_level: number | null
          situacao_contractual: string | null
          target_chargeability_pct: number | null
          updated_at: string
        }
        Insert: {
          ano_fiscal?: number
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          backoffice_pct?: number
          billing_role?: string | null
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
          include_in_planning?: boolean
          inicio_carreira?: string | null
          language_preference?: string
          localizacao?: string
          margem_lucro_pct_override?: number | null
          nome: string
          numero_colaborador?: string | null
          numero_dependentes?: number
          numero_titulares?: number
          proposal_role?: string | null
          resource_classification?: Database["public"]["Enums"]["resource_classification"]
          saldo_ferias_anterior?: number
          seniority_level?: number | null
          situacao_contractual?: string | null
          target_chargeability_pct?: number | null
          updated_at?: string
        }
        Update: {
          ano_fiscal?: number
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          backoffice_pct?: number
          billing_role?: string | null
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
          include_in_planning?: boolean
          inicio_carreira?: string | null
          language_preference?: string
          localizacao?: string
          margem_lucro_pct_override?: number | null
          nome?: string
          numero_colaborador?: string | null
          numero_dependentes?: number
          numero_titulares?: number
          proposal_role?: string | null
          resource_classification?: Database["public"]["Enums"]["resource_classification"]
          saldo_ferias_anterior?: number
          seniority_level?: number | null
          situacao_contractual?: string | null
          target_chargeability_pct?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          abbreviation: string | null
          city: string | null
          code: string | null
          company_type: string | null
          created_at: string
          created_by: string | null
          currency: string
          default_classification_id: string | null
          email: string | null
          id: string
          industria: string | null
          is_active: boolean
          is_client: boolean
          is_reimbursement_supplier: boolean
          is_supplier: boolean
          mobile: string | null
          morada: string | null
          nif: string | null
          nome: string
          notas: string | null
          opening_balance_payable: number
          opening_balance_receivable: number
          payment_terms: string | null
          postal_code: string | null
          relationship_type: Database["public"]["Enums"]["company_relationship_type"]
          status: Database["public"]["Enums"]["company_status"]
          telefone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          abbreviation?: string | null
          city?: string | null
          code?: string | null
          company_type?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          default_classification_id?: string | null
          email?: string | null
          id?: string
          industria?: string | null
          is_active?: boolean
          is_client?: boolean
          is_reimbursement_supplier?: boolean
          is_supplier?: boolean
          mobile?: string | null
          morada?: string | null
          nif?: string | null
          nome: string
          notas?: string | null
          opening_balance_payable?: number
          opening_balance_receivable?: number
          payment_terms?: string | null
          postal_code?: string | null
          relationship_type?: Database["public"]["Enums"]["company_relationship_type"]
          status?: Database["public"]["Enums"]["company_status"]
          telefone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          abbreviation?: string | null
          city?: string | null
          code?: string | null
          company_type?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          default_classification_id?: string | null
          email?: string | null
          id?: string
          industria?: string | null
          is_active?: boolean
          is_client?: boolean
          is_reimbursement_supplier?: boolean
          is_supplier?: boolean
          mobile?: string | null
          morada?: string | null
          nif?: string | null
          nome?: string
          notas?: string | null
          opening_balance_payable?: number
          opening_balance_receivable?: number
          payment_terms?: string | null
          postal_code?: string | null
          relationship_type?: Database["public"]["Enums"]["company_relationship_type"]
          status?: Database["public"]["Enums"]["company_status"]
          telefone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_default_classification_id_fkey"
            columns: ["default_classification_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      company_expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["pm_expense_category"]
          cost_category_id: string | null
          created_at: string
          description: string
          id: string
          incurred_at: string | null
          notes: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["pm_expense_status"]
          supplier_company_id: string | null
          supplier_id: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount?: number
          category?: Database["public"]["Enums"]["pm_expense_category"]
          cost_category_id?: string | null
          created_at?: string
          description: string
          id?: string
          incurred_at?: string | null
          notes?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["pm_expense_status"]
          supplier_company_id?: string | null
          supplier_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["pm_expense_category"]
          cost_category_id?: string | null
          created_at?: string
          description?: string
          id?: string
          incurred_at?: string | null
          notes?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["pm_expense_status"]
          supplier_company_id?: string | null
          supplier_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_expenses_cost_category_id_fkey"
            columns: ["cost_category_id"]
            isOneToOne: false
            referencedRelation: "cost_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_expenses_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
          is_billing_contact: boolean
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
          is_billing_contact?: boolean
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
          is_billing_contact?: boolean
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
      contract_clauses: {
        Row: {
          clause_key: string
          content: string
          contract_id: string
          created_at: string
          id: string
          is_generated: boolean
          manual_override: boolean
          sort_order: number
          source_ontology_component: string | null
          source_resolver: string | null
          title: string
          updated_at: string
        }
        Insert: {
          clause_key: string
          content?: string
          contract_id: string
          created_at?: string
          id?: string
          is_generated?: boolean
          manual_override?: boolean
          sort_order?: number
          source_ontology_component?: string | null
          source_resolver?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          clause_key?: string
          content?: string
          contract_id?: string
          created_at?: string
          id?: string
          is_generated?: boolean
          manual_override?: boolean
          sort_order?: number
          source_ontology_component?: string | null
          source_resolver?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_clauses_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_events: {
        Row: {
          contract_id: string
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          metadata: Json
        }
        Insert: {
          contract_id: string
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          contract_id?: string
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "contract_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_exhibits: {
        Row: {
          content_json: Json
          contract_id: string
          created_at: string
          exhibit_key: string
          id: string
          sort_order: number
          source_id: string | null
          source_type: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content_json?: Json
          contract_id: string
          created_at?: string
          exhibit_key: string
          id?: string
          sort_order?: number
          source_id?: string | null
          source_type?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content_json?: Json
          contract_id?: string
          created_at?: string
          exhibit_key?: string
          id?: string
          sort_order?: number
          source_id?: string | null
          source_type?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_exhibits_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          commercial_snapshot_json: Json
          contract_kind: Database["public"]["Enums"]["contract_kind"]
          contract_number: string | null
          created_at: string
          created_by: string | null
          currency: string
          generated_at: string
          id: string
          issued_at: string | null
          language: string
          ontology_snapshot_json: Json
          parent_contract_id: string | null
          proposal_snapshot_json: Json
          resolver_version: string
          revision_number: number
          root_contract_id: string | null
          signed_at: string | null
          snapshot_json: Json
          source_company_id: string | null
          source_opportunity_id: string | null
          source_project_id: string | null
          source_quote_id: string | null
          status: Database["public"]["Enums"]["contract_status"]
          superseded_by_contract_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          commercial_snapshot_json?: Json
          contract_kind?: Database["public"]["Enums"]["contract_kind"]
          contract_number?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          generated_at?: string
          id?: string
          issued_at?: string | null
          language?: string
          ontology_snapshot_json?: Json
          parent_contract_id?: string | null
          proposal_snapshot_json?: Json
          resolver_version?: string
          revision_number?: number
          root_contract_id?: string | null
          signed_at?: string | null
          snapshot_json?: Json
          source_company_id?: string | null
          source_opportunity_id?: string | null
          source_project_id?: string | null
          source_quote_id?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          superseded_by_contract_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          commercial_snapshot_json?: Json
          contract_kind?: Database["public"]["Enums"]["contract_kind"]
          contract_number?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          generated_at?: string
          id?: string
          issued_at?: string | null
          language?: string
          ontology_snapshot_json?: Json
          parent_contract_id?: string | null
          proposal_snapshot_json?: Json
          resolver_version?: string
          revision_number?: number
          root_contract_id?: string | null
          signed_at?: string | null
          snapshot_json?: Json
          source_company_id?: string | null
          source_opportunity_id?: string | null
          source_project_id?: string | null
          source_quote_id?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          superseded_by_contract_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_parent_contract_id_fkey"
            columns: ["parent_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_root_contract_id_fkey"
            columns: ["root_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_source_company_id_fkey"
            columns: ["source_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_source_opportunity_id_fkey"
            columns: ["source_opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_source_project_id_fkey"
            columns: ["source_project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_source_quote_id_fkey"
            columns: ["source_quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposal_values"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "contracts_source_quote_id_fkey"
            columns: ["source_quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_superseded_by_contract_id_fkey"
            columns: ["superseded_by_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_default: boolean
          name: string
          slug: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          slug?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          slug?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
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
            referencedRelation: "fee_proposal_values"
            referencedColumns: ["quote_id"]
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
          company_id: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          estimated_fee: number
          expected_start_date: string | null
          id: string
          last_activity_at: string | null
          lost_at: string | null
          lost_reason_code: string | null
          lost_reason_notes: string | null
          name: string
          next_action: string | null
          next_action_date: string | null
          next_action_owner_id: string | null
          notas: string | null
          primary_contact_id: string | null
          probability: number
          project_brief: string | null
          source: string | null
          stage: Database["public"]["Enums"]["crm_opportunity_stage"]
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          estimated_fee?: number
          expected_start_date?: string | null
          id?: string
          last_activity_at?: string | null
          lost_at?: string | null
          lost_reason_code?: string | null
          lost_reason_notes?: string | null
          name: string
          next_action?: string | null
          next_action_date?: string | null
          next_action_owner_id?: string | null
          notas?: string | null
          primary_contact_id?: string | null
          probability?: number
          project_brief?: string | null
          source?: string | null
          stage?: Database["public"]["Enums"]["crm_opportunity_stage"]
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          estimated_fee?: number
          expected_start_date?: string | null
          id?: string
          last_activity_at?: string | null
          lost_at?: string | null
          lost_reason_code?: string | null
          lost_reason_notes?: string | null
          name?: string
          next_action?: string | null
          next_action_date?: string | null
          next_action_owner_id?: string | null
          notas?: string | null
          primary_contact_id?: string | null
          probability?: number
          project_brief?: string | null
          source?: string | null
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
      email_events: {
        Row: {
          category: string | null
          classification_source: string
          confidence: number | null
          created_at: string
          draft_reply: string | null
          from_address: string | null
          gmail_message_id: string
          id: string
          received_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          snippet: string | null
          status: string
          subject: string | null
          suggested_action: string | null
          thread_id: string
        }
        Insert: {
          category?: string | null
          classification_source?: string
          confidence?: number | null
          created_at?: string
          draft_reply?: string | null
          from_address?: string | null
          gmail_message_id: string
          id?: string
          received_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          snippet?: string | null
          status?: string
          subject?: string | null
          suggested_action?: string | null
          thread_id: string
        }
        Update: {
          category?: string | null
          classification_source?: string
          confidence?: number | null
          created_at?: string
          draft_reply?: string | null
          from_address?: string | null
          gmail_message_id?: string
          id?: string
          received_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          snippet?: string | null
          status?: string
          subject?: string | null
          suggested_action?: string | null
          thread_id?: string
        }
        Relationships: []
      }
      email_rules: {
        Row: {
          auto_action: string | null
          category: string
          created_at: string
          id: string
          requires_review: boolean
          updated_at: string
        }
        Insert: {
          auto_action?: string | null
          category: string
          created_at?: string
          id?: string
          requires_review?: boolean
          updated_at?: string
        }
        Update: {
          auto_action?: string | null
          category?: string
          created_at?: string
          id?: string
          requires_review?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      email_sender_rules: {
        Row: {
          action: Database["public"]["Enums"]["email_rule_action"]
          category: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          match_type: Database["public"]["Enums"]["email_rule_match"]
          note: string | null
          sender_pattern: string
          updated_at: string
        }
        Insert: {
          action?: Database["public"]["Enums"]["email_rule_action"]
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          match_type?: Database["public"]["Enums"]["email_rule_match"]
          note?: string | null
          sender_pattern: string
          updated_at?: string
        }
        Update: {
          action?: Database["public"]["Enums"]["email_rule_action"]
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          match_type?: Database["public"]["Enums"]["email_rule_match"]
          note?: string | null
          sender_pattern?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_sync_state: {
        Row: {
          connector_secret_name: string
          created_at: string
          id: string
          inbox_address: string
          is_active: boolean
          label: string | null
          last_checked_at: string | null
          last_history_id: string | null
          updated_at: string
        }
        Insert: {
          connector_secret_name?: string
          created_at?: string
          id?: string
          inbox_address: string
          is_active?: boolean
          label?: string | null
          last_checked_at?: string | null
          last_history_id?: string | null
          updated_at?: string
        }
        Update: {
          connector_secret_name?: string
          created_at?: string
          id?: string
          inbox_address?: string
          is_active?: boolean
          label?: string | null
          last_checked_at?: string | null
          last_history_id?: string | null
          updated_at?: string
        }
        Relationships: []
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
      fee_proposal_audit_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          id: string
          note: string | null
          opportunity_id: string | null
          proposal_id: string
          snapshot: Json
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          id?: string
          note?: string | null
          opportunity_id?: string | null
          proposal_id: string
          snapshot: Json
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          id?: string
          note?: string | null
          opportunity_id?: string | null
          proposal_id?: string
          snapshot?: Json
        }
        Relationships: []
      }
      fee_proposal_number_counters: {
        Row: {
          last_seq: number
          updated_at: string
          year_prefix: string
        }
        Insert: {
          last_seq?: number
          updated_at?: string
          year_prefix: string
        }
        Update: {
          last_seq?: number
          updated_at?: string
          year_prefix?: string
        }
        Relationships: []
      }
      fee_proposals: {
        Row: {
          account_id: string | null
          approved_at: string | null
          approved_by_collaborator_id: string | null
          approved_by_contact_id: string | null
          archived_at: string | null
          archived_by: string | null
          company_id: string | null
          construction_cost: number | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          data_decisao: string | null
          data_proposta: string | null
          default_payment_terms: string
          default_vat_rate: number
          deleted_at: string | null
          deleted_by: string | null
          fee_percentage: number | null
          fee_source_mode: string
          fee_structure_type: Database["public"]["Enums"]["crm_fee_structure"]
          first_payment_terms: string
          id: string
          is_locked: boolean
          locked_at: string | null
          locked_project_id: string | null
          notas: string | null
          ontology_bootstrapped_at: string | null
          ontology_delivery_mode: string | null
          ontology_family_code: string | null
          ontology_flags: Json
          ontology_metadata: Json
          ontology_preset_code: string | null
          opportunity_id: string | null
          parent_quote_id: string | null
          pipeline_status: Database["public"]["Enums"]["proposal_status"]
          pm_project_id: string | null
          pricing_multiplier: number
          probabilidade: number
          project_fee_calculation: Json
          proposal_description: string | null
          proposal_number: string | null
          quote_build_settings: Json
          quote_category: Database["public"]["Enums"]["crm_quote_category"]
          quote_mode_ready: boolean
          quote_status: Database["public"]["Enums"]["crm_quote_status"]
          quote_type: Database["public"]["Enums"]["crm_quote_type"]
          revision_number: number
          sale_margin_pct: number | null
          signed_at: string | null
          signed_by_collaborator_id: string | null
          signed_method: string | null
          signed_notes: string | null
          time_based_settings: Json
          titulo: string
          trip_billing_mode: string
          updated_at: string
          valor: number
        }
        Insert: {
          account_id?: string | null
          approved_at?: string | null
          approved_by_collaborator_id?: string | null
          approved_by_contact_id?: string | null
          archived_at?: string | null
          archived_by?: string | null
          company_id?: string | null
          construction_cost?: number | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          data_decisao?: string | null
          data_proposta?: string | null
          default_payment_terms?: string
          default_vat_rate?: number
          deleted_at?: string | null
          deleted_by?: string | null
          fee_percentage?: number | null
          fee_source_mode?: string
          fee_structure_type?: Database["public"]["Enums"]["crm_fee_structure"]
          first_payment_terms?: string
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_project_id?: string | null
          notas?: string | null
          ontology_bootstrapped_at?: string | null
          ontology_delivery_mode?: string | null
          ontology_family_code?: string | null
          ontology_flags?: Json
          ontology_metadata?: Json
          ontology_preset_code?: string | null
          opportunity_id?: string | null
          parent_quote_id?: string | null
          pipeline_status?: Database["public"]["Enums"]["proposal_status"]
          pm_project_id?: string | null
          pricing_multiplier?: number
          probabilidade?: number
          project_fee_calculation?: Json
          proposal_description?: string | null
          proposal_number?: string | null
          quote_build_settings?: Json
          quote_category?: Database["public"]["Enums"]["crm_quote_category"]
          quote_mode_ready?: boolean
          quote_status?: Database["public"]["Enums"]["crm_quote_status"]
          quote_type?: Database["public"]["Enums"]["crm_quote_type"]
          revision_number?: number
          sale_margin_pct?: number | null
          signed_at?: string | null
          signed_by_collaborator_id?: string | null
          signed_method?: string | null
          signed_notes?: string | null
          time_based_settings?: Json
          titulo: string
          trip_billing_mode?: string
          updated_at?: string
          valor?: number
        }
        Update: {
          account_id?: string | null
          approved_at?: string | null
          approved_by_collaborator_id?: string | null
          approved_by_contact_id?: string | null
          archived_at?: string | null
          archived_by?: string | null
          company_id?: string | null
          construction_cost?: number | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          data_decisao?: string | null
          data_proposta?: string | null
          default_payment_terms?: string
          default_vat_rate?: number
          deleted_at?: string | null
          deleted_by?: string | null
          fee_percentage?: number | null
          fee_source_mode?: string
          fee_structure_type?: Database["public"]["Enums"]["crm_fee_structure"]
          first_payment_terms?: string
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_project_id?: string | null
          notas?: string | null
          ontology_bootstrapped_at?: string | null
          ontology_delivery_mode?: string | null
          ontology_family_code?: string | null
          ontology_flags?: Json
          ontology_metadata?: Json
          ontology_preset_code?: string | null
          opportunity_id?: string | null
          parent_quote_id?: string | null
          pipeline_status?: Database["public"]["Enums"]["proposal_status"]
          pm_project_id?: string | null
          pricing_multiplier?: number
          probabilidade?: number
          project_fee_calculation?: Json
          proposal_description?: string | null
          proposal_number?: string | null
          quote_build_settings?: Json
          quote_category?: Database["public"]["Enums"]["crm_quote_category"]
          quote_mode_ready?: boolean
          quote_status?: Database["public"]["Enums"]["crm_quote_status"]
          quote_type?: Database["public"]["Enums"]["crm_quote_type"]
          revision_number?: number
          sale_margin_pct?: number | null
          signed_at?: string | null
          signed_by_collaborator_id?: string | null
          signed_method?: string | null
          signed_notes?: string | null
          time_based_settings?: Json
          titulo?: string
          trip_billing_mode?: string
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
            foreignKeyName: "fee_proposals_approved_by_collaborator_id_fkey"
            columns: ["approved_by_collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_proposals_approved_by_collaborator_id_fkey"
            columns: ["approved_by_collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_proposals_approved_by_contact_id_fkey"
            columns: ["approved_by_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
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
            foreignKeyName: "fee_proposals_locked_project_id_fkey"
            columns: ["locked_project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_proposals_ontology_delivery_fk"
            columns: ["ontology_delivery_mode"]
            isOneToOne: false
            referencedRelation: "proposal_delivery_modes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fee_proposals_ontology_family_fk"
            columns: ["ontology_family_code"]
            isOneToOne: false
            referencedRelation: "proposal_families"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fee_proposals_ontology_preset_fk"
            columns: ["ontology_preset_code"]
            isOneToOne: false
            referencedRelation: "proposal_presets"
            referencedColumns: ["code"]
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
            referencedRelation: "fee_proposal_values"
            referencedColumns: ["quote_id"]
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
          {
            foreignKeyName: "fee_proposals_signed_by_collaborator_id_fkey"
            columns: ["signed_by_collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_proposals_signed_by_collaborator_id_fkey"
            columns: ["signed_by_collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_classifications: {
        Row: {
          active: boolean
          affects_cash_flow: boolean
          affects_profit: boolean
          code: string
          collaborator_link_allowed: boolean
          cost_category_id: string | null
          created_at: string
          financial_nature: Database["public"]["Enums"]["financial_nature"]
          id: string
          level: Database["public"]["Enums"]["financial_class_level"]
          name_en: string
          name_pt: string
          notes: string | null
          parent_id: string | null
          project_link_allowed: boolean
          reimbursable_default: boolean
          sort_order: number
          spending_policy: Database["public"]["Enums"]["financial_spending_policy"]
          supplier_required: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          affects_cash_flow?: boolean
          affects_profit?: boolean
          code: string
          collaborator_link_allowed?: boolean
          cost_category_id?: string | null
          created_at?: string
          financial_nature: Database["public"]["Enums"]["financial_nature"]
          id?: string
          level?: Database["public"]["Enums"]["financial_class_level"]
          name_en: string
          name_pt: string
          notes?: string | null
          parent_id?: string | null
          project_link_allowed?: boolean
          reimbursable_default?: boolean
          sort_order?: number
          spending_policy?: Database["public"]["Enums"]["financial_spending_policy"]
          supplier_required?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          affects_cash_flow?: boolean
          affects_profit?: boolean
          code?: string
          collaborator_link_allowed?: boolean
          cost_category_id?: string | null
          created_at?: string
          financial_nature?: Database["public"]["Enums"]["financial_nature"]
          id?: string
          level?: Database["public"]["Enums"]["financial_class_level"]
          name_en?: string
          name_pt?: string
          notes?: string | null
          parent_id?: string | null
          project_link_allowed?: boolean
          reimbursable_default?: boolean
          sort_order?: number
          spending_policy?: Database["public"]["Enums"]["financial_spending_policy"]
          supplier_required?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_classifications_cost_category_id_fkey"
            columns: ["cost_category_id"]
            isOneToOne: false
            referencedRelation: "cost_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_classifications_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "financial_classifications"
            referencedColumns: ["id"]
          },
        ]
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
      financial_document_lines: {
        Row: {
          amount_ex_vat: number | null
          amount_inc_vat: number | null
          classification_id: string | null
          created_at: string
          description: string
          document_id: string
          id: string
          notes: string | null
          project_id: string | null
          quantity: number
          reimbursable: boolean
          sort_order: number
          unit_price_ex_vat: number
          updated_at: string
          vat_amount: number | null
          vat_code: string | null
          vat_rate: number
        }
        Insert: {
          amount_ex_vat?: number | null
          amount_inc_vat?: number | null
          classification_id?: string | null
          created_at?: string
          description: string
          document_id: string
          id?: string
          notes?: string | null
          project_id?: string | null
          quantity?: number
          reimbursable?: boolean
          sort_order?: number
          unit_price_ex_vat?: number
          updated_at?: string
          vat_amount?: number | null
          vat_code?: string | null
          vat_rate?: number
        }
        Update: {
          amount_ex_vat?: number | null
          amount_inc_vat?: number | null
          classification_id?: string | null
          created_at?: string
          description?: string
          document_id?: string
          id?: string
          notes?: string | null
          project_id?: string | null
          quantity?: number
          reimbursable?: boolean
          sort_order?: number
          unit_price_ex_vat?: number
          updated_at?: string
          vat_amount?: number | null
          vat_code?: string | null
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_document_lines_classification_id_fkey"
            columns: ["classification_id"]
            isOneToOne: false
            referencedRelation: "financial_classifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_document_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_document_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_document_payments: {
        Row: {
          amount: number
          bank_transaction_id: string | null
          created_at: string
          created_by: string | null
          document_id: string
          id: string
          method: Database["public"]["Enums"]["financial_payment_method"]
          notes: string | null
          payment_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          document_id: string
          id?: string
          method?: Database["public"]["Enums"]["financial_payment_method"]
          notes?: string | null
          payment_date: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string
          id?: string
          method?: Database["public"]["Enums"]["financial_payment_method"]
          notes?: string | null
          payment_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_document_payments_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_document_payments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_document_review_queue: {
        Row: {
          ambiguous_client_ids: string[]
          ambiguous_supplier_ids: string[]
          assigned_collaborator_id: string | null
          buyer_vat_is_own: boolean
          classification_approved_at: string | null
          classification_approved_by: string | null
          classification_confidence: number | null
          client_match_status: Database["public"]["Enums"]["fdrq_supplier_match"]
          created_at: string
          created_by: string | null
          created_expense_id: string | null
          created_project_id: string | null
          direction: Database["public"]["Enums"]["fdrq_direction"]
          direction_confidence: number | null
          doc_type: Database["public"]["Enums"]["fdrq_doc_type"]
          doc_type_confidence: number | null
          extracted_amount: number | null
          extracted_balance_due: number | null
          extracted_buyer_name: string | null
          extracted_buyer_vat: string | null
          extracted_card_last4: string | null
          extracted_currency: string | null
          extracted_date: string | null
          extracted_document_number: string | null
          extracted_due_date: string | null
          extracted_payment_method: string | null
          extracted_seller_name: string | null
          extracted_seller_vat: string | null
          extracted_supplier_name: string | null
          extracted_supplier_vat: string | null
          extracted_vat_amount: number | null
          extracted_withholding_amount: number | null
          extraction_error: string | null
          id: string
          is_recurring_candidate: boolean
          linked_document_group_id: string
          mark_for_inventory: boolean
          matched_client_id: string | null
          matched_supplier_id: string | null
          original_filename: string | null
          paid_from_account_id: string | null
          payment_status: string
          raw_extraction: Json | null
          recurring_reference_id: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: Database["public"]["Enums"]["fdrq_source"]
          source_bucket: string
          source_file_url: string
          status: Database["public"]["Enums"]["fdrq_status"]
          suggested_classification_code: string | null
          suggested_classification_id: string | null
          supplier_approved_at: string | null
          supplier_approved_by: string | null
          supplier_match_status: Database["public"]["Enums"]["fdrq_supplier_match"]
          updated_at: string
        }
        Insert: {
          ambiguous_client_ids?: string[]
          ambiguous_supplier_ids?: string[]
          assigned_collaborator_id?: string | null
          buyer_vat_is_own?: boolean
          classification_approved_at?: string | null
          classification_approved_by?: string | null
          classification_confidence?: number | null
          client_match_status?: Database["public"]["Enums"]["fdrq_supplier_match"]
          created_at?: string
          created_by?: string | null
          created_expense_id?: string | null
          created_project_id?: string | null
          direction?: Database["public"]["Enums"]["fdrq_direction"]
          direction_confidence?: number | null
          doc_type?: Database["public"]["Enums"]["fdrq_doc_type"]
          doc_type_confidence?: number | null
          extracted_amount?: number | null
          extracted_balance_due?: number | null
          extracted_buyer_name?: string | null
          extracted_buyer_vat?: string | null
          extracted_card_last4?: string | null
          extracted_currency?: string | null
          extracted_date?: string | null
          extracted_document_number?: string | null
          extracted_due_date?: string | null
          extracted_payment_method?: string | null
          extracted_seller_name?: string | null
          extracted_seller_vat?: string | null
          extracted_supplier_name?: string | null
          extracted_supplier_vat?: string | null
          extracted_vat_amount?: number | null
          extracted_withholding_amount?: number | null
          extraction_error?: string | null
          id?: string
          is_recurring_candidate?: boolean
          linked_document_group_id?: string
          mark_for_inventory?: boolean
          matched_client_id?: string | null
          matched_supplier_id?: string | null
          original_filename?: string | null
          paid_from_account_id?: string | null
          payment_status?: string
          raw_extraction?: Json | null
          recurring_reference_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: Database["public"]["Enums"]["fdrq_source"]
          source_bucket?: string
          source_file_url: string
          status?: Database["public"]["Enums"]["fdrq_status"]
          suggested_classification_code?: string | null
          suggested_classification_id?: string | null
          supplier_approved_at?: string | null
          supplier_approved_by?: string | null
          supplier_match_status?: Database["public"]["Enums"]["fdrq_supplier_match"]
          updated_at?: string
        }
        Update: {
          ambiguous_client_ids?: string[]
          ambiguous_supplier_ids?: string[]
          assigned_collaborator_id?: string | null
          buyer_vat_is_own?: boolean
          classification_approved_at?: string | null
          classification_approved_by?: string | null
          classification_confidence?: number | null
          client_match_status?: Database["public"]["Enums"]["fdrq_supplier_match"]
          created_at?: string
          created_by?: string | null
          created_expense_id?: string | null
          created_project_id?: string | null
          direction?: Database["public"]["Enums"]["fdrq_direction"]
          direction_confidence?: number | null
          doc_type?: Database["public"]["Enums"]["fdrq_doc_type"]
          doc_type_confidence?: number | null
          extracted_amount?: number | null
          extracted_balance_due?: number | null
          extracted_buyer_name?: string | null
          extracted_buyer_vat?: string | null
          extracted_card_last4?: string | null
          extracted_currency?: string | null
          extracted_date?: string | null
          extracted_document_number?: string | null
          extracted_due_date?: string | null
          extracted_payment_method?: string | null
          extracted_seller_name?: string | null
          extracted_seller_vat?: string | null
          extracted_supplier_name?: string | null
          extracted_supplier_vat?: string | null
          extracted_vat_amount?: number | null
          extracted_withholding_amount?: number | null
          extraction_error?: string | null
          id?: string
          is_recurring_candidate?: boolean
          linked_document_group_id?: string
          mark_for_inventory?: boolean
          matched_client_id?: string | null
          matched_supplier_id?: string | null
          original_filename?: string | null
          paid_from_account_id?: string | null
          payment_status?: string
          raw_extraction?: Json | null
          recurring_reference_id?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: Database["public"]["Enums"]["fdrq_source"]
          source_bucket?: string
          source_file_url?: string
          status?: Database["public"]["Enums"]["fdrq_status"]
          suggested_classification_code?: string | null
          suggested_classification_id?: string | null
          supplier_approved_at?: string | null
          supplier_approved_by?: string | null
          supplier_match_status?: Database["public"]["Enums"]["fdrq_supplier_match"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_document_review_queu_suggested_classification_id_fkey"
            columns: ["suggested_classification_id"]
            isOneToOne: false
            referencedRelation: "financial_classifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_document_review_queue_assigned_collaborator_id_fkey"
            columns: ["assigned_collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_document_review_queue_assigned_collaborator_id_fkey"
            columns: ["assigned_collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_document_review_queue_created_expense_id_fkey"
            columns: ["created_expense_id"]
            isOneToOne: false
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_document_review_queue_created_project_id_fkey"
            columns: ["created_project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_document_review_queue_matched_client_id_fkey"
            columns: ["matched_client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_document_review_queue_matched_supplier_id_fkey"
            columns: ["matched_supplier_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_document_review_queue_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_documents: {
        Row: {
          atcud: string | null
          billed_to_own_vat: boolean
          card_last4: string | null
          classification_id: string | null
          cost_category_id: string | null
          counterparty_client_id: string | null
          counterparty_name_snapshot: string | null
          counterparty_supplier_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          direction: Database["public"]["Enums"]["financial_doc_direction"]
          doc_type: Database["public"]["Enums"]["financial_doc_type"]
          document_number: string | null
          due_date: string | null
          external_reference: string | null
          file_path: string | null
          id: string
          inventory_status:
            | Database["public"]["Enums"]["inventory_workflow_status"]
            | null
          invoicexpress_id: number | null
          invoicexpress_status: string | null
          invoicexpress_type: string | null
          issue_date: string
          issued_at: string | null
          last_sync_at: string | null
          last_sync_error: string | null
          not_project_related: boolean
          notes: string | null
          ocr_metadata: Json | null
          outstanding_amount: number | null
          paid_amount: number
          paid_from_account_id: string | null
          payment_method_extracted: string | null
          payment_status: string
          permalink_pdf: string | null
          project_id: string | null
          series: string | null
          source: Database["public"]["Enums"]["financial_doc_source"]
          source_ref_id: string | null
          source_ref_table: string | null
          status: Database["public"]["Enums"]["financial_doc_status"]
          subtotal_ex_vat: number
          total_inc_vat: number
          updated_at: string
          vat_amount: number
          vat_period: string | null
          withholding_tax_amount: number
        }
        Insert: {
          atcud?: string | null
          billed_to_own_vat?: boolean
          card_last4?: string | null
          classification_id?: string | null
          cost_category_id?: string | null
          counterparty_client_id?: string | null
          counterparty_name_snapshot?: string | null
          counterparty_supplier_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          direction: Database["public"]["Enums"]["financial_doc_direction"]
          doc_type: Database["public"]["Enums"]["financial_doc_type"]
          document_number?: string | null
          due_date?: string | null
          external_reference?: string | null
          file_path?: string | null
          id?: string
          inventory_status?:
            | Database["public"]["Enums"]["inventory_workflow_status"]
            | null
          invoicexpress_id?: number | null
          invoicexpress_status?: string | null
          invoicexpress_type?: string | null
          issue_date: string
          issued_at?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          not_project_related?: boolean
          notes?: string | null
          ocr_metadata?: Json | null
          outstanding_amount?: number | null
          paid_amount?: number
          paid_from_account_id?: string | null
          payment_method_extracted?: string | null
          payment_status?: string
          permalink_pdf?: string | null
          project_id?: string | null
          series?: string | null
          source?: Database["public"]["Enums"]["financial_doc_source"]
          source_ref_id?: string | null
          source_ref_table?: string | null
          status?: Database["public"]["Enums"]["financial_doc_status"]
          subtotal_ex_vat?: number
          total_inc_vat?: number
          updated_at?: string
          vat_amount?: number
          vat_period?: string | null
          withholding_tax_amount?: number
        }
        Update: {
          atcud?: string | null
          billed_to_own_vat?: boolean
          card_last4?: string | null
          classification_id?: string | null
          cost_category_id?: string | null
          counterparty_client_id?: string | null
          counterparty_name_snapshot?: string | null
          counterparty_supplier_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          direction?: Database["public"]["Enums"]["financial_doc_direction"]
          doc_type?: Database["public"]["Enums"]["financial_doc_type"]
          document_number?: string | null
          due_date?: string | null
          external_reference?: string | null
          file_path?: string | null
          id?: string
          inventory_status?:
            | Database["public"]["Enums"]["inventory_workflow_status"]
            | null
          invoicexpress_id?: number | null
          invoicexpress_status?: string | null
          invoicexpress_type?: string | null
          issue_date?: string
          issued_at?: string | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          not_project_related?: boolean
          notes?: string | null
          ocr_metadata?: Json | null
          outstanding_amount?: number | null
          paid_amount?: number
          paid_from_account_id?: string | null
          payment_method_extracted?: string | null
          payment_status?: string
          permalink_pdf?: string | null
          project_id?: string | null
          series?: string | null
          source?: Database["public"]["Enums"]["financial_doc_source"]
          source_ref_id?: string | null
          source_ref_table?: string | null
          status?: Database["public"]["Enums"]["financial_doc_status"]
          subtotal_ex_vat?: number
          total_inc_vat?: number
          updated_at?: string
          vat_amount?: number
          vat_period?: string | null
          withholding_tax_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_documents_classification_id_fkey"
            columns: ["classification_id"]
            isOneToOne: false
            referencedRelation: "financial_classifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_cost_category_id_fkey"
            columns: ["cost_category_id"]
            isOneToOne: false
            referencedRelation: "cost_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_counterparty_client_id_fkey"
            columns: ["counterparty_client_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_counterparty_supplier_id_fkey"
            columns: ["counterparty_supplier_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_drive_processed_files: {
        Row: {
          drive_file_id: string
          error: string | null
          file_name: string | null
          id: string
          mime_type: string | null
          moved_to: string | null
          processed_at: string
          queue_item_id: string | null
          reason: string | null
          size_bytes: number | null
          status: string
          storage_path: string | null
        }
        Insert: {
          drive_file_id: string
          error?: string | null
          file_name?: string | null
          id?: string
          mime_type?: string | null
          moved_to?: string | null
          processed_at?: string
          queue_item_id?: string | null
          reason?: string | null
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
        }
        Update: {
          drive_file_id?: string
          error?: string | null
          file_name?: string | null
          id?: string
          mime_type?: string | null
          moved_to?: string | null
          processed_at?: string
          queue_item_id?: string | null
          reason?: string | null
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_drive_processed_files_queue_item_id_fkey"
            columns: ["queue_item_id"]
            isOneToOne: false
            referencedRelation: "financial_document_review_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_email_ignored_items: {
        Row: {
          attachment_filename: string | null
          created_at: string
          from_address: string | null
          id: string
          message_id: string | null
          payload: Json | null
          reason: string
          subject: string | null
        }
        Insert: {
          attachment_filename?: string | null
          created_at?: string
          from_address?: string | null
          id?: string
          message_id?: string | null
          payload?: Json | null
          reason: string
          subject?: string | null
        }
        Update: {
          attachment_filename?: string | null
          created_at?: string
          from_address?: string | null
          id?: string
          message_id?: string | null
          payload?: Json | null
          reason?: string
          subject?: string | null
        }
        Relationships: []
      }
      financial_email_processed_messages: {
        Row: {
          attachments_queued: number
          from_address: string | null
          id: string
          message_id: string
          processed_at: string
          received_at: string | null
          subject: string | null
          thread_id: string | null
        }
        Insert: {
          attachments_queued?: number
          from_address?: string | null
          id?: string
          message_id: string
          processed_at?: string
          received_at?: string | null
          subject?: string | null
          thread_id?: string | null
        }
        Update: {
          attachments_queued?: number
          from_address?: string | null
          id?: string
          message_id?: string
          processed_at?: string
          received_at?: string | null
          subject?: string | null
          thread_id?: string | null
        }
        Relationships: []
      }
      financial_expense_items: {
        Row: {
          actual_amount_inc_vat: number | null
          amount_ex_vat: number
          amount_inc_vat: number | null
          category_id: string | null
          cost_category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          expense_type: Database["public"]["Enums"]["financial_expense_type"]
          id: string
          notes: string | null
          paid_date: string | null
          period_id: string | null
          source_ref_id: string | null
          source_ref_table: string | null
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
          cost_category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          expense_type?: Database["public"]["Enums"]["financial_expense_type"]
          id?: string
          notes?: string | null
          paid_date?: string | null
          period_id?: string | null
          source_ref_id?: string | null
          source_ref_table?: string | null
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
          cost_category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          expense_type?: Database["public"]["Enums"]["financial_expense_type"]
          id?: string
          notes?: string | null
          paid_date?: string | null
          period_id?: string | null
          source_ref_id?: string | null
          source_ref_table?: string | null
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
            foreignKeyName: "financial_expense_items_cost_category_id_fkey"
            columns: ["cost_category_id"]
            isOneToOne: false
            referencedRelation: "cost_categories"
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_expense_payments: {
        Row: {
          amount: number
          bank_transaction_id: string | null
          created_at: string
          created_by: string | null
          expense_item_id: string
          id: string
          method: Database["public"]["Enums"]["financial_payment_method"]
          notes: string | null
          payment_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          expense_item_id: string
          id?: string
          method?: Database["public"]["Enums"]["financial_payment_method"]
          notes?: string | null
          payment_date: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          expense_item_id?: string
          id?: string
          method?: Database["public"]["Enums"]["financial_payment_method"]
          notes?: string | null
          payment_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_expense_payments_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_expense_payments_expense_item_id_fkey"
            columns: ["expense_item_id"]
            isOneToOne: false
            referencedRelation: "benefit_expenses_v"
            referencedColumns: ["finance_item_id"]
          },
          {
            foreignKeyName: "financial_expense_payments_expense_item_id_fkey"
            columns: ["expense_item_id"]
            isOneToOne: false
            referencedRelation: "financial_expense_items"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_import_logs: {
        Row: {
          created_at: string
          created_by: string | null
          file_checksum: string | null
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
          rows_salary_snapshots: number
          rows_suppliers: number
          source_file_size_bytes: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_checksum?: string | null
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
          rows_salary_snapshots?: number
          rows_suppliers?: number
          source_file_size_bytes?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_checksum?: string | null
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
          rows_salary_snapshots?: number
          rows_suppliers?: number
          source_file_size_bytes?: number | null
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
            referencedRelation: "companies"
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
      historical_time_entries: {
        Row: {
          amount: number
          billable_hours: number
          collaborator_email: string | null
          collaborator_id: string | null
          company_id: string | null
          company_name: string | null
          content: string | null
          cost: number
          created_at: string
          entry_date: string
          external_id: string
          id: string
          import_job_id: string | null
          invoice_number: string | null
          non_billable_hours: number
          profit: number
          project_id: string | null
          project_reference: string | null
          rate: number | null
          rate_title: string | null
          raw: Json
          resource_id: string | null
          source_system: string
          stage_id: string | null
          status_text: string | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          billable_hours?: number
          collaborator_email?: string | null
          collaborator_id?: string | null
          company_id?: string | null
          company_name?: string | null
          content?: string | null
          cost?: number
          created_at?: string
          entry_date: string
          external_id: string
          id?: string
          import_job_id?: string | null
          invoice_number?: string | null
          non_billable_hours?: number
          profit?: number
          project_id?: string | null
          project_reference?: string | null
          rate?: number | null
          rate_title?: string | null
          raw?: Json
          resource_id?: string | null
          source_system: string
          stage_id?: string | null
          status_text?: string | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          billable_hours?: number
          collaborator_email?: string | null
          collaborator_id?: string | null
          company_id?: string | null
          company_name?: string | null
          content?: string | null
          cost?: number
          created_at?: string
          entry_date?: string
          external_id?: string
          id?: string
          import_job_id?: string | null
          invoice_number?: string | null
          non_billable_hours?: number
          profit?: number
          project_id?: string | null
          project_reference?: string | null
          rate?: number | null
          rate_title?: string | null
          raw?: Json
          resource_id?: string | null
          source_system?: string
          stage_id?: string | null
          status_text?: string | null
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "historical_time_entries_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_time_entries_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_time_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_time_entries_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_time_entries_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_time_entries_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_time_entries_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pm_stages"
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
      import_identity_mappings: {
        Row: {
          active: boolean
          collaborator_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          resource_id: string | null
          source_identifier: string
          source_name: string | null
          source_system: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          collaborator_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          resource_id?: string | null
          source_identifier: string
          source_name?: string | null
          source_system: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          collaborator_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          resource_id?: string | null
          source_identifier?: string
          source_name?: string | null
          source_system?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_identity_mappings_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_identity_mappings_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_identity_mappings_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_identity_mappings_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources_public"
            referencedColumns: ["id"]
          },
        ]
      }
      import_job_rows: {
        Row: {
          created_at: string
          error_message: string | null
          external_id: string | null
          id: string
          import_job_id: string
          parsed_data: Json
          raw_data: Json
          row_number: number
          status: Database["public"]["Enums"]["import_row_status"]
          warning_message: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          import_job_id: string
          parsed_data?: Json
          raw_data?: Json
          row_number: number
          status?: Database["public"]["Enums"]["import_row_status"]
          warning_message?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          import_job_id?: string
          parsed_data?: Json
          raw_data?: Json
          row_number?: number
          status?: Database["public"]["Enums"]["import_row_status"]
          warning_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_job_rows_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_count: number
          id: string
          import_type: Database["public"]["Enums"]["import_type"]
          imported_count: number
          metadata: Json
          original_filename: string | null
          row_count: number
          skipped_count: number
          source_system: string
          status: Database["public"]["Enums"]["import_job_status"]
          storage_path: string | null
          warning_count: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_count?: number
          id?: string
          import_type: Database["public"]["Enums"]["import_type"]
          imported_count?: number
          metadata?: Json
          original_filename?: string | null
          row_count?: number
          skipped_count?: number
          source_system?: string
          status?: Database["public"]["Enums"]["import_job_status"]
          storage_path?: string | null
          warning_count?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_count?: number
          id?: string
          import_type?: Database["public"]["Enums"]["import_type"]
          imported_count?: number
          metadata?: Json
          original_filename?: string | null
          row_count?: number
          skipped_count?: number
          source_system?: string
          status?: Database["public"]["Enums"]["import_job_status"]
          storage_path?: string | null
          warning_count?: number
        }
        Relationships: []
      }
      inventory_asset_documents: {
        Row: {
          asset_id: string
          created_at: string
          created_by: string | null
          doc_kind: string
          financial_document_id: string | null
          id: string
          storage_bucket: string | null
          storage_path: string | null
          title: string | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          created_by?: string | null
          doc_kind?: string
          financial_document_id?: string | null
          id?: string
          storage_bucket?: string | null
          storage_path?: string | null
          title?: string | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          created_by?: string | null
          doc_kind?: string
          financial_document_id?: string | null
          id?: string
          storage_bucket?: string | null
          storage_path?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_asset_documents_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "inventory_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_asset_documents_financial_document_id_fkey"
            columns: ["financial_document_id"]
            isOneToOne: false
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_asset_events: {
        Row: {
          actor_user_id: string | null
          asset_id: string
          created_at: string
          event_date: string
          event_type: Database["public"]["Enums"]["inventory_event_type"]
          field: string | null
          id: string
          new_value: string | null
          notes: string | null
          previous_value: string | null
        }
        Insert: {
          actor_user_id?: string | null
          asset_id: string
          created_at?: string
          event_date?: string
          event_type: Database["public"]["Enums"]["inventory_event_type"]
          field?: string | null
          id?: string
          new_value?: string | null
          notes?: string | null
          previous_value?: string | null
        }
        Update: {
          actor_user_id?: string | null
          asset_id?: string
          created_at?: string
          event_date?: string
          event_type?: Database["public"]["Enums"]["inventory_event_type"]
          field?: string | null
          id?: string
          new_value?: string | null
          notes?: string | null
          previous_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_asset_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "inventory_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_assets: {
        Row: {
          asset_code: string
          assigned_collaborator_id: string | null
          brand: string | null
          category_id: string
          created_at: string
          created_by: string | null
          custody_mode: Database["public"]["Enums"]["inventory_custody_mode"]
          department: string | null
          depreciation_years: number
          description: string | null
          id: string
          include_in_insurance_register: boolean
          insurance_value: number | null
          invoice_number_snapshot: string | null
          kit_id: string | null
          location: string | null
          model: string | null
          name: string
          notes: string | null
          photo_path: string | null
          purchase_date: string | null
          purchase_price_ex_vat: number | null
          purchase_price_inc_vat: number | null
          replacement_years: number
          serial_number: string | null
          source_document_id: string | null
          source_document_line_id: string | null
          source_unit_index: number | null
          status: Database["public"]["Enums"]["inventory_asset_status"]
          supplier_company_id: string | null
          tracking_level: Database["public"]["Enums"]["inventory_tracking_level"]
          updated_at: string
          vat_amount: number | null
          warranty_expiry: string | null
        }
        Insert: {
          asset_code: string
          assigned_collaborator_id?: string | null
          brand?: string | null
          category_id: string
          created_at?: string
          created_by?: string | null
          custody_mode?: Database["public"]["Enums"]["inventory_custody_mode"]
          department?: string | null
          depreciation_years?: number
          description?: string | null
          id?: string
          include_in_insurance_register?: boolean
          insurance_value?: number | null
          invoice_number_snapshot?: string | null
          kit_id?: string | null
          location?: string | null
          model?: string | null
          name: string
          notes?: string | null
          photo_path?: string | null
          purchase_date?: string | null
          purchase_price_ex_vat?: number | null
          purchase_price_inc_vat?: number | null
          replacement_years?: number
          serial_number?: string | null
          source_document_id?: string | null
          source_document_line_id?: string | null
          source_unit_index?: number | null
          status?: Database["public"]["Enums"]["inventory_asset_status"]
          supplier_company_id?: string | null
          tracking_level?: Database["public"]["Enums"]["inventory_tracking_level"]
          updated_at?: string
          vat_amount?: number | null
          warranty_expiry?: string | null
        }
        Update: {
          asset_code?: string
          assigned_collaborator_id?: string | null
          brand?: string | null
          category_id?: string
          created_at?: string
          created_by?: string | null
          custody_mode?: Database["public"]["Enums"]["inventory_custody_mode"]
          department?: string | null
          depreciation_years?: number
          description?: string | null
          id?: string
          include_in_insurance_register?: boolean
          insurance_value?: number | null
          invoice_number_snapshot?: string | null
          kit_id?: string | null
          location?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          photo_path?: string | null
          purchase_date?: string | null
          purchase_price_ex_vat?: number | null
          purchase_price_inc_vat?: number | null
          replacement_years?: number
          serial_number?: string | null
          source_document_id?: string | null
          source_document_line_id?: string | null
          source_unit_index?: number | null
          status?: Database["public"]["Enums"]["inventory_asset_status"]
          supplier_company_id?: string | null
          tracking_level?: Database["public"]["Enums"]["inventory_tracking_level"]
          updated_at?: string
          vat_amount?: number | null
          warranty_expiry?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_assets_assigned_collaborator_id_fkey"
            columns: ["assigned_collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_assets_assigned_collaborator_id_fkey"
            columns: ["assigned_collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_assets_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "inventory_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_assets_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_assets_source_document_line_id_fkey"
            columns: ["source_document_line_id"]
            isOneToOne: false
            referencedRelation: "financial_document_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_assets_source_document_line_id_fkey"
            columns: ["source_document_line_id"]
            isOneToOne: false
            referencedRelation: "inventory_line_processing"
            referencedColumns: ["line_id"]
          },
          {
            foreignKeyName: "inventory_assets_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_assignments: {
        Row: {
          asset_id: string
          assigned_on: string
          collaborator_id: string | null
          created_at: string
          created_by: string | null
          custody_mode: Database["public"]["Enums"]["inventory_custody_mode"]
          department: string | null
          id: string
          location: string | null
          notes: string | null
          returned_on: string | null
          updated_at: string
        }
        Insert: {
          asset_id: string
          assigned_on?: string
          collaborator_id?: string | null
          created_at?: string
          created_by?: string | null
          custody_mode: Database["public"]["Enums"]["inventory_custody_mode"]
          department?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          returned_on?: string | null
          updated_at?: string
        }
        Update: {
          asset_id?: string
          assigned_on?: string
          collaborator_id?: string | null
          created_at?: string
          created_by?: string | null
          custody_mode?: Database["public"]["Enums"]["inventory_custody_mode"]
          department?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          returned_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_assignments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "inventory_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_assignments_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_assignments_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_categories: {
        Row: {
          code: string
          created_at: string
          default_depreciation_years: number
          default_replacement_years: number
          default_tracking_level: Database["public"]["Enums"]["inventory_tracking_level"]
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_depreciation_years?: number
          default_replacement_years?: number
          default_tracking_level?: Database["public"]["Enums"]["inventory_tracking_level"]
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_depreciation_years?: number
          default_replacement_years?: number
          default_tracking_level?: Database["public"]["Enums"]["inventory_tracking_level"]
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      inventory_code_counters: {
        Row: {
          category_code: string
          last_number: number
        }
        Insert: {
          category_code: string
          last_number?: number
        }
        Update: {
          category_code?: string
          last_number?: number
        }
        Relationships: []
      }
      inventory_kits: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_line_skips: {
        Row: {
          created_at: string
          created_by: string | null
          document_id: string
          line_id: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_id: string
          line_id: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_id?: string
          line_id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_line_skips_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_line_skips_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: true
            referencedRelation: "financial_document_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_line_skips_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: true
            referencedRelation: "inventory_line_processing"
            referencedColumns: ["line_id"]
          },
        ]
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
      library_products: {
        Row: {
          attributes: Json
          category_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          designer: string | null
          dimensions: string | null
          finish_image_path: string | null
          id: string
          indicative_unit_price: number | null
          manufacturer: string | null
          material_spec: string | null
          name: string
          notes: string | null
          price_last_updated: string | null
          primary_image_path: string | null
          product_url: string | null
          ref_code: string | null
          sample_pdf_path: string | null
          status: string
          updated_at: string
          weight: string | null
        }
        Insert: {
          attributes?: Json
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          designer?: string | null
          dimensions?: string | null
          finish_image_path?: string | null
          id?: string
          indicative_unit_price?: number | null
          manufacturer?: string | null
          material_spec?: string | null
          name: string
          notes?: string | null
          price_last_updated?: string | null
          primary_image_path?: string | null
          product_url?: string | null
          ref_code?: string | null
          sample_pdf_path?: string | null
          status?: string
          updated_at?: string
          weight?: string | null
        }
        Update: {
          attributes?: Json
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          designer?: string | null
          dimensions?: string | null
          finish_image_path?: string | null
          id?: string
          indicative_unit_price?: number | null
          manufacturer?: string | null
          material_spec?: string | null
          name?: string
          notes?: string | null
          price_last_updated?: string | null
          primary_image_path?: string | null
          product_url?: string | null
          ref_code?: string | null
          sample_pdf_path?: string | null
          status?: string
          updated_at?: string
          weight?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "library_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
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
      notification_preferences: {
        Row: {
          created_at: string
          digest_hour: number
          email_digest_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          digest_hour?: number
          email_digest_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          digest_hour?: number
          email_digest_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: string
          link_path: string | null
          module: string | null
          read_at: string | null
          reminder_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind: string
          link_path?: string | null
          module?: string | null
          read_at?: string | null
          reminder_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: string
          link_path?: string | null
          module?: string | null
          read_at?: string | null
          reminder_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "reminders"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_activities: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          opportunity_id: string
          type: Database["public"]["Enums"]["opportunity_activity_type"]
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          opportunity_id: string
          type?: Database["public"]["Enums"]["opportunity_activity_type"]
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          opportunity_id?: string
          type?: Database["public"]["Enums"]["opportunity_activity_type"]
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_user_permissions: {
        Row: {
          created_at: string
          email: string
          permission_key: string
        }
        Insert: {
          created_at?: string
          email: string
          permission_key: string
        }
        Update: {
          created_at?: string
          email?: string
          permission_key?: string
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
            foreignKeyName: "pm_activities_author_resource_id_fkey"
            columns: ["author_resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources_public"
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
          {
            foreignKeyName: "pm_activity_replies_author_resource_id_fkey"
            columns: ["author_resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources_public"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_allocations: {
        Row: {
          allocation_percentage: number | null
          created_at: string
          end_date: string
          external_id: string | null
          hours_per_day: number
          id: string
          is_locked: boolean
          resource_id: string
          source: string | null
          source_quote_allocation_id: string | null
          stage_id: string
          start_date: string
          status: Database["public"]["Enums"]["pm_allocation_status"]
          status_changed_at: string | null
          total_hours_imported: number | null
          updated_at: string
        }
        Insert: {
          allocation_percentage?: number | null
          created_at?: string
          end_date: string
          external_id?: string | null
          hours_per_day?: number
          id?: string
          is_locked?: boolean
          resource_id: string
          source?: string | null
          source_quote_allocation_id?: string | null
          stage_id: string
          start_date: string
          status?: Database["public"]["Enums"]["pm_allocation_status"]
          status_changed_at?: string | null
          total_hours_imported?: number | null
          updated_at?: string
        }
        Update: {
          allocation_percentage?: number | null
          created_at?: string
          end_date?: string
          external_id?: string | null
          hours_per_day?: number
          id?: string
          is_locked?: boolean
          resource_id?: string
          source?: string | null
          source_quote_allocation_id?: string | null
          stage_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["pm_allocation_status"]
          status_changed_at?: string | null
          total_hours_imported?: number | null
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
            foreignKeyName: "pm_allocations_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources_public"
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
          supplier_company_id: string | null
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
          supplier_company_id?: string | null
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
          supplier_company_id?: string | null
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
            foreignKeyName: "pm_expenses_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          financial_document_id: string | null
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
          financial_document_id?: string | null
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
          financial_document_id?: string | null
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
            foreignKeyName: "pm_invoices_financial_document_id_fkey"
            columns: ["financial_document_id"]
            isOneToOne: false
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
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
          source_quote_external_service_id: string | null
          status: Database["public"]["Enums"]["pm_external_service_status"]
          supplier_company_id: string | null
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
          source_quote_external_service_id?: string | null
          status?: Database["public"]["Enums"]["pm_external_service_status"]
          supplier_company_id?: string | null
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
          source_quote_external_service_id?: string | null
          status?: Database["public"]["Enums"]["pm_external_service_status"]
          supplier_company_id?: string | null
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
            foreignKeyName: "pm_materials_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      pm_payment_schedule_items: {
        Row: {
          amount_type: Database["public"]["Enums"]["quote_payment_amount_type"]
          amount_value: number
          billing_status: Database["public"]["Enums"]["quote_invoice_billing_status"]
          created_at: string
          direction: string
          expected_invoice_date: string | null
          expected_payment_date: string | null
          generator_source: string | null
          id: string
          invoice_group_id: string | null
          label: string
          linked_payment_item_id: string | null
          manual_override: boolean
          notes: string | null
          payment_offset_days: number
          payment_terms: string | null
          project_id: string
          sort_order: number
          source_quote_payment_item_id: string | null
          stage_id: string | null
          supplier_company_id: string | null
          supplier_id: string | null
          supplier_label: string | null
          trigger_type: Database["public"]["Enums"]["quote_payment_trigger"]
          updated_at: string
          vat_rate: number
          vat_rate_override: boolean
        }
        Insert: {
          amount_type: Database["public"]["Enums"]["quote_payment_amount_type"]
          amount_value?: number
          billing_status?: Database["public"]["Enums"]["quote_invoice_billing_status"]
          created_at?: string
          direction?: string
          expected_invoice_date?: string | null
          expected_payment_date?: string | null
          generator_source?: string | null
          id?: string
          invoice_group_id?: string | null
          label: string
          linked_payment_item_id?: string | null
          manual_override?: boolean
          notes?: string | null
          payment_offset_days?: number
          payment_terms?: string | null
          project_id: string
          sort_order?: number
          source_quote_payment_item_id?: string | null
          stage_id?: string | null
          supplier_company_id?: string | null
          supplier_id?: string | null
          supplier_label?: string | null
          trigger_type: Database["public"]["Enums"]["quote_payment_trigger"]
          updated_at?: string
          vat_rate?: number
          vat_rate_override?: boolean
        }
        Update: {
          amount_type?: Database["public"]["Enums"]["quote_payment_amount_type"]
          amount_value?: number
          billing_status?: Database["public"]["Enums"]["quote_invoice_billing_status"]
          created_at?: string
          direction?: string
          expected_invoice_date?: string | null
          expected_payment_date?: string | null
          generator_source?: string | null
          id?: string
          invoice_group_id?: string | null
          label?: string
          linked_payment_item_id?: string | null
          manual_override?: boolean
          notes?: string | null
          payment_offset_days?: number
          payment_terms?: string | null
          project_id?: string
          sort_order?: number
          source_quote_payment_item_id?: string | null
          stage_id?: string | null
          supplier_company_id?: string | null
          supplier_id?: string | null
          supplier_label?: string | null
          trigger_type?: Database["public"]["Enums"]["quote_payment_trigger"]
          updated_at?: string
          vat_rate?: number
          vat_rate_override?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pm_payment_schedule_items_linked_payment_item_id_fkey"
            columns: ["linked_payment_item_id"]
            isOneToOne: false
            referencedRelation: "pm_payment_schedule_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_payment_schedule_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_payment_schedule_items_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pm_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_payment_schedule_items_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_payment_schedule_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pm_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_payment_schedule_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pm_suppliers_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_project_commercial_baselines: {
        Row: {
          baseline_json: Json
          bootstrap_run_id: string
          created_at: string
          id: string
          planned_construction_months: number | null
          planned_duration_weeks: number | null
          project_id: string
          sold_consultant_fee: number | null
          sold_external_fee: number | null
          sold_fee_total: number | null
          sold_internal_fee: number | null
          sold_reimbursable_allowance: number | null
          source_contract_id: string | null
          target_chargeability_pct: number | null
          target_gross_margin_pct: number | null
          target_recoverability_pct: number | null
          updated_at: string
        }
        Insert: {
          baseline_json?: Json
          bootstrap_run_id: string
          created_at?: string
          id?: string
          planned_construction_months?: number | null
          planned_duration_weeks?: number | null
          project_id: string
          sold_consultant_fee?: number | null
          sold_external_fee?: number | null
          sold_fee_total?: number | null
          sold_internal_fee?: number | null
          sold_reimbursable_allowance?: number | null
          source_contract_id?: string | null
          target_chargeability_pct?: number | null
          target_gross_margin_pct?: number | null
          target_recoverability_pct?: number | null
          updated_at?: string
        }
        Update: {
          baseline_json?: Json
          bootstrap_run_id?: string
          created_at?: string
          id?: string
          planned_construction_months?: number | null
          planned_duration_weeks?: number | null
          project_id?: string
          sold_consultant_fee?: number | null
          sold_external_fee?: number | null
          sold_fee_total?: number | null
          sold_internal_fee?: number | null
          sold_reimbursable_allowance?: number | null
          source_contract_id?: string | null
          target_chargeability_pct?: number | null
          target_gross_margin_pct?: number | null
          target_recoverability_pct?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_project_commercial_baselines_bootstrap_run_id_fkey"
            columns: ["bootstrap_run_id"]
            isOneToOne: true
            referencedRelation: "project_bootstrap_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_project_commercial_baselines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_project_commercial_baselines_source_contract_id_fkey"
            columns: ["source_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_project_contract_baseline: {
        Row: {
          created_at: string
          currency: string | null
          id: string
          notes: string | null
          pricing_multiplier: number | null
          project_id: string
          quote_id: string | null
          quote_number: string | null
          quote_title: string | null
          snapshot_at: string
          total_external_fee: number | null
          total_fee: number | null
          total_internal_fee: number | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          id?: string
          notes?: string | null
          pricing_multiplier?: number | null
          project_id: string
          quote_id?: string | null
          quote_number?: string | null
          quote_title?: string | null
          snapshot_at?: string
          total_external_fee?: number | null
          total_fee?: number | null
          total_internal_fee?: number | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          id?: string
          notes?: string | null
          pricing_multiplier?: number | null
          project_id?: string
          quote_id?: string | null
          quote_number?: string | null
          quote_title?: string | null
          snapshot_at?: string
          total_external_fee?: number | null
          total_fee?: number | null
          total_internal_fee?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_project_contract_baseline_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_project_contract_baseline_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposal_values"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "pm_project_contract_baseline_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_project_contract_baseline_payments: {
        Row: {
          amount: number | null
          baseline_id: string
          created_at: string
          expected_invoice_date: string | null
          expected_payment_date: string | null
          id: string
          label: string
          sort_order: number
          stage_name: string | null
          trigger_type: string | null
        }
        Insert: {
          amount?: number | null
          baseline_id: string
          created_at?: string
          expected_invoice_date?: string | null
          expected_payment_date?: string | null
          id?: string
          label: string
          sort_order?: number
          stage_name?: string | null
          trigger_type?: string | null
        }
        Update: {
          amount?: number | null
          baseline_id?: string
          created_at?: string
          expected_invoice_date?: string | null
          expected_payment_date?: string | null
          id?: string
          label?: string
          sort_order?: number
          stage_name?: string | null
          trigger_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_project_contract_baseline_payments_baseline_id_fkey"
            columns: ["baseline_id"]
            isOneToOne: false
            referencedRelation: "pm_project_contract_baseline"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_project_contract_baseline_stages: {
        Row: {
          baseline_id: string
          billing_model: string | null
          budget: number | null
          created_at: string
          end_date: string | null
          id: string
          live_stage_id: string | null
          name: string
          parent_name: string | null
          sort_order: number
          stage_kind: string | null
          start_date: string | null
        }
        Insert: {
          baseline_id: string
          billing_model?: string | null
          budget?: number | null
          created_at?: string
          end_date?: string | null
          id?: string
          live_stage_id?: string | null
          name: string
          parent_name?: string | null
          sort_order?: number
          stage_kind?: string | null
          start_date?: string | null
        }
        Update: {
          baseline_id?: string
          billing_model?: string | null
          budget?: number | null
          created_at?: string
          end_date?: string | null
          id?: string
          live_stage_id?: string | null
          name?: string
          parent_name?: string | null
          sort_order?: number
          stage_kind?: string | null
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_project_contract_baseline_stages_baseline_id_fkey"
            columns: ["baseline_id"]
            isOneToOne: false
            referencedRelation: "pm_project_contract_baseline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_project_contract_baseline_stages_live_stage_id_fkey"
            columns: ["live_stage_id"]
            isOneToOne: false
            referencedRelation: "pm_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_project_forecast_metrics: {
        Row: {
          allocated_hours: number | null
          capacity_risk_level:
            | Database["public"]["Enums"]["pm_capacity_risk_level"]
            | null
          created_at: string
          forecast_cost: number | null
          forecast_fee: number | null
          forecast_margin_pct: number | null
          id: string
          planned_cost: number | null
          planned_fee: number | null
          planned_margin_pct: number | null
          project_id: string
          remaining_hours: number | null
          snapshot_date: string
          staffing_coverage_pct: number | null
        }
        Insert: {
          allocated_hours?: number | null
          capacity_risk_level?:
            | Database["public"]["Enums"]["pm_capacity_risk_level"]
            | null
          created_at?: string
          forecast_cost?: number | null
          forecast_fee?: number | null
          forecast_margin_pct?: number | null
          id?: string
          planned_cost?: number | null
          planned_fee?: number | null
          planned_margin_pct?: number | null
          project_id: string
          remaining_hours?: number | null
          snapshot_date?: string
          staffing_coverage_pct?: number | null
        }
        Update: {
          allocated_hours?: number | null
          capacity_risk_level?:
            | Database["public"]["Enums"]["pm_capacity_risk_level"]
            | null
          created_at?: string
          forecast_cost?: number | null
          forecast_fee?: number | null
          forecast_margin_pct?: number | null
          id?: string
          planned_cost?: number | null
          planned_fee?: number | null
          planned_margin_pct?: number | null
          project_id?: string
          remaining_hours?: number | null
          snapshot_date?: string
          staffing_coverage_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_project_forecast_metrics_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_project_notes: {
        Row: {
          ai_metadata: Json | null
          audio_path: string | null
          author_id: string
          body: string
          category: string
          confidential: boolean
          created_at: string
          entities: Json
          event_date: string | null
          id: string
          project_id: string
          raw_transcript: string | null
          source: string
          stage_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          ai_metadata?: Json | null
          audio_path?: string | null
          author_id?: string
          body: string
          category?: string
          confidential?: boolean
          created_at?: string
          entities?: Json
          event_date?: string | null
          id?: string
          project_id: string
          raw_transcript?: string | null
          source?: string
          stage_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          ai_metadata?: Json | null
          audio_path?: string | null
          author_id?: string
          body?: string
          category?: string
          confidential?: boolean
          created_at?: string
          entities?: Json
          event_date?: string | null
          id?: string
          project_id?: string
          raw_transcript?: string | null
          source?: string
          stage_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_project_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_project_notes_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pm_stages"
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
          {
            foreignKeyName: "pm_project_rate_overrides_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources_public"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_project_team: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          resource_id: string
          role: Database["public"]["Enums"]["pm_project_team_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          project_id: string
          resource_id: string
          role: Database["public"]["Enums"]["pm_project_team_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string
          resource_id?: string
          role?: Database["public"]["Enums"]["pm_project_team_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_project_team_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_project_team_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_project_team_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources_public"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_projects: {
        Row: {
          account_id: string | null
          bootstrap_run_id: string | null
          client: string | null
          color: string
          company_id: string | null
          created_at: string
          external_id: string | null
          id: string
          last_synced_at: string | null
          name: string
          notes: string | null
          opportunity_id: string | null
          origin: string
          quote_id: string | null
          sold_at: string | null
          sold_external_fee: number | null
          sold_fee: number | null
          sold_internal_fee: number | null
          sold_pricing_multiplier: number | null
          source_contract_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["pm_project_status"]
          sync_status: Database["public"]["Enums"]["pm_sync_status"]
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          bootstrap_run_id?: string | null
          client?: string | null
          color?: string
          company_id?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          last_synced_at?: string | null
          name: string
          notes?: string | null
          opportunity_id?: string | null
          origin?: string
          quote_id?: string | null
          sold_at?: string | null
          sold_external_fee?: number | null
          sold_fee?: number | null
          sold_internal_fee?: number | null
          sold_pricing_multiplier?: number | null
          source_contract_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["pm_project_status"]
          sync_status?: Database["public"]["Enums"]["pm_sync_status"]
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          bootstrap_run_id?: string | null
          client?: string | null
          color?: string
          company_id?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          last_synced_at?: string | null
          name?: string
          notes?: string | null
          opportunity_id?: string | null
          origin?: string
          quote_id?: string | null
          sold_at?: string | null
          sold_external_fee?: number | null
          sold_fee?: number | null
          sold_internal_fee?: number | null
          sold_pricing_multiplier?: number | null
          source_contract_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["pm_project_status"]
          sync_status?: Database["public"]["Enums"]["pm_sync_status"]
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
            foreignKeyName: "pm_projects_bootstrap_run_id_fkey"
            columns: ["bootstrap_run_id"]
            isOneToOne: false
            referencedRelation: "project_bootstrap_runs"
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
            referencedRelation: "fee_proposal_values"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "pm_projects_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_projects_source_contract_id_fkey"
            columns: ["source_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_resource_allocations_forecast: {
        Row: {
          allocated_hours: number
          allocated_pct: number | null
          allocation_date: string
          allocation_id: string | null
          bootstrap_run_id: string | null
          collaborator_id: string | null
          created_at: string
          id: string
          project_id: string
          project_stage_id: string
          resource_id: string | null
          source: Database["public"]["Enums"]["pm_forecast_allocation_source"]
          updated_at: string
        }
        Insert: {
          allocated_hours?: number
          allocated_pct?: number | null
          allocation_date: string
          allocation_id?: string | null
          bootstrap_run_id?: string | null
          collaborator_id?: string | null
          created_at?: string
          id?: string
          project_id: string
          project_stage_id: string
          resource_id?: string | null
          source?: Database["public"]["Enums"]["pm_forecast_allocation_source"]
          updated_at?: string
        }
        Update: {
          allocated_hours?: number
          allocated_pct?: number | null
          allocation_date?: string
          allocation_id?: string | null
          bootstrap_run_id?: string | null
          collaborator_id?: string | null
          created_at?: string
          id?: string
          project_id?: string
          project_stage_id?: string
          resource_id?: string | null
          source?: Database["public"]["Enums"]["pm_forecast_allocation_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_resource_allocations_forecast_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "pm_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_resource_allocations_forecast_bootstrap_run_id_fkey"
            columns: ["bootstrap_run_id"]
            isOneToOne: false
            referencedRelation: "project_bootstrap_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_resource_allocations_forecast_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_resource_allocations_forecast_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_resource_allocations_forecast_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_resource_allocations_forecast_project_stage_id_fkey"
            columns: ["project_stage_id"]
            isOneToOne: false
            referencedRelation: "pm_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_resource_allocations_forecast_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_resource_allocations_forecast_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources_public"
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
          source: string
          source_snapshot_id: string | null
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
          source?: string
          source_snapshot_id?: string | null
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
          source?: string
          source_snapshot_id?: string | null
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
          {
            foreignKeyName: "pm_resource_rates_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_resource_rates_source_snapshot_id_fkey"
            columns: ["source_snapshot_id"]
            isOneToOne: false
            referencedRelation: "salary_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_resources: {
        Row: {
          active: boolean
          billing_role: string | null
          collaborator_id: string | null
          color: string
          cost_rate: number
          created_at: string
          email: string | null
          full_name: string | null
          hourly_rate: number
          hourly_rate_is_override: boolean
          id: string
          name: string
          notes: string | null
          phone: string | null
          proposal_role: string | null
          rate_effective_from: string
          role: string | null
          sale_rate: number
          seniority_level: number | null
          team: string
          updated_at: string
          weekly_capacity: number
        }
        Insert: {
          active?: boolean
          billing_role?: string | null
          collaborator_id?: string | null
          color?: string
          cost_rate?: number
          created_at?: string
          email?: string | null
          full_name?: string | null
          hourly_rate?: number
          hourly_rate_is_override?: boolean
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          proposal_role?: string | null
          rate_effective_from?: string
          role?: string | null
          sale_rate?: number
          seniority_level?: number | null
          team?: string
          updated_at?: string
          weekly_capacity?: number
        }
        Update: {
          active?: boolean
          billing_role?: string | null
          collaborator_id?: string | null
          color?: string
          cost_rate?: number
          created_at?: string
          email?: string | null
          full_name?: string | null
          hourly_rate?: number
          hourly_rate_is_override?: boolean
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          proposal_role?: string | null
          rate_effective_from?: string
          role?: string | null
          sale_rate?: number
          seniority_level?: number | null
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
      pm_stage_allocation_placeholders: {
        Row: {
          bootstrap_run_id: string
          confidence_pct: number | null
          created_at: string
          discipline: string | null
          expected_duration_weeks: number | null
          expected_fte: number | null
          expected_hours: number | null
          id: string
          project_stage_id: string
          role: string | null
          source: Database["public"]["Enums"]["pm_allocation_placeholder_source"]
          updated_at: string
        }
        Insert: {
          bootstrap_run_id: string
          confidence_pct?: number | null
          created_at?: string
          discipline?: string | null
          expected_duration_weeks?: number | null
          expected_fte?: number | null
          expected_hours?: number | null
          id?: string
          project_stage_id: string
          role?: string | null
          source?: Database["public"]["Enums"]["pm_allocation_placeholder_source"]
          updated_at?: string
        }
        Update: {
          bootstrap_run_id?: string
          confidence_pct?: number | null
          created_at?: string
          discipline?: string | null
          expected_duration_weeks?: number | null
          expected_fte?: number | null
          expected_hours?: number | null
          id?: string
          project_stage_id?: string
          role?: string | null
          source?: Database["public"]["Enums"]["pm_allocation_placeholder_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_stage_allocation_placeholders_bootstrap_run_id_fkey"
            columns: ["bootstrap_run_id"]
            isOneToOne: false
            referencedRelation: "project_bootstrap_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_stage_allocation_placeholders_project_stage_id_fkey"
            columns: ["project_stage_id"]
            isOneToOne: false
            referencedRelation: "pm_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_stage_capacity_snapshots: {
        Row: {
          allocated_hours: number | null
          created_at: string
          id: string
          planned_cost: number | null
          planned_hours: number | null
          planned_margin_pct: number | null
          planned_revenue: number | null
          project_stage_id: string
          recoverability_pct: number | null
          remaining_hours: number | null
          snapshot_date: string
          staffing_coverage_pct: number | null
        }
        Insert: {
          allocated_hours?: number | null
          created_at?: string
          id?: string
          planned_cost?: number | null
          planned_hours?: number | null
          planned_margin_pct?: number | null
          planned_revenue?: number | null
          project_stage_id: string
          recoverability_pct?: number | null
          remaining_hours?: number | null
          snapshot_date?: string
          staffing_coverage_pct?: number | null
        }
        Update: {
          allocated_hours?: number | null
          created_at?: string
          id?: string
          planned_cost?: number | null
          planned_hours?: number | null
          planned_margin_pct?: number | null
          planned_revenue?: number | null
          project_stage_id?: string
          recoverability_pct?: number | null
          remaining_hours?: number | null
          snapshot_date?: string
          staffing_coverage_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_stage_capacity_snapshots_project_stage_id_fkey"
            columns: ["project_stage_id"]
            isOneToOne: false
            referencedRelation: "pm_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_stage_commercial_baselines: {
        Row: {
          baseline_json: Json
          bootstrap_run_id: string
          created_at: string
          delivery_mode: string | null
          estimated_external_cost: number | null
          estimated_hours: number | null
          estimated_internal_cost: number | null
          id: string
          phase_class: string | null
          project_id: string
          project_stage_id: string
          sold_fee: number | null
          source_contract_phase_key: string | null
          target_margin_pct: number | null
          target_recoverability_pct: number | null
          updated_at: string
        }
        Insert: {
          baseline_json?: Json
          bootstrap_run_id: string
          created_at?: string
          delivery_mode?: string | null
          estimated_external_cost?: number | null
          estimated_hours?: number | null
          estimated_internal_cost?: number | null
          id?: string
          phase_class?: string | null
          project_id: string
          project_stage_id: string
          sold_fee?: number | null
          source_contract_phase_key?: string | null
          target_margin_pct?: number | null
          target_recoverability_pct?: number | null
          updated_at?: string
        }
        Update: {
          baseline_json?: Json
          bootstrap_run_id?: string
          created_at?: string
          delivery_mode?: string | null
          estimated_external_cost?: number | null
          estimated_hours?: number | null
          estimated_internal_cost?: number | null
          id?: string
          phase_class?: string | null
          project_id?: string
          project_stage_id?: string
          sold_fee?: number | null
          source_contract_phase_key?: string | null
          target_margin_pct?: number | null
          target_recoverability_pct?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_stage_commercial_baselines_bootstrap_run_id_fkey"
            columns: ["bootstrap_run_id"]
            isOneToOne: false
            referencedRelation: "project_bootstrap_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_stage_commercial_baselines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_stage_commercial_baselines_project_stage_id_fkey"
            columns: ["project_stage_id"]
            isOneToOne: false
            referencedRelation: "pm_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_stage_dependencies: {
        Row: {
          bootstrap_run_id: string | null
          created_at: string
          id: string
          lag_days: number
          predecessor_id: string
          source_contract_id: string | null
          source_quote_dependency_id: string | null
          successor_id: string
          type: Database["public"]["Enums"]["pm_dep_type"]
          updated_at: string
        }
        Insert: {
          bootstrap_run_id?: string | null
          created_at?: string
          id?: string
          lag_days?: number
          predecessor_id: string
          source_contract_id?: string | null
          source_quote_dependency_id?: string | null
          successor_id: string
          type?: Database["public"]["Enums"]["pm_dep_type"]
          updated_at?: string
        }
        Update: {
          bootstrap_run_id?: string | null
          created_at?: string
          id?: string
          lag_days?: number
          predecessor_id?: string
          source_contract_id?: string | null
          source_quote_dependency_id?: string | null
          successor_id?: string
          type?: Database["public"]["Enums"]["pm_dep_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_stage_dependencies_bootstrap_run_id_fkey"
            columns: ["bootstrap_run_id"]
            isOneToOne: false
            referencedRelation: "project_bootstrap_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_stage_dependencies_predecessor_id_fkey"
            columns: ["predecessor_id"]
            isOneToOne: false
            referencedRelation: "pm_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_stage_dependencies_source_contract_id_fkey"
            columns: ["source_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
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
      pm_stage_supplier_costs: {
        Row: {
          amount: number
          billing_trigger: string
          created_at: string
          custom_date: string | null
          description: string | null
          id: string
          payment_offset_days: number | null
          payment_terms: string | null
          project_id: string
          sort_order: number
          stage_id: string | null
          supplier_id: string | null
          supplier_label: string | null
          updated_at: string
          vat_rate: number | null
        }
        Insert: {
          amount?: number
          billing_trigger?: string
          created_at?: string
          custom_date?: string | null
          description?: string | null
          id?: string
          payment_offset_days?: number | null
          payment_terms?: string | null
          project_id: string
          sort_order?: number
          stage_id?: string | null
          supplier_id?: string | null
          supplier_label?: string | null
          updated_at?: string
          vat_rate?: number | null
        }
        Update: {
          amount?: number
          billing_trigger?: string
          created_at?: string
          custom_date?: string | null
          description?: string | null
          id?: string
          payment_offset_days?: number | null
          payment_terms?: string | null
          project_id?: string
          sort_order?: number
          stage_id?: string | null
          supplier_id?: string | null
          supplier_label?: string | null
          updated_at?: string
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_stage_supplier_costs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_stage_supplier_costs_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pm_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_stage_supplier_costs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pm_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_stage_supplier_costs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pm_suppliers_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_stages: {
        Row: {
          archived_at: string | null
          baseline_budget: number | null
          baseline_end_date: string | null
          baseline_locked_at: string | null
          baseline_notes: string | null
          baseline_start_date: string | null
          baseline_target_hours: number | null
          bill_to_client: boolean
          billing_model: string
          bootstrap_run_id: string | null
          budget: number
          children_bill_independently: boolean
          color: string
          created_at: string
          end_date: string
          external_id: string | null
          id: string
          is_fee_only: boolean
          is_locked: boolean
          is_milestone: boolean
          is_self: boolean
          markup_pct: number
          name: string
          origin: string | null
          parent_stage_id: string | null
          project_id: string
          retainer_anchor_month: string | null
          retainer_capacity_hours_per_month: number
          retainer_monthly_amount: number
          retainer_months: number | null
          retainer_review_months: number | null
          sort_order: number
          source: string | null
          source_contract_id: string | null
          source_contract_phase_key: string | null
          source_quote_stage_id: string | null
          stage_kind: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          baseline_budget?: number | null
          baseline_end_date?: string | null
          baseline_locked_at?: string | null
          baseline_notes?: string | null
          baseline_start_date?: string | null
          baseline_target_hours?: number | null
          bill_to_client?: boolean
          billing_model?: string
          bootstrap_run_id?: string | null
          budget?: number
          children_bill_independently?: boolean
          color?: string
          created_at?: string
          end_date: string
          external_id?: string | null
          id?: string
          is_fee_only?: boolean
          is_locked?: boolean
          is_milestone?: boolean
          is_self?: boolean
          markup_pct?: number
          name: string
          origin?: string | null
          parent_stage_id?: string | null
          project_id: string
          retainer_anchor_month?: string | null
          retainer_capacity_hours_per_month?: number
          retainer_monthly_amount?: number
          retainer_months?: number | null
          retainer_review_months?: number | null
          sort_order?: number
          source?: string | null
          source_contract_id?: string | null
          source_contract_phase_key?: string | null
          source_quote_stage_id?: string | null
          stage_kind?: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          baseline_budget?: number | null
          baseline_end_date?: string | null
          baseline_locked_at?: string | null
          baseline_notes?: string | null
          baseline_start_date?: string | null
          baseline_target_hours?: number | null
          bill_to_client?: boolean
          billing_model?: string
          bootstrap_run_id?: string | null
          budget?: number
          children_bill_independently?: boolean
          color?: string
          created_at?: string
          end_date?: string
          external_id?: string | null
          id?: string
          is_fee_only?: boolean
          is_locked?: boolean
          is_milestone?: boolean
          is_self?: boolean
          markup_pct?: number
          name?: string
          origin?: string | null
          parent_stage_id?: string | null
          project_id?: string
          retainer_anchor_month?: string | null
          retainer_capacity_hours_per_month?: number
          retainer_monthly_amount?: number
          retainer_months?: number | null
          retainer_review_months?: number | null
          sort_order?: number
          source?: string | null
          source_contract_id?: string | null
          source_contract_phase_key?: string | null
          source_quote_stage_id?: string | null
          stage_kind?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_stages_bootstrap_run_id_fkey"
            columns: ["bootstrap_run_id"]
            isOneToOne: false
            referencedRelation: "project_bootstrap_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_stages_parent_stage_id_fkey"
            columns: ["parent_stage_id"]
            isOneToOne: false
            referencedRelation: "pm_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_stages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_stages_source_contract_id_fkey"
            columns: ["source_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
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
          approval_status: Database["public"]["Enums"]["pm_time_entry_approval_status"]
          approved_at: string | null
          approved_by: string | null
          billable: boolean
          cost_rate_snapshot: number | null
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
          pm_stage_id: string | null
          quote_stage_id: string | null
          rejection_reason: string | null
          sale_rate_override: number | null
          sale_rate_snapshot: number | null
          source: string
          started_at: string | null
          task_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_status?: Database["public"]["Enums"]["pm_time_entry_approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          billable?: boolean
          cost_rate_snapshot?: number | null
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
          pm_stage_id?: string | null
          quote_stage_id?: string | null
          rejection_reason?: string | null
          sale_rate_override?: number | null
          sale_rate_snapshot?: number | null
          source?: string
          started_at?: string | null
          task_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_status?: Database["public"]["Enums"]["pm_time_entry_approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          billable?: boolean
          cost_rate_snapshot?: number | null
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
          pm_stage_id?: string | null
          quote_stage_id?: string | null
          rejection_reason?: string | null
          sale_rate_override?: number | null
          sale_rate_snapshot?: number | null
          source?: string
          started_at?: string | null
          task_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_time_entries_pm_stage_id_fkey"
            columns: ["pm_stage_id"]
            isOneToOne: false
            referencedRelation: "pm_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_time_entries_quote_stage_id_fkey"
            columns: ["quote_stage_id"]
            isOneToOne: false
            referencedRelation: "quote_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "pm_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_files: {
        Row: {
          bucket: string | null
          created_at: string
          created_by: string | null
          drive_file_id: string | null
          id: string
          kind: string
          label: string | null
          owner_id: string
          owner_type: string
          storage_path: string | null
          url: string | null
        }
        Insert: {
          bucket?: string | null
          created_at?: string
          created_by?: string | null
          drive_file_id?: string | null
          id?: string
          kind?: string
          label?: string | null
          owner_id: string
          owner_type: string
          storage_path?: string | null
          url?: string | null
        }
        Update: {
          bucket?: string | null
          created_at?: string
          created_by?: string | null
          drive_file_id?: string | null
          id?: string
          kind?: string
          label?: string | null
          owner_id?: string
          owner_type?: string
          storage_path?: string | null
          url?: string | null
        }
        Relationships: []
      }
      project_bootstrap_runs: {
        Row: {
          applied_at: string | null
          contract_id: string
          created_at: string
          created_by: string | null
          error_json: Json | null
          id: string
          resolver_version: string
          result_json: Json
          snapshot_json: Json
          source_quote_id: string | null
          status: Database["public"]["Enums"]["project_bootstrap_status"]
          target_project_id: string | null
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          contract_id: string
          created_at?: string
          created_by?: string | null
          error_json?: Json | null
          id?: string
          resolver_version?: string
          result_json?: Json
          snapshot_json?: Json
          source_quote_id?: string | null
          status?: Database["public"]["Enums"]["project_bootstrap_status"]
          target_project_id?: string | null
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          contract_id?: string
          created_at?: string
          created_by?: string | null
          error_json?: Json | null
          id?: string
          resolver_version?: string
          result_json?: Json
          snapshot_json?: Json
          source_quote_id?: string | null
          status?: Database["public"]["Enums"]["project_bootstrap_status"]
          target_project_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_bootstrap_runs_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_bootstrap_runs_source_quote_id_fkey"
            columns: ["source_quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposal_values"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "project_bootstrap_runs_source_quote_id_fkey"
            columns: ["source_quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_bootstrap_runs_target_project_id_fkey"
            columns: ["target_project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_items: {
        Row: {
          approval_status: string
          attributes: Json
          category_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          designer: string | null
          dimensions: string | null
          finish_image_path: string | null
          id: string
          location: string | null
          manufacturer: string | null
          material_spec: string | null
          name: string
          notes: string | null
          primary_image_path: string | null
          product_url: string | null
          project_id: string
          quantity: number
          ref_code: string | null
          reference: string | null
          sample_pdf_path: string | null
          selected_finish: string | null
          sort_order: number
          source_library_product_id: string | null
          unit_price: number | null
          updated_at: string
          weight: string | null
        }
        Insert: {
          approval_status?: string
          attributes?: Json
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          designer?: string | null
          dimensions?: string | null
          finish_image_path?: string | null
          id?: string
          location?: string | null
          manufacturer?: string | null
          material_spec?: string | null
          name: string
          notes?: string | null
          primary_image_path?: string | null
          product_url?: string | null
          project_id: string
          quantity?: number
          ref_code?: string | null
          reference?: string | null
          sample_pdf_path?: string | null
          selected_finish?: string | null
          sort_order?: number
          source_library_product_id?: string | null
          unit_price?: number | null
          updated_at?: string
          weight?: string | null
        }
        Update: {
          approval_status?: string
          attributes?: Json
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          designer?: string | null
          dimensions?: string | null
          finish_image_path?: string | null
          id?: string
          location?: string | null
          manufacturer?: string | null
          material_spec?: string | null
          name?: string
          notes?: string | null
          primary_image_path?: string | null
          product_url?: string | null
          project_id?: string
          quantity?: number
          ref_code?: string | null
          reference?: string | null
          sample_pdf_path?: string | null
          selected_finish?: string | null
          sort_order?: number
          source_library_product_id?: string | null
          unit_price?: number | null
          updated_at?: string
          weight?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "pm_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_items_source_library_product_id_fkey"
            columns: ["source_library_product_id"]
            isOneToOne: false
            referencedRelation: "library_products"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_addon_modules: {
        Row: {
          applicability: Json
          code: string
          created_at: string
          default_billing_behavior: Json
          default_consultant_ownership: string | null
          description: string | null
          id: string
          is_active: boolean
          label_en: string
          label_pt: string
          metadata: Json
          parallel_or_sequential: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          applicability?: Json
          code: string
          created_at?: string
          default_billing_behavior?: Json
          default_consultant_ownership?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          label_en: string
          label_pt: string
          metadata?: Json
          parallel_or_sequential?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          applicability?: Json
          code?: string
          created_at?: string
          default_billing_behavior?: Json
          default_consultant_ownership?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          label_en?: string
          label_pt?: string
          metadata?: Json
          parallel_or_sequential?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
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
      proposal_commercial_components: {
        Row: {
          code: string
          component_kind: string
          created_at: string
          default_amount_type: string | null
          default_billing_behavior: Json
          description: string | null
          id: string
          is_active: boolean
          label_en: string
          label_pt: string
          metadata: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          component_kind: string
          created_at?: string
          default_amount_type?: string | null
          default_billing_behavior?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          label_en: string
          label_pt: string
          metadata?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          component_kind?: string
          created_at?: string
          default_amount_type?: string | null
          default_billing_behavior?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          label_en?: string
          label_pt?: string
          metadata?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      proposal_delivery_modes: {
        Row: {
          code: string
          created_at: string
          description_en: string | null
          description_pt: string | null
          fee_scaling_hint: number | null
          id: string
          is_active: boolean
          label_en: string
          label_pt: string
          metadata: Json
          operational_implications: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description_en?: string | null
          description_pt?: string | null
          fee_scaling_hint?: number | null
          id?: string
          is_active?: boolean
          label_en: string
          label_pt: string
          metadata?: Json
          operational_implications?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description_en?: string | null
          description_pt?: string | null
          fee_scaling_hint?: number | null
          id?: string
          is_active?: boolean
          label_en?: string
          label_pt?: string
          metadata?: Json
          operational_implications?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      proposal_families: {
        Row: {
          code: string
          created_at: string
          default_billing_topology: Json
          default_delivery_mode: string | null
          default_enabled_phases: string[]
          default_planning_behavior: Json
          default_procurement_mode: string | null
          description: string | null
          id: string
          is_active: boolean
          label_en: string
          label_pt: string
          metadata: Json
          optional_phases: string[]
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_billing_topology?: Json
          default_delivery_mode?: string | null
          default_enabled_phases?: string[]
          default_planning_behavior?: Json
          default_procurement_mode?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          label_en: string
          label_pt: string
          metadata?: Json
          optional_phases?: string[]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_billing_topology?: Json
          default_delivery_mode?: string | null
          default_enabled_phases?: string[]
          default_planning_behavior?: Json
          default_procurement_mode?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          label_en?: string
          label_pt?: string
          metadata?: Json
          optional_phases?: string[]
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      proposal_flags: {
        Row: {
          code: string
          created_at: string
          default_value: Json | null
          description: string | null
          effects: Json
          enum_values: Json | null
          flag_kind: string
          id: string
          is_active: boolean
          label_en: string
          label_pt: string
          metadata: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_value?: Json | null
          description?: string | null
          effects?: Json
          enum_values?: Json | null
          flag_kind?: string
          id?: string
          is_active?: boolean
          label_en: string
          label_pt: string
          metadata?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_value?: Json | null
          description?: string | null
          effects?: Json
          enum_values?: Json | null
          flag_kind?: string
          id?: string
          is_active?: boolean
          label_en?: string
          label_pt?: string
          metadata?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      proposal_phase_aliases: {
        Row: {
          alias_set: string
          created_at: string
          description: string | null
          id: string
          label: string
          locale: string
          metadata: Json
          phase_code: string
          short_label: string | null
          updated_at: string
        }
        Insert: {
          alias_set: string
          created_at?: string
          description?: string | null
          id?: string
          label: string
          locale?: string
          metadata?: Json
          phase_code: string
          short_label?: string | null
          updated_at?: string
        }
        Update: {
          alias_set?: string
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          locale?: string
          metadata?: Json
          phase_code?: string
          short_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_phase_aliases_phase_code_fkey"
            columns: ["phase_code"]
            isOneToOne: false
            referencedRelation: "proposal_phases"
            referencedColumns: ["code"]
          },
        ]
      }
      proposal_phases: {
        Row: {
          code: string
          created_at: string
          default_billing_behavior: Json
          default_order: number
          description_en: string | null
          description_pt: string | null
          display_code: string
          family_applicability: string[]
          id: string
          is_active: boolean
          is_jurisdiction_specific: boolean
          is_optional_default: boolean
          jurisdiction_applicability: string[]
          label_en: string
          label_pt: string
          metadata: Json
          operational_flags: Json
          phase_class: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_billing_behavior?: Json
          default_order: number
          description_en?: string | null
          description_pt?: string | null
          display_code: string
          family_applicability?: string[]
          id?: string
          is_active?: boolean
          is_jurisdiction_specific?: boolean
          is_optional_default?: boolean
          jurisdiction_applicability?: string[]
          label_en: string
          label_pt: string
          metadata?: Json
          operational_flags?: Json
          phase_class?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_billing_behavior?: Json
          default_order?: number
          description_en?: string | null
          description_pt?: string | null
          display_code?: string
          family_applicability?: string[]
          id?: string
          is_active?: boolean
          is_jurisdiction_specific?: boolean
          is_optional_default?: boolean
          jurisdiction_applicability?: string[]
          label_en?: string
          label_pt?: string
          metadata?: Json
          operational_flags?: Json
          phase_class?: string
          updated_at?: string
        }
        Relationships: []
      }
      proposal_presets: {
        Row: {
          at_defaults: Json
          bim_defaults: Json
          code: string
          created_at: string
          default_addons: string[]
          default_delivery_mode: string | null
          default_dependencies: Json
          default_flags: Json
          description: string | null
          enabled_phases: string[]
          family_code: string | null
          id: string
          is_active: boolean
          label_en: string
          label_pt: string
          metadata: Json
          planning_topology: Json
          procurement_behavior: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          at_defaults?: Json
          bim_defaults?: Json
          code: string
          created_at?: string
          default_addons?: string[]
          default_delivery_mode?: string | null
          default_dependencies?: Json
          default_flags?: Json
          description?: string | null
          enabled_phases?: string[]
          family_code?: string | null
          id?: string
          is_active?: boolean
          label_en: string
          label_pt: string
          metadata?: Json
          planning_topology?: Json
          procurement_behavior?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          at_defaults?: Json
          bim_defaults?: Json
          code?: string
          created_at?: string
          default_addons?: string[]
          default_delivery_mode?: string | null
          default_dependencies?: Json
          default_flags?: Json
          description?: string | null
          enabled_phases?: string[]
          family_code?: string | null
          id?: string
          is_active?: boolean
          label_en?: string
          label_pt?: string
          metadata?: Json
          planning_topology?: Json
          procurement_behavior?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_presets_family_code_fkey"
            columns: ["family_code"]
            isOneToOne: false
            referencedRelation: "proposal_families"
            referencedColumns: ["code"]
          },
        ]
      }
      proposal_roles: {
        Row: {
          archived_at: string | null
          code: string
          created_at: string
          default_seniority: number | null
          hourly_rate: number
          id: string
          label_en: string
          label_pt: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          code: string
          created_at?: string
          default_seniority?: number | null
          hourly_rate?: number
          id?: string
          label_en: string
          label_pt: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          code?: string
          created_at?: string
          default_seniority?: number | null
          hourly_rate?: number
          id?: string
          label_en?: string
          label_pt?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      psa_block_library: {
        Row: {
          created_at: string
          default_content_rich: Json
          default_contract_relevance: Database["public"]["Enums"]["psa_contract_relevance"]
          default_source_ref: Json
          default_source_type: Database["public"]["Enums"]["psa_block_source_type"]
          default_title: string
          id: string
          is_system: boolean
          kind: Database["public"]["Enums"]["psa_block_type"]
          label: string
          sort_hint: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_content_rich?: Json
          default_contract_relevance?: Database["public"]["Enums"]["psa_contract_relevance"]
          default_source_ref?: Json
          default_source_type?: Database["public"]["Enums"]["psa_block_source_type"]
          default_title?: string
          id?: string
          is_system?: boolean
          kind: Database["public"]["Enums"]["psa_block_type"]
          label: string
          sort_hint?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_content_rich?: Json
          default_contract_relevance?: Database["public"]["Enums"]["psa_contract_relevance"]
          default_source_ref?: Json
          default_source_type?: Database["public"]["Enums"]["psa_block_source_type"]
          default_title?: string
          id?: string
          is_system?: boolean
          kind?: Database["public"]["Enums"]["psa_block_type"]
          label?: string
          sort_hint?: number
          updated_at?: string
        }
        Relationships: []
      }
      psa_image_library: {
        Row: {
          bucket: string
          category: string
          created_at: string
          created_by: string | null
          height: number | null
          id: string
          name: string
          size_hint: string | null
          storage_path: string
          updated_at: string
          width: number | null
        }
        Insert: {
          bucket?: string
          category?: string
          created_at?: string
          created_by?: string | null
          height?: number | null
          id?: string
          name: string
          size_hint?: string | null
          storage_path: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          bucket?: string
          category?: string
          created_at?: string
          created_by?: string | null
          height?: number | null
          id?: string
          name?: string
          size_hint?: string | null
          storage_path?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: []
      }
      psa_proposal_audit: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          id: string
          payload: Json
          proposal_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          id?: string
          payload?: Json
          proposal_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          id?: string
          payload?: Json
          proposal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "psa_proposal_audit_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "psa_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      psa_proposal_blocks: {
        Row: {
          block_type: Database["public"]["Enums"]["psa_block_type"]
          content_rich: Json
          contract_relevance: Database["public"]["Enums"]["psa_contract_relevance"]
          created_at: string
          id: string
          is_locked: boolean
          is_visible: boolean
          proposal_id: string
          sort_order: number
          source_ref: Json
          source_type: Database["public"]["Enums"]["psa_block_source_type"]
          title: string
          updated_at: string
        }
        Insert: {
          block_type: Database["public"]["Enums"]["psa_block_type"]
          content_rich?: Json
          contract_relevance?: Database["public"]["Enums"]["psa_contract_relevance"]
          created_at?: string
          id?: string
          is_locked?: boolean
          is_visible?: boolean
          proposal_id: string
          sort_order?: number
          source_ref?: Json
          source_type?: Database["public"]["Enums"]["psa_block_source_type"]
          title?: string
          updated_at?: string
        }
        Update: {
          block_type?: Database["public"]["Enums"]["psa_block_type"]
          content_rich?: Json
          contract_relevance?: Database["public"]["Enums"]["psa_contract_relevance"]
          created_at?: string
          id?: string
          is_locked?: boolean
          is_visible?: boolean
          proposal_id?: string
          sort_order?: number
          source_ref?: Json
          source_type?: Database["public"]["Enums"]["psa_block_source_type"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "psa_proposal_blocks_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "psa_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      psa_proposal_signatures: {
        Row: {
          client_signed_at: string | null
          client_signer_email: string | null
          client_signer_name: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          docusign_envelope_id: string | null
          id: string
          proposal_id: string
          psa_signed_at: string | null
          psa_signer_email: string | null
          psa_signer_name: string | null
          sent_at: string
          signed_pdf_storage_path: string | null
          snapshot_id: string | null
          status: string
          status_note: string | null
          updated_at: string
        }
        Insert: {
          client_signed_at?: string | null
          client_signer_email?: string | null
          client_signer_name?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          docusign_envelope_id?: string | null
          id?: string
          proposal_id: string
          psa_signed_at?: string | null
          psa_signer_email?: string | null
          psa_signer_name?: string | null
          sent_at?: string
          signed_pdf_storage_path?: string | null
          snapshot_id?: string | null
          status?: string
          status_note?: string | null
          updated_at?: string
        }
        Update: {
          client_signed_at?: string | null
          client_signer_email?: string | null
          client_signer_name?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          docusign_envelope_id?: string | null
          id?: string
          proposal_id?: string
          psa_signed_at?: string | null
          psa_signer_email?: string | null
          psa_signer_name?: string | null
          sent_at?: string
          signed_pdf_storage_path?: string | null
          snapshot_id?: string | null
          status?: string
          status_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "psa_proposal_signatures_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "psa_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psa_proposal_signatures_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "psa_proposal_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      psa_proposal_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          label: string | null
          pdf_filename: string | null
          pdf_mime: string | null
          pdf_storage_path: string | null
          proposal_id: string
          reason: string | null
          restored_from_snapshot_id: string | null
          rev_number: number | null
          snapshot: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          label?: string | null
          pdf_filename?: string | null
          pdf_mime?: string | null
          pdf_storage_path?: string | null
          proposal_id: string
          reason?: string | null
          restored_from_snapshot_id?: string | null
          rev_number?: number | null
          snapshot: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          label?: string | null
          pdf_filename?: string | null
          pdf_mime?: string | null
          pdf_storage_path?: string | null
          proposal_id?: string
          reason?: string | null
          restored_from_snapshot_id?: string | null
          rev_number?: number | null
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "psa_proposal_snapshots_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "psa_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psa_proposal_snapshots_restored_from_snapshot_id_fkey"
            columns: ["restored_from_snapshot_id"]
            isOneToOne: false
            referencedRelation: "psa_proposal_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      psa_proposals: {
        Row: {
          client_snapshot: Json
          created_at: string
          created_by: string | null
          id: string
          language: string
          locked_at: string | null
          outcome: string | null
          project_snapshot: Json
          quote_id: string | null
          restored_from_snapshot_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["psa_proposal_status"]
          style_settings: Json
          title: string
          updated_at: string
          vat_mode: string | null
        }
        Insert: {
          client_snapshot?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          language?: string
          locked_at?: string | null
          outcome?: string | null
          project_snapshot?: Json
          quote_id?: string | null
          restored_from_snapshot_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["psa_proposal_status"]
          style_settings?: Json
          title?: string
          updated_at?: string
          vat_mode?: string | null
        }
        Update: {
          client_snapshot?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          language?: string
          locked_at?: string | null
          outcome?: string | null
          project_snapshot?: Json
          quote_id?: string | null
          restored_from_snapshot_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["psa_proposal_status"]
          style_settings?: Json
          title?: string
          updated_at?: string
          vat_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "psa_proposals_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposal_values"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "psa_proposals_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psa_proposals_restored_from_snapshot_id_fkey"
            columns: ["restored_from_snapshot_id"]
            isOneToOne: false
            referencedRelation: "psa_proposal_snapshots"
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
            referencedRelation: "fee_proposal_values"
            referencedColumns: ["quote_id"]
          },
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
            foreignKeyName: "quote_allocations_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources_public"
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
      quote_billable_hourly_rates: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          quote_id: string
          role_name: string
          sale_rate: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          quote_id: string
          role_name?: string
          sale_rate?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          quote_id?: string
          role_name?: string
          sale_rate?: number
          updated_at?: string
        }
        Relationships: []
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
          supplier_company_id: string | null
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
          supplier_company_id?: string | null
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
          supplier_company_id?: string | null
          supplier_id?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_external_services_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposal_values"
            referencedColumns: ["quote_id"]
          },
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
            foreignKeyName: "quote_external_services_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          billing_status: Database["public"]["Enums"]["quote_invoice_billing_status"]
          created_at: string
          direction: string
          expected_invoice_date: string | null
          expected_payment_date: string | null
          generator_source: string | null
          id: string
          invoice_group_id: string | null
          label: string
          linked_payment_item_id: string | null
          manual_override: boolean
          notes: string | null
          payment_offset_days: number
          payment_terms: string | null
          quote_id: string
          sort_order: number
          stage_id: string | null
          supplier_company_id: string | null
          supplier_id: string | null
          supplier_label: string | null
          trigger_type: Database["public"]["Enums"]["quote_payment_trigger"]
          updated_at: string
          vat_rate: number
          vat_rate_override: boolean
        }
        Insert: {
          amount_type: Database["public"]["Enums"]["quote_payment_amount_type"]
          amount_value?: number
          billing_status?: Database["public"]["Enums"]["quote_invoice_billing_status"]
          created_at?: string
          direction?: string
          expected_invoice_date?: string | null
          expected_payment_date?: string | null
          generator_source?: string | null
          id?: string
          invoice_group_id?: string | null
          label: string
          linked_payment_item_id?: string | null
          manual_override?: boolean
          notes?: string | null
          payment_offset_days?: number
          payment_terms?: string | null
          quote_id: string
          sort_order?: number
          stage_id?: string | null
          supplier_company_id?: string | null
          supplier_id?: string | null
          supplier_label?: string | null
          trigger_type: Database["public"]["Enums"]["quote_payment_trigger"]
          updated_at?: string
          vat_rate?: number
          vat_rate_override?: boolean
        }
        Update: {
          amount_type?: Database["public"]["Enums"]["quote_payment_amount_type"]
          amount_value?: number
          billing_status?: Database["public"]["Enums"]["quote_invoice_billing_status"]
          created_at?: string
          direction?: string
          expected_invoice_date?: string | null
          expected_payment_date?: string | null
          generator_source?: string | null
          id?: string
          invoice_group_id?: string | null
          label?: string
          linked_payment_item_id?: string | null
          manual_override?: boolean
          notes?: string | null
          payment_offset_days?: number
          payment_terms?: string | null
          quote_id?: string
          sort_order?: number
          stage_id?: string | null
          supplier_company_id?: string | null
          supplier_id?: string | null
          supplier_label?: string | null
          trigger_type?: Database["public"]["Enums"]["quote_payment_trigger"]
          updated_at?: string
          vat_rate?: number
          vat_rate_override?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "quote_payment_schedule_items_linked_payment_item_id_fkey"
            columns: ["linked_payment_item_id"]
            isOneToOne: false
            referencedRelation: "quote_payment_schedule_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_payment_schedule_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposal_values"
            referencedColumns: ["quote_id"]
          },
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
          {
            foreignKeyName: "quote_payment_schedule_items_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_payment_schedule_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pm_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_payment_schedule_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pm_suppliers_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_proposal_document_blocks: {
        Row: {
          assembly_locked: string | null
          assembly_provenance: Json | null
          assembly_section_id: string | null
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
          assembly_locked?: string | null
          assembly_provenance?: Json | null
          assembly_section_id?: string | null
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
          assembly_locked?: string | null
          assembly_provenance?: Json | null
          assembly_section_id?: string | null
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
            referencedRelation: "fee_proposal_values"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "quote_proposal_documents_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_site_trips: {
        Row: {
          created_at: string
          display_mode: string
          duration_months_override: number | null
          frequency_mode: string
          frequency_value: number
          id: string
          km: number
          label: string
          notes: string | null
          price_per_km: number
          quote_id: string
          resource_hourly_rate: number
          resource_hourly_rates: Json
          resource_id: string | null
          resource_ids: string[]
          sort_order: number
          stage_id: string | null
          trip_hours: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_mode?: string
          duration_months_override?: number | null
          frequency_mode?: string
          frequency_value?: number
          id?: string
          km?: number
          label?: string
          notes?: string | null
          price_per_km?: number
          quote_id: string
          resource_hourly_rate?: number
          resource_hourly_rates?: Json
          resource_id?: string | null
          resource_ids?: string[]
          sort_order?: number
          stage_id?: string | null
          trip_hours?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_mode?: string
          duration_months_override?: number | null
          frequency_mode?: string
          frequency_value?: number
          id?: string
          km?: number
          label?: string
          notes?: string | null
          price_per_km?: number
          quote_id?: string
          resource_hourly_rate?: number
          resource_hourly_rates?: Json
          resource_id?: string | null
          resource_ids?: string[]
          sort_order?: number
          stage_id?: string | null
          trip_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_site_trips_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposal_values"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "quote_site_trips_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_site_trips_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_site_trips_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_site_trips_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "quote_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_stage_dependencies: {
        Row: {
          created_at: string
          generator_source: string | null
          id: string
          is_generated: boolean
          lag_days: number
          manual_override: boolean
          predecessor_stage_id: string
          quote_id: string
          successor_stage_id: string
          type: Database["public"]["Enums"]["quote_dep_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          generator_source?: string | null
          id?: string
          is_generated?: boolean
          lag_days?: number
          manual_override?: boolean
          predecessor_stage_id: string
          quote_id: string
          successor_stage_id: string
          type?: Database["public"]["Enums"]["quote_dep_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          generator_source?: string | null
          id?: string
          is_generated?: boolean
          lag_days?: number
          manual_override?: boolean
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
            referencedRelation: "fee_proposal_values"
            referencedColumns: ["quote_id"]
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
      quote_stage_supplier_costs: {
        Row: {
          amount: number
          billing_trigger: string
          created_at: string
          custom_date: string | null
          description: string | null
          id: string
          payment_offset_days: number | null
          payment_terms: string | null
          quote_id: string
          sort_order: number
          stage_id: string | null
          supplier_id: string | null
          supplier_label: string | null
          updated_at: string
          vat_rate: number | null
        }
        Insert: {
          amount?: number
          billing_trigger?: string
          created_at?: string
          custom_date?: string | null
          description?: string | null
          id?: string
          payment_offset_days?: number | null
          payment_terms?: string | null
          quote_id: string
          sort_order?: number
          stage_id?: string | null
          supplier_id?: string | null
          supplier_label?: string | null
          updated_at?: string
          vat_rate?: number | null
        }
        Update: {
          amount?: number
          billing_trigger?: string
          created_at?: string
          custom_date?: string | null
          description?: string | null
          id?: string
          payment_offset_days?: number | null
          payment_terms?: string | null
          quote_id?: string
          sort_order?: number
          stage_id?: string | null
          supplier_id?: string | null
          supplier_label?: string | null
          updated_at?: string
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_stage_supplier_costs_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposal_values"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "quote_stage_supplier_costs_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_stage_supplier_costs_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "quote_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_stage_supplier_costs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pm_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_stage_supplier_costs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pm_suppliers_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_stages: {
        Row: {
          addon_module_code: string | null
          archived_at: string | null
          bill_to_client: boolean
          billing_model: string
          budget: number
          budget_mode: string
          children_bill_independently: boolean
          color: string
          created_at: string
          date_mode: string
          description: string | null
          end_date: string
          external_id: string | null
          generator_source: string | null
          id: string
          is_fee_only: boolean
          is_generated: boolean
          is_milestone: boolean
          is_optional: boolean
          is_self: boolean
          linked_stage_id: string | null
          manual_override: boolean
          markup_pct: number
          name: string
          parent_stage_id: string | null
          phase_code: string | null
          phase_group: string
          quote_id: string
          retainer_anchor_month: string | null
          retainer_capacity_hours_per_month: number
          retainer_monthly_amount: number
          retainer_months: number | null
          retainer_review_months: number | null
          sale_source: string | null
          sort_order: number
          stage_billing_timing: string
          stage_kind: string
          stage_role: string
          start_date: string
          supplier_company_id: string | null
          supplier_id: string | null
          supplier_placeholder: string | null
          updated_at: string
        }
        Insert: {
          addon_module_code?: string | null
          archived_at?: string | null
          bill_to_client?: boolean
          billing_model?: string
          budget?: number
          budget_mode?: string
          children_bill_independently?: boolean
          color?: string
          created_at?: string
          date_mode?: string
          description?: string | null
          end_date: string
          external_id?: string | null
          generator_source?: string | null
          id?: string
          is_fee_only?: boolean
          is_generated?: boolean
          is_milestone?: boolean
          is_optional?: boolean
          is_self?: boolean
          linked_stage_id?: string | null
          manual_override?: boolean
          markup_pct?: number
          name: string
          parent_stage_id?: string | null
          phase_code?: string | null
          phase_group?: string
          quote_id: string
          retainer_anchor_month?: string | null
          retainer_capacity_hours_per_month?: number
          retainer_monthly_amount?: number
          retainer_months?: number | null
          retainer_review_months?: number | null
          sale_source?: string | null
          sort_order?: number
          stage_billing_timing?: string
          stage_kind?: string
          stage_role?: string
          start_date: string
          supplier_company_id?: string | null
          supplier_id?: string | null
          supplier_placeholder?: string | null
          updated_at?: string
        }
        Update: {
          addon_module_code?: string | null
          archived_at?: string | null
          bill_to_client?: boolean
          billing_model?: string
          budget?: number
          budget_mode?: string
          children_bill_independently?: boolean
          color?: string
          created_at?: string
          date_mode?: string
          description?: string | null
          end_date?: string
          external_id?: string | null
          generator_source?: string | null
          id?: string
          is_fee_only?: boolean
          is_generated?: boolean
          is_milestone?: boolean
          is_optional?: boolean
          is_self?: boolean
          linked_stage_id?: string | null
          manual_override?: boolean
          markup_pct?: number
          name?: string
          parent_stage_id?: string | null
          phase_code?: string | null
          phase_group?: string
          quote_id?: string
          retainer_anchor_month?: string | null
          retainer_capacity_hours_per_month?: number
          retainer_monthly_amount?: number
          retainer_months?: number | null
          retainer_review_months?: number | null
          sale_source?: string | null
          sort_order?: number
          stage_billing_timing?: string
          stage_kind?: string
          stage_role?: string
          start_date?: string
          supplier_company_id?: string | null
          supplier_id?: string | null
          supplier_placeholder?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_stages_addon_module_fk"
            columns: ["addon_module_code"]
            isOneToOne: false
            referencedRelation: "proposal_addon_modules"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "quote_stages_linked_stage_id_fkey"
            columns: ["linked_stage_id"]
            isOneToOne: false
            referencedRelation: "quote_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_stages_parent_stage_id_fkey"
            columns: ["parent_stage_id"]
            isOneToOne: false
            referencedRelation: "quote_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_stages_phase_code_fk"
            columns: ["phase_code"]
            isOneToOne: false
            referencedRelation: "proposal_phases"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "quote_stages_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposal_values"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "quote_stages_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_stages_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_stages_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pm_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_stages_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pm_suppliers_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_supplier_markups: {
        Row: {
          created_at: string
          id: string
          markup_pct: number
          quote_id: string
          supplier_company_id: string | null
          supplier_id: string | null
          supplier_label: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          markup_pct?: number
          quote_id: string
          supplier_company_id?: string | null
          supplier_id?: string | null
          supplier_label?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          markup_pct?: number
          quote_id?: string
          supplier_company_id?: string | null
          supplier_id?: string | null
          supplier_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_supplier_markups_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposal_values"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "quote_supplier_markups_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_supplier_markups_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_supplier_markups_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pm_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_supplier_markups_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "pm_suppliers_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_supplier_phase_splits: {
        Row: {
          created_at: string
          id: string
          linked_stage_id: string
          percent: number
          quote_id: string
          supplier_company_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          linked_stage_id: string
          percent?: number
          quote_id: string
          supplier_company_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          linked_stage_id?: string
          percent?: number
          quote_id?: string
          supplier_company_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_supplier_phase_splits_linked_stage_id_fkey"
            columns: ["linked_stage_id"]
            isOneToOne: false
            referencedRelation: "quote_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_supplier_phase_splits_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposal_values"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "quote_supplier_phase_splits_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_supplier_phase_splits_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_template_allocations: {
        Row: {
          created_at: string
          default_allocation_pct: number
          estimated_hours: number
          id: string
          notes: string | null
          resource_role: string | null
          stage_temp_key: string
          template_id: string
        }
        Insert: {
          created_at?: string
          default_allocation_pct?: number
          estimated_hours?: number
          id?: string
          notes?: string | null
          resource_role?: string | null
          stage_temp_key: string
          template_id: string
        }
        Update: {
          created_at?: string
          default_allocation_pct?: number
          estimated_hours?: number
          id?: string
          notes?: string | null
          resource_role?: string | null
          stage_temp_key?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_template_allocations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quote_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_template_blocks: {
        Row: {
          block_title: string
          block_type: Database["public"]["Enums"]["psa_block_type"] | null
          content_rich: Json | null
          contract_relevance:
            | Database["public"]["Enums"]["psa_contract_relevance"]
            | null
          created_at: string
          id: string
          proposal_block_id: string | null
          required: boolean
          sort_order: number
          source_ref: Json | null
          source_type:
            | Database["public"]["Enums"]["psa_block_source_type"]
            | null
          template_id: string
        }
        Insert: {
          block_title: string
          block_type?: Database["public"]["Enums"]["psa_block_type"] | null
          content_rich?: Json | null
          contract_relevance?:
            | Database["public"]["Enums"]["psa_contract_relevance"]
            | null
          created_at?: string
          id?: string
          proposal_block_id?: string | null
          required?: boolean
          sort_order?: number
          source_ref?: Json | null
          source_type?:
            | Database["public"]["Enums"]["psa_block_source_type"]
            | null
          template_id: string
        }
        Update: {
          block_title?: string
          block_type?: Database["public"]["Enums"]["psa_block_type"] | null
          content_rich?: Json | null
          contract_relevance?:
            | Database["public"]["Enums"]["psa_contract_relevance"]
            | null
          created_at?: string
          id?: string
          proposal_block_id?: string | null
          required?: boolean
          sort_order?: number
          source_ref?: Json | null
          source_type?:
            | Database["public"]["Enums"]["psa_block_source_type"]
            | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_template_blocks_proposal_block_id_fkey"
            columns: ["proposal_block_id"]
            isOneToOne: false
            referencedRelation: "proposal_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_template_blocks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quote_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_template_dependencies: {
        Row: {
          created_at: string
          dependency_type: Database["public"]["Enums"]["quote_dep_type"]
          id: string
          lag_days: number
          predecessor_stage_temp_key: string
          successor_stage_temp_key: string
          template_id: string
        }
        Insert: {
          created_at?: string
          dependency_type?: Database["public"]["Enums"]["quote_dep_type"]
          id?: string
          lag_days?: number
          predecessor_stage_temp_key: string
          successor_stage_temp_key: string
          template_id: string
        }
        Update: {
          created_at?: string
          dependency_type?: Database["public"]["Enums"]["quote_dep_type"]
          id?: string
          lag_days?: number
          predecessor_stage_temp_key?: string
          successor_stage_temp_key?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_template_dependencies_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quote_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_template_external_services: {
        Row: {
          created_at: string
          description: string
          id: string
          markup_type: Database["public"]["Enums"]["quote_markup_type"]
          markup_value: number
          quantity: number
          stage_temp_key: string | null
          supplier_type: string | null
          template_id: string
          unit_cost: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          markup_type?: Database["public"]["Enums"]["quote_markup_type"]
          markup_value?: number
          quantity?: number
          stage_temp_key?: string | null
          supplier_type?: string | null
          template_id: string
          unit_cost?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          markup_type?: Database["public"]["Enums"]["quote_markup_type"]
          markup_value?: number
          quantity?: number
          stage_temp_key?: string | null
          supplier_type?: string | null
          template_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_template_external_services_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quote_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_template_payment_rules: {
        Row: {
          amount_type: Database["public"]["Enums"]["quote_payment_amount_type"]
          amount_value: number
          created_at: string
          id: string
          label: string
          payment_terms_days: number
          sort_order: number
          stage_temp_key: string | null
          template_id: string
          trigger_type: Database["public"]["Enums"]["quote_payment_trigger"]
        }
        Insert: {
          amount_type?: Database["public"]["Enums"]["quote_payment_amount_type"]
          amount_value?: number
          created_at?: string
          id?: string
          label: string
          payment_terms_days?: number
          sort_order?: number
          stage_temp_key?: string | null
          template_id: string
          trigger_type: Database["public"]["Enums"]["quote_payment_trigger"]
        }
        Update: {
          amount_type?: Database["public"]["Enums"]["quote_payment_amount_type"]
          amount_value?: number
          created_at?: string
          id?: string
          label?: string
          payment_terms_days?: number
          sort_order?: number
          stage_temp_key?: string | null
          template_id?: string
          trigger_type?: Database["public"]["Enums"]["quote_payment_trigger"]
        }
        Relationships: [
          {
            foreignKeyName: "quote_template_payment_rules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quote_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_template_stages: {
        Row: {
          billing_trigger_default: Database["public"]["Enums"]["quote_payment_trigger"]
          color: string
          created_at: string
          default_hours: number
          duration_days: number
          fee_amount: number
          fee_percentage: number
          id: string
          sort_order: number
          stage_temp_key: string
          template_id: string
          title: string
          updated_at: string
        }
        Insert: {
          billing_trigger_default?: Database["public"]["Enums"]["quote_payment_trigger"]
          color?: string
          created_at?: string
          default_hours?: number
          duration_days?: number
          fee_amount?: number
          fee_percentage?: number
          id?: string
          sort_order?: number
          stage_temp_key: string
          template_id: string
          title: string
          updated_at?: string
        }
        Update: {
          billing_trigger_default?: Database["public"]["Enums"]["quote_payment_trigger"]
          color?: string
          created_at?: string
          default_hours?: number
          duration_days?: number
          fee_amount?: number
          fee_percentage?: number
          id?: string
          sort_order?: number
          stage_temp_key?: string
          template_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_template_stages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quote_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_templates: {
        Row: {
          category: Database["public"]["Enums"]["crm_quote_category"]
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          project_type: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["crm_quote_category"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          project_type?: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["crm_quote_category"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          project_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          module: string | null
          notes: string | null
          owner_user_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          module?: string | null
          notes?: string | null
          owner_user_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          module?: string | null
          notes?: string | null
          owner_user_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      remote_work_requests: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          collaborator_id: string
          created_at: string
          data: string
          estado: string
          id: string
          notas: string | null
          updated_at: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          collaborator_id: string
          created_at?: string
          data: string
          estado?: string
          id?: string
          notas?: string | null
          updated_at?: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          collaborator_id?: string
          created_at?: string
          data?: string
          estado?: string
          id?: string
          notas?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "remote_work_requests_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remote_work_requests_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators_directory"
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
          archived_at: string | null
          beneficio_carro: number
          beneficio_ticket: number
          beneficio_variavel: number
          collaborator_id: string
          created_at: string
          dependentes_com_deficiencia: number
          dias_uteis: number
          effective_from: string
          effective_to: string | null
          estado_civil: string
          id: string
          import_log_id: string | null
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
          passe_anual: number
          plano_reforma: number
          premio_associado: number
          project_cost_effective_from: string | null
          reference_date: string
          source: string
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
          archived_at?: string | null
          beneficio_carro?: number
          beneficio_ticket?: number
          beneficio_variavel?: number
          collaborator_id: string
          created_at?: string
          dependentes_com_deficiencia?: number
          dias_uteis?: number
          effective_from: string
          effective_to?: string | null
          estado_civil?: string
          id?: string
          import_log_id?: string | null
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
          passe_anual?: number
          plano_reforma?: number
          premio_associado?: number
          project_cost_effective_from?: string | null
          reference_date: string
          source?: string
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
          archived_at?: string | null
          beneficio_carro?: number
          beneficio_ticket?: number
          beneficio_variavel?: number
          collaborator_id?: string
          created_at?: string
          dependentes_com_deficiencia?: number
          dias_uteis?: number
          effective_from?: string
          effective_to?: string | null
          estado_civil?: string
          id?: string
          import_log_id?: string | null
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
          passe_anual?: number
          plano_reforma?: number
          premio_associado?: number
          project_cost_effective_from?: string | null
          reference_date?: string
          source?: string
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
          {
            foreignKeyName: "salary_snapshots_import_log_id_fkey"
            columns: ["import_log_id"]
            isOneToOne: false
            referencedRelation: "financial_import_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_withholdings: {
        Row: {
          amount: number
          created_at: string
          currency: string
          document_number: string | null
          filed_at: string | null
          filed_by: string | null
          financial_document_id: string
          id: string
          issue_date: string
          notes: string | null
          period: string
          status: string
          supplier_company_id: string | null
          supplier_name_snapshot: string | null
          tax_kind: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          document_number?: string | null
          filed_at?: string | null
          filed_by?: string | null
          financial_document_id: string
          id?: string
          issue_date: string
          notes?: string | null
          period: string
          status?: string
          supplier_company_id?: string | null
          supplier_name_snapshot?: string | null
          tax_kind?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          document_number?: string | null
          filed_at?: string | null
          filed_by?: string | null
          financial_document_id?: string
          id?: string
          issue_date?: string
          notes?: string | null
          period?: string
          status?: string
          supplier_company_id?: string | null
          supplier_name_snapshot?: string | null
          tax_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_withholdings_financial_document_id_fkey"
            columns: ["financial_document_id"]
            isOneToOne: true
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_withholdings_supplier_company_id_fkey"
            columns: ["supplier_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          retired_at: string | null
          scope: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted?: boolean
          id?: string
          permission_key: string
          retired_at?: string | null
          scope?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          id?: string
          permission_key?: string
          retired_at?: string | null
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      user_role_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          notes: string | null
          role: Database["public"]["Enums"]["pm_role"]
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          notes?: string | null
          role: Database["public"]["Enums"]["pm_role"]
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
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
          horas: number | null
          id: string
          notas: string | null
          periodo: string
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
          horas?: number | null
          id?: string
          notas?: string | null
          periodo?: string
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
          horas?: number | null
          id?: string
          notas?: string | null
          periodo?: string
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
      benefit_expenses_v: {
        Row: {
          ano_fiscal: number | null
          aprovado_em: string | null
          aprovado_por: string | null
          categoria: Database["public"]["Enums"]["benefit_category"] | null
          category_code: string | null
          category_id: string | null
          category_label_en: string | null
          category_label_pt: string | null
          collaborator_id: string | null
          created_at: string | null
          data_despesa: string | null
          descricao: string | null
          estado: Database["public"]["Enums"]["expense_status"] | null
          finance_due_date: string | null
          finance_item_id: string | null
          finance_paid_date: string | null
          finance_period_id: string | null
          finance_status:
            | Database["public"]["Enums"]["financial_expense_status"]
            | null
          foto_path: string | null
          id: string | null
          notas_aprovacao: string | null
          notas_colaborador: string | null
          pago_em: string | null
          pago_por: string | null
          updated_at: string | null
          valor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "benefit_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "benefit_categories"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "financial_expense_items_period_id_fkey"
            columns: ["finance_period_id"]
            isOneToOne: false
            referencedRelation: "financial_period_totals"
            referencedColumns: ["period_id"]
          },
          {
            foreignKeyName: "financial_expense_items_period_id_fkey"
            columns: ["finance_period_id"]
            isOneToOne: false
            referencedRelation: "financial_periods"
            referencedColumns: ["id"]
          },
        ]
      }
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
          target_chargeability_pct: number | null
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
          target_chargeability_pct?: number | null
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
          target_chargeability_pct?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      fee_proposal_values: {
        Row: {
          archived_at: string | null
          deleted_at: string | null
          opportunity_id: string | null
          quote_id: string | null
          resolved_value: number | null
        }
        Insert: {
          archived_at?: string | null
          deleted_at?: string | null
          opportunity_id?: string | null
          quote_id?: string | null
          resolved_value?: never
        }
        Update: {
          archived_at?: string | null
          deleted_at?: string | null
          opportunity_id?: string | null
          quote_id?: string | null
          resolved_value?: never
        }
        Relationships: [
          {
            foreignKeyName: "fee_proposals_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "crm_opportunities"
            referencedColumns: ["id"]
          },
        ]
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
      inventory_line_processing: {
        Row: {
          document_id: string | null
          line_id: string | null
          max_unit_index: number | null
          quantity_processed: number | null
          quantity_remaining: number | null
          quantity_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_document_lines_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "financial_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_resources_public: {
        Row: {
          active: boolean | null
          collaborator_id: string | null
          color: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string | null
          name: string | null
          notes: string | null
          phone: string | null
          rate_effective_from: string | null
          role: string | null
          team: string | null
          updated_at: string | null
          weekly_capacity: number | null
        }
        Insert: {
          active?: boolean | null
          collaborator_id?: string | null
          color?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          rate_effective_from?: string | null
          role?: string | null
          team?: string | null
          updated_at?: string | null
          weekly_capacity?: number | null
        }
        Update: {
          active?: boolean | null
          collaborator_id?: string | null
          color?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          rate_effective_from?: string | null
          role?: string | null
          team?: string | null
          updated_at?: string | null
          weekly_capacity?: number | null
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
      quote_allocations_public: {
        Row: {
          allocation_percentage: number | null
          created_at: string | null
          end_date: string | null
          hours_per_day: number | null
          id: string | null
          notes: string | null
          quote_id: string | null
          resource_id: string | null
          stage_id: string | null
          start_date: string | null
          updated_at: string | null
        }
        Insert: {
          allocation_percentage?: number | null
          created_at?: string | null
          end_date?: string | null
          hours_per_day?: number | null
          id?: string | null
          notes?: string | null
          quote_id?: string | null
          resource_id?: string | null
          stage_id?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Update: {
          allocation_percentage?: number | null
          created_at?: string | null
          end_date?: string | null
          hours_per_day?: number | null
          id?: string | null
          notes?: string | null
          quote_id?: string | null
          resource_id?: string | null
          stage_id?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_allocations_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "fee_proposal_values"
            referencedColumns: ["quote_id"]
          },
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
            foreignKeyName: "quote_allocations_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "pm_resources_public"
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
    }
    Functions: {
      allocate_inventory_code: {
        Args: { _category_code: string }
        Returns: string
      }
      allocate_proposal_number: { Args: { p_date?: string }; Returns: string }
      backfill_quote_from_project: {
        Args: { _project_id: string }
        Returns: string
      }
      bank_account_calculated_balance: {
        Args: { _account_id: string; _as_of?: string }
        Returns: number
      }
      bank_calculated_balances: {
        Args: { _as_of?: string }
        Returns: {
          bank_account_id: string
          calculated_balance: number
          opening_balance: number
          reconciled_count: number
          reconciled_total: number
        }[]
      }
      bank_import_move_account: {
        Args: { _import_id: string; _new_account_id: string }
        Returns: Json
      }
      bank_import_undo: {
        Args: { _force?: boolean; _import_id: string; _reason?: string }
        Returns: Json
      }
      bank_statement_period_status: {
        Args: { _account_id?: string }
        Returns: {
          bank_account_id: string
          computed_closing: number
          declared_closing: number
          difference: number
          opening_balance: number
          period_end_date: string
          period_id: string
          period_start_date: string
          reconciled_count: number
          reconciled_total: number
          statement_number: string
          tx_count: number
        }[]
      }
      bank_tx_unreconcile: { Args: { _tx_id: string }; Returns: undefined }
      benefit_category_from_legacy: {
        Args: { _legacy: Database["public"]["Enums"]["benefit_category"] }
        Returns: string
      }
      benefit_expense_cancel_finance_link: {
        Args: { p_expense_id: string }
        Returns: string
      }
      benefit_expense_finance_backfill_preview: { Args: never; Returns: Json }
      benefit_expense_finance_backfill_run: { Args: never; Returns: Json }
      benefit_expense_link_to_finance: {
        Args: { p_expense_id: string }
        Returns: string
      }
      benefit_expense_set_status: {
        Args: {
          _expense_id: string
          _notes?: string
          _to_status: Database["public"]["Enums"]["expense_status"]
        }
        Returns: {
          amount_ex_vat: number | null
          ano_fiscal: number
          aprovado_em: string | null
          aprovado_por: string | null
          bank_transaction_id: string | null
          categoria: Database["public"]["Enums"]["benefit_category"]
          category_id: string | null
          classification_id: string | null
          collaborator_id: string
          created_at: string
          data_despesa: string
          descricao: string
          document_number: string | null
          estado: Database["public"]["Enums"]["expense_status"]
          financial_document_id: string | null
          foto_path: string | null
          id: string
          notas_aprovacao: string | null
          notas_colaborador: string | null
          ocr_extraction_id: string | null
          origin: string
          pago_em: string | null
          pago_por: string | null
          payment_account_id: string | null
          payment_source_label: string | null
          payment_source_type: string | null
          supplier_company_id: string | null
          supplier_name_snapshot: string | null
          supplier_nif: string | null
          updated_at: string
          valor: number
          vat_amount: number | null
          vat_rate: number | null
        }
        SetofOptions: {
          from: "*"
          to: "benefit_expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      build_fee_proposal_snapshot: {
        Args: { _proposal_id: string }
        Returns: Json
      }
      can_approve_benefits: { Args: { _user_id: string }; Returns: boolean }
      clone_fee_proposal_as_revision: {
        Args: { p_source: string }
        Returns: string
      }
      clone_fee_proposal_as_revision_impl: {
        Args: { p_source: string }
        Returns: string
      }
      delete_project_hard:
        | { Args: { _confirm: string; _project_id: string }; Returns: Json }
        | {
            Args: { _cascade?: boolean; _confirm: string; _project_id: string }
            Returns: Json
          }
      ensure_project_has_quote: {
        Args: { _project_id: string }
        Returns: string
      }
      fee_proposal_resolved_value: {
        Args: { _quote_id: string }
        Returns: number
      }
      finance_delete_unused_supplier_companies: {
        Args: { _confirm: string }
        Returns: Json
      }
      finance_inconsistency_report: { Args: never; Returns: Json }
      finance_mark_benefit_paid: {
        Args: { p_finance_item_id: string }
        Returns: string
      }
      finance_reset_test_data: { Args: { _confirm: string }; Returns: Json }
      finance_settle_expense: {
        Args: {
          p_amount: number
          p_bank_transaction_id: string
          p_expense_item_id: string
          p_payment_date: string
        }
        Returns: string
      }
      financial_expense_payment_backfill_preview: { Args: never; Returns: Json }
      financial_expense_payment_backfill_run: { Args: never; Returns: Json }
      get_my_collaborator_id: { Args: never; Returns: string }
      get_reimbursement_supplier_id: { Args: never; Returns: string }
      get_user_id_for_collaborator: {
        Args: { p_collaborator_id: string }
        Returns: string
      }
      hard_purge_fee_proposal: {
        Args: { _note?: string; _proposal_id: string }
        Returns: undefined
      }
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
      hr_dashboard_alerts_finance: { Args: never; Returns: Json }
      import_financial_data: {
        Args: {
          p_bank_accounts?: Json
          p_clients?: Json
          p_debts?: Json
          p_expenses?: Json
          p_file_checksum: string
          p_file_name: string
          p_import_type: string
          p_income?: Json
          p_notes?: string
          p_periods?: Json
          p_source_file_size_bytes?: number
          p_suppliers?: Json
        }
        Returns: Json
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      list_collaborators_basic: {
        Args: never
        Returns: {
          archived_at: string
          foto_path: string
          id: string
          nome: string
        }[]
      }
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
          pending: boolean
          permissions: string[]
          user_id: string
        }[]
      }
      list_users_with_role_v2: {
        Args: never
        Returns: {
          assigned_roles: Database["public"]["Enums"]["pm_role"][]
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
      notify_user: {
        Args: {
          _body?: string
          _dedupe_key?: string
          _entity_id?: string
          _entity_type?: string
          _kind: string
          _link_path?: string
          _module?: string
          _reminder_id?: string
          _title: string
          _user_id: string
        }
        Returns: string
      }
      pm_assigned_project_ids: {
        Args: { _user_id: string }
        Returns: {
          project_id: string
        }[]
      }
      pm_can_approve_hours:
        | { Args: { _user_id: string }; Returns: boolean }
        | {
            Args: { _target_user_id: string; _user_id: string }
            Returns: boolean
          }
      pm_can_view_projects: { Args: { _user_id: string }; Returns: boolean }
      pm_get_my_resource_id: { Args: never; Returns: string }
      pm_has_assigned_access: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      pm_has_team_access: {
        Args: { _target_user_id: string; _user_id: string }
        Returns: boolean
      }
      pm_is_retainer_stage: { Args: { _stage_id: string }; Returns: boolean }
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
      pm_project_has_retainer: {
        Args: { _project_id: string }
        Returns: boolean
      }
      pm_project_stage_hours: {
        Args: { p_project_id: string }
        Returns: {
          billable_hours: number
          hours: number
          month: string
          non_billable_hours: number
          stage_id: string
        }[]
      }
      pm_resource_id_for_user: { Args: { _user_id: string }; Returns: string }
      pm_resource_map_for_users: {
        Args: { _user_ids: string[] }
        Returns: {
          cost_rate: number
          name: string
          resource_id: string
          sale_rate: number
          user_id: string
        }[]
      }
      pm_team_resource_ids: {
        Args: { _user_id: string }
        Returns: {
          resource_id: string
        }[]
      }
      pm_team_user_ids: {
        Args: { _user_id: string }
        Returns: {
          user_id: string
        }[]
      }
      project_dependency_counts: {
        Args: { _project_id: string }
        Returns: Json
      }
      psa_import_template_blocks: {
        Args: { _proposal_id: string; _template_id: string }
        Returns: number
      }
      psa_next_rev_number: { Args: { _proposal_id: string }; Returns: number }
      psa_restore_revision: { Args: { _snapshot_id: string }; Returns: string }
      quote_instantiate_template: {
        Args: {
          _base_start_date?: string
          _quote_id: string
          _template_id: string
        }
        Returns: Json
      }
      quote_save_as_template: {
        Args: {
          _category: Database["public"]["Enums"]["crm_quote_category"]
          _description: string
          _name: string
          _project_type: string
          _quote_id: string
        }
        Returns: string
      }
      quote_unlock_for_revision: {
        Args: { _quote_id: string }
        Returns: undefined
      }
      reminders_promote_due: { Args: never; Returns: number }
      remove_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["pm_role"]
          _user_id: string
        }
        Returns: undefined
      }
      reset_project_test_data: { Args: { _confirm: string }; Returns: Json }
      restore_fee_proposal: {
        Args: { _proposal_id: string }
        Returns: undefined
      }
      set_pending_permission: {
        Args: { _email: string; _granted: boolean; _key: string }
        Returns: undefined
      }
      set_snapshot_in_force: {
        Args: { p_from: string; p_snapshot_id: string }
        Returns: undefined
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
      set_user_roles: {
        Args: {
          _roles: Database["public"]["Enums"]["pm_role"][]
          _user_id: string
        }
        Returns: undefined
      }
      soft_delete_fee_proposal: {
        Args: { _note?: string; _proposal_id: string }
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
      backup_status: "running" | "success" | "failed"
      backup_trigger: "daily" | "weekly" | "manual"
      bank_account_kind: "bank" | "credit_card" | "benefits" | "other"
      bank_import_status: "pending" | "imported" | "rolled_back" | "archived"
      bank_rule_match_type:
        | "contains"
        | "starts_with"
        | "ends_with"
        | "equals"
        | "regex"
      bank_tx_status:
        | "unclassified"
        | "classified"
        | "ignored"
        | "internal_transfer"
        | "archived"
      benefit_category: "carro" | "ticket" | "premio" | "outros"
      benefit_drive_sync_status:
        | "pending"
        | "synced"
        | "failed"
        | "skipped_rejected"
      company_relationship_type:
        | "client"
        | "supplier"
        | "both"
        | "uncategorized"
      company_status: "activo" | "prospecto" | "inactivo"
      contract_kind:
        | "standalone"
        | "umbrella"
        | "sub_contract"
        | "retainer"
        | "addendum"
      contract_status: "draft" | "issued" | "signed" | "superseded" | "void"
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
      email_rule_action: "archive" | "label_only" | "trash"
      email_rule_match: "exact_address" | "domain"
      expense_status: "pendente" | "aprovada" | "rejeitada" | "paga"
      fdrq_direction: "issued" | "received" | "unclear"
      fdrq_doc_type:
        | "invoice"
        | "receipt"
        | "proof_of_payment"
        | "unknown"
        | "bank_statement"
      fdrq_source: "manual_upload" | "email_ingestion" | "drive_folder"
      fdrq_status: "pending_review" | "approved" | "rejected"
      fdrq_supplier_match: "matched" | "no_match" | "ambiguous"
      financial_class_level: "category" | "group" | "subgroup"
      financial_debt_payment_status: "planned" | "paid" | "overdue" | "skipped"
      financial_debt_status: "open" | "partially_paid" | "paid" | "renegotiated"
      financial_doc_direction: "issued" | "received"
      financial_doc_source: "manual" | "project" | "import" | "ocr"
      financial_doc_status:
        | "draft"
        | "issued"
        | "partially_paid"
        | "paid"
        | "cancelled"
      financial_doc_type:
        | "client_invoice"
        | "client_credit_note"
        | "supplier_invoice"
        | "supplier_credit_note"
        | "receipt"
        | "other"
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
      financial_nature:
        | "operational"
        | "project_cost"
        | "payroll"
        | "tax"
        | "financing"
        | "transfer"
        | "income"
      financial_payment_method:
        | "bank_transfer"
        | "cash"
        | "card"
        | "direct_debit"
        | "other"
      financial_period_status: "projected" | "active" | "validated" | "closed"
      financial_spending_policy: "mandatory" | "discretionary" | "pass_through"
      import_job_status:
        | "uploaded"
        | "previewed"
        | "validated"
        | "imported"
        | "failed"
      import_row_status:
        | "pending"
        | "valid"
        | "warning"
        | "error"
        | "imported"
        | "skipped"
      import_type: "accelo_activity_timesheet" | "companies_clients_suppliers"
      inventory_asset_status:
        | "available"
        | "in_use"
        | "spare"
        | "repair"
        | "retired"
        | "lost"
        | "disposed"
      inventory_custody_mode: "person" | "shared" | "location"
      inventory_event_type:
        | "purchased"
        | "created"
        | "assigned"
        | "returned"
        | "reassigned"
        | "status_change"
        | "repair"
        | "retired"
        | "disposed"
        | "updated"
        | "note"
      inventory_tracking_level: "major" | "standard" | "accessory"
      inventory_workflow_status: "pending" | "partially_processed" | "complete"
      opportunity_activity_type: "call" | "email" | "meeting" | "note"
      pm_allocation_placeholder_source:
        | "ontology_default"
        | "quote_snapshot"
        | "manual"
      pm_allocation_status: "tentative" | "committed"
      pm_capacity_risk_level: "low" | "medium" | "high"
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
      pm_forecast_allocation_source: "manual" | "imported" | "derived"
      pm_invoice_status: "draft" | "sent" | "paid" | "overdue" | "cancelled"
      pm_markup_type: "percent" | "fixed"
      pm_project_note_category:
        | "client_request"
        | "todo"
        | "issue_risk"
        | "decision_fact"
        | "project"
        | "engineering"
        | "status"
        | "other"
      pm_project_note_source: "voice" | "typed"
      pm_project_status: "active" | "paused" | "closing" | "archived"
      pm_project_team_role: "manager" | "coordinator" | "co_author" | "support"
      pm_role:
        | "admin"
        | "partner"
        | "project_lead"
        | "architect"
        | "hr"
        | "finance"
      pm_sync_status: "live" | "paused" | "diverged"
      pm_task_status: "pending" | "active" | "paused" | "done"
      pm_time_entry_approval_status: "pending" | "approved" | "rejected"
      pm_time_entry_type: "project" | "internal" | "non_working" | "retainer"
      project_bootstrap_status: "preview" | "applied" | "failed" | "void"
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
      psa_block_source_type:
        | "manual"
        | "library"
        | "live_quote"
        | "mixed"
        | "contract_clause"
      psa_block_type:
        | "cover"
        | "index"
        | "about"
        | "scope"
        | "stage_list"
        | "stage_item"
        | "timeline"
        | "consultants"
        | "fee_table"
        | "construction_fee"
        | "payment_terms"
        | "payment_schedule"
        | "additional_services"
        | "general"
        | "suspension"
        | "exclusions"
        | "acceptance"
        | "custom_text"
        | "page_break"
        | "gantt_design"
        | "gantt_construction"
        | "supplier_fee_table"
        | "optional_fee_table"
        | "appendix_index"
        | "appendix_payment_schedule"
        | "appendix_gantt"
        | "appendix_general_terms"
        | "travel_expenses"
        | "gantt_partial"
        | "billable_hourly_rate"
        | "image"
      psa_contract_relevance:
        | "proposal_only"
        | "contract_relevant"
        | "both"
        | "internal_only"
      psa_proposal_status:
        | "draft"
        | "review"
        | "sent"
        | "accepted"
        | "declined"
        | "archived"
      quote_dep_type: "FS" | "SS" | "FF" | "SF"
      quote_external_service_status:
        | "draft"
        | "pending"
        | "invoiced"
        | "paid"
        | "cancelled"
      quote_invoice_billing_status: "planned" | "issued" | "paid" | "cancelled"
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
      resource_classification: "project" | "backoffice" | "hybrid"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      backup_status: ["running", "success", "failed"],
      backup_trigger: ["daily", "weekly", "manual"],
      bank_account_kind: ["bank", "credit_card", "benefits", "other"],
      bank_import_status: ["pending", "imported", "rolled_back", "archived"],
      bank_rule_match_type: [
        "contains",
        "starts_with",
        "ends_with",
        "equals",
        "regex",
      ],
      bank_tx_status: [
        "unclassified",
        "classified",
        "ignored",
        "internal_transfer",
        "archived",
      ],
      benefit_category: ["carro", "ticket", "premio", "outros"],
      benefit_drive_sync_status: [
        "pending",
        "synced",
        "failed",
        "skipped_rejected",
      ],
      company_relationship_type: [
        "client",
        "supplier",
        "both",
        "uncategorized",
      ],
      company_status: ["activo", "prospecto", "inactivo"],
      contract_kind: [
        "standalone",
        "umbrella",
        "sub_contract",
        "retainer",
        "addendum",
      ],
      contract_status: ["draft", "issued", "signed", "superseded", "void"],
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
      email_rule_action: ["archive", "label_only", "trash"],
      email_rule_match: ["exact_address", "domain"],
      expense_status: ["pendente", "aprovada", "rejeitada", "paga"],
      fdrq_direction: ["issued", "received", "unclear"],
      fdrq_doc_type: [
        "invoice",
        "receipt",
        "proof_of_payment",
        "unknown",
        "bank_statement",
      ],
      fdrq_source: ["manual_upload", "email_ingestion", "drive_folder"],
      fdrq_status: ["pending_review", "approved", "rejected"],
      fdrq_supplier_match: ["matched", "no_match", "ambiguous"],
      financial_class_level: ["category", "group", "subgroup"],
      financial_debt_payment_status: ["planned", "paid", "overdue", "skipped"],
      financial_debt_status: ["open", "partially_paid", "paid", "renegotiated"],
      financial_doc_direction: ["issued", "received"],
      financial_doc_source: ["manual", "project", "import", "ocr"],
      financial_doc_status: [
        "draft",
        "issued",
        "partially_paid",
        "paid",
        "cancelled",
      ],
      financial_doc_type: [
        "client_invoice",
        "client_credit_note",
        "supplier_invoice",
        "supplier_credit_note",
        "receipt",
        "other",
      ],
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
      financial_nature: [
        "operational",
        "project_cost",
        "payroll",
        "tax",
        "financing",
        "transfer",
        "income",
      ],
      financial_payment_method: [
        "bank_transfer",
        "cash",
        "card",
        "direct_debit",
        "other",
      ],
      financial_period_status: ["projected", "active", "validated", "closed"],
      financial_spending_policy: ["mandatory", "discretionary", "pass_through"],
      import_job_status: [
        "uploaded",
        "previewed",
        "validated",
        "imported",
        "failed",
      ],
      import_row_status: [
        "pending",
        "valid",
        "warning",
        "error",
        "imported",
        "skipped",
      ],
      import_type: ["accelo_activity_timesheet", "companies_clients_suppliers"],
      inventory_asset_status: [
        "available",
        "in_use",
        "spare",
        "repair",
        "retired",
        "lost",
        "disposed",
      ],
      inventory_custody_mode: ["person", "shared", "location"],
      inventory_event_type: [
        "purchased",
        "created",
        "assigned",
        "returned",
        "reassigned",
        "status_change",
        "repair",
        "retired",
        "disposed",
        "updated",
        "note",
      ],
      inventory_tracking_level: ["major", "standard", "accessory"],
      inventory_workflow_status: ["pending", "partially_processed", "complete"],
      opportunity_activity_type: ["call", "email", "meeting", "note"],
      pm_allocation_placeholder_source: [
        "ontology_default",
        "quote_snapshot",
        "manual",
      ],
      pm_allocation_status: ["tentative", "committed"],
      pm_capacity_risk_level: ["low", "medium", "high"],
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
      pm_forecast_allocation_source: ["manual", "imported", "derived"],
      pm_invoice_status: ["draft", "sent", "paid", "overdue", "cancelled"],
      pm_markup_type: ["percent", "fixed"],
      pm_project_note_category: [
        "client_request",
        "todo",
        "issue_risk",
        "decision_fact",
        "project",
        "engineering",
        "status",
        "other",
      ],
      pm_project_note_source: ["voice", "typed"],
      pm_project_status: ["active", "paused", "closing", "archived"],
      pm_project_team_role: ["manager", "coordinator", "co_author", "support"],
      pm_role: [
        "admin",
        "partner",
        "project_lead",
        "architect",
        "hr",
        "finance",
      ],
      pm_sync_status: ["live", "paused", "diverged"],
      pm_task_status: ["pending", "active", "paused", "done"],
      pm_time_entry_approval_status: ["pending", "approved", "rejected"],
      pm_time_entry_type: ["project", "internal", "non_working", "retainer"],
      project_bootstrap_status: ["preview", "applied", "failed", "void"],
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
      psa_block_source_type: [
        "manual",
        "library",
        "live_quote",
        "mixed",
        "contract_clause",
      ],
      psa_block_type: [
        "cover",
        "index",
        "about",
        "scope",
        "stage_list",
        "stage_item",
        "timeline",
        "consultants",
        "fee_table",
        "construction_fee",
        "payment_terms",
        "payment_schedule",
        "additional_services",
        "general",
        "suspension",
        "exclusions",
        "acceptance",
        "custom_text",
        "page_break",
        "gantt_design",
        "gantt_construction",
        "supplier_fee_table",
        "optional_fee_table",
        "appendix_index",
        "appendix_payment_schedule",
        "appendix_gantt",
        "appendix_general_terms",
        "travel_expenses",
        "gantt_partial",
        "billable_hourly_rate",
        "image",
      ],
      psa_contract_relevance: [
        "proposal_only",
        "contract_relevant",
        "both",
        "internal_only",
      ],
      psa_proposal_status: [
        "draft",
        "review",
        "sent",
        "accepted",
        "declined",
        "archived",
      ],
      quote_dep_type: ["FS", "SS", "FF", "SF"],
      quote_external_service_status: [
        "draft",
        "pending",
        "invoiced",
        "paid",
        "cancelled",
      ],
      quote_invoice_billing_status: ["planned", "issued", "paid", "cancelled"],
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
      resource_classification: ["project", "backoffice", "hybrid"],
      subsidios_modo: ["tradicional", "duodecimos_50", "duodecimos_100"],
    },
  },
} as const
