export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      access_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          last_used_at: string | null
          last_used_ip: unknown
          name: string
          project_restrictions: string[] | null
          revoked_at: string | null
          revoked_reason: string | null
          scopes: Database["public"]["Enums"]["token_scope"][]
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          last_used_ip?: unknown
          name: string
          project_restrictions?: string[] | null
          revoked_at?: string | null
          revoked_reason?: string | null
          scopes?: Database["public"]["Enums"]["token_scope"][]
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          last_used_ip?: unknown
          name?: string
          project_restrictions?: string[] | null
          revoked_at?: string | null
          revoked_reason?: string | null
          scopes?: Database["public"]["Enums"]["token_scope"][]
          token_hash?: string
          token_prefix?: string
          user_id?: string
        }
        Relationships: []
      }
      activity: {
        Row: {
          action: Database["public"]["Enums"]["activity_action"]
          actor_id: string | null
          actor_token_id: string | null
          actor_tool_id: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
          space_id: string | null
          terminal_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["activity_action"]
          actor_id?: string | null
          actor_token_id?: string | null
          actor_tool_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          space_id?: string | null
          terminal_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["activity_action"]
          actor_id?: string | null
          actor_token_id?: string | null
          actor_tool_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          space_id?: string | null
          terminal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notes: {
        Row: {
          author_user_id: string
          body: string
          created_at: string
          id: string
          target_user_id: string
        }
        Insert: {
          author_user_id: string
          body: string
          created_at?: string
          id?: string
          target_user_id: string
        }
        Update: {
          author_user_id?: string
          body?: string
          created_at?: string
          id?: string
          target_user_id?: string
        }
        Relationships: []
      }
      announcement_dismissals: {
        Row: {
          announcement_id: string
          dismissed_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          dismissed_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          dismissed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_dismissals_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: string
          audience_space_id: string | null
          body: string
          created_at: string
          created_by: string | null
          dismissible: boolean
          ends_at: string | null
          id: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          audience?: string
          audience_space_id?: string | null
          body: string
          created_at?: string
          created_by?: string | null
          dismissible?: boolean
          ends_at?: string | null
          id?: string
          starts_at?: string
          updated_at?: string
        }
        Update: {
          audience?: string
          audience_space_id?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          dismissible?: boolean
          ends_at?: string | null
          id?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_audience_space_id_fkey"
            columns: ["audience_space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          ciphertext: string
          created_at: string
          id: string
          iv: string
          key_hint: string
          last_used_at: string | null
          provider: string
          tag: string
          user_id: string
          wrapped_dek: string
        }
        Insert: {
          ciphertext: string
          created_at?: string
          id?: string
          iv: string
          key_hint: string
          last_used_at?: string | null
          provider: string
          tag: string
          user_id: string
          wrapped_dek: string
        }
        Update: {
          ciphertext?: string
          created_at?: string
          id?: string
          iv?: string
          key_hint?: string
          last_used_at?: string | null
          provider?: string
          tag?: string
          user_id?: string
          wrapped_dek?: string
        }
        Relationships: []
      }
      approvals: {
        Row: {
          approver_space_id: string | null
          approver_terminal_id: string | null
          approver_user_id: string | null
          context: Json
          expires_at: string
          id: string
          note: string | null
          requested_at: string
          requester_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["approval_status"]
          subject_id: string
          subject_type: string
          type: string
        }
        Insert: {
          approver_space_id?: string | null
          approver_terminal_id?: string | null
          approver_user_id?: string | null
          context?: Json
          expires_at?: string
          id?: string
          note?: string | null
          requested_at?: string
          requester_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          subject_id: string
          subject_type: string
          type: string
        }
        Update: {
          approver_space_id?: string | null
          approver_terminal_id?: string | null
          approver_user_id?: string | null
          context?: Json
          expires_at?: string
          id?: string
          note?: string | null
          requested_at?: string
          requester_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          subject_id?: string
          subject_type?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_approver_org_id_fkey"
            columns: ["approver_space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_approver_project_id_fkey"
            columns: ["approver_terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_items: {
        Row: {
          amount_cents: number
          category: string
          created_at: string
          created_by: string
          currency: string
          description: string | null
          id: string
          incurred_on: string | null
          metadata: Json
          status: string
          terminal_id: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          amount_cents: number
          category: string
          created_at?: string
          created_by: string
          currency?: string
          description?: string | null
          id?: string
          incurred_on?: string | null
          metadata?: Json
          status?: string
          terminal_id: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          amount_cents?: number
          category?: string
          created_at?: string
          created_by?: string
          currency?: string
          description?: string | null
          id?: string
          incurred_on?: string | null
          metadata?: Json
          status?: string
          terminal_id?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_connections: {
        Row: {
          access_token_ciphertext: string
          access_token_expires_at: string | null
          access_token_iv: string
          access_token_tag: string
          account_email: string
          allow_write: boolean
          created_at: string
          external_account_id: string | null
          id: string
          last_sync_at: string | null
          last_sync_error: string | null
          provider: string
          refresh_token_ciphertext: string | null
          refresh_token_iv: string | null
          refresh_token_tag: string | null
          revoked_at: string | null
          scopes: string[]
          user_id: string
          write_calendar_id: string | null
        }
        Insert: {
          access_token_ciphertext: string
          access_token_expires_at?: string | null
          access_token_iv: string
          access_token_tag: string
          account_email: string
          allow_write?: boolean
          created_at?: string
          external_account_id?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          provider: string
          refresh_token_ciphertext?: string | null
          refresh_token_iv?: string | null
          refresh_token_tag?: string | null
          revoked_at?: string | null
          scopes?: string[]
          user_id: string
          write_calendar_id?: string | null
        }
        Update: {
          access_token_ciphertext?: string
          access_token_expires_at?: string | null
          access_token_iv?: string
          access_token_tag?: string
          account_email?: string
          allow_write?: boolean
          created_at?: string
          external_account_id?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          provider?: string
          refresh_token_ciphertext?: string | null
          refresh_token_iv?: string | null
          refresh_token_tag?: string | null
          revoked_at?: string | null
          scopes?: string[]
          user_id?: string
          write_calendar_id?: string | null
        }
        Relationships: []
      }
      calendar_event_writes: {
        Row: {
          connection_id: string
          id: string
          last_pushed_at: string
          provider_event_id: string
          task_id: string
        }
        Insert: {
          connection_id: string
          id?: string
          last_pushed_at?: string
          provider_event_id: string
          task_id: string
        }
        Update: {
          connection_id?: string
          id?: string
          last_pushed_at?: string
          provider_event_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_writes_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "calendar_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_writes_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          connection_id: string
          deleted_at: string | null
          description: string | null
          ends_at: string | null
          external_id: string
          fetched_at: string
          html_link: string | null
          id: string
          location: string | null
          raw: Json | null
          source_calendar: string | null
          starts_at: string
          terminal_id: string | null
          title: string
        }
        Insert: {
          all_day?: boolean
          connection_id: string
          deleted_at?: string | null
          description?: string | null
          ends_at?: string | null
          external_id: string
          fetched_at?: string
          html_link?: string | null
          id?: string
          location?: string | null
          raw?: Json | null
          source_calendar?: string | null
          starts_at: string
          terminal_id?: string | null
          title: string
        }
        Update: {
          all_day?: boolean
          connection_id?: string
          deleted_at?: string | null
          description?: string | null
          ends_at?: string | null
          external_id?: string
          fetched_at?: string
          html_link?: string | null
          id?: string
          location?: string | null
          raw?: Json | null
          source_calendar?: string | null
          starts_at?: string
          terminal_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "calendar_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          created_by: string
          deleted_at: string | null
          edited_at: string | null
          entity_id: string
          entity_type: string
          id: string
          mentions: string[]
          parent_id: string | null
          search_vector: unknown
          terminal_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          edited_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          mentions?: string[]
          parent_id?: string | null
          search_vector?: unknown
          terminal_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          edited_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          mentions?: string[]
          parent_id?: string | null
          search_vector?: unknown
          terminal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          addresses: Json
          avatar_url: string | null
          birthday: string | null
          company: string | null
          contact_types: string[]
          created_at: string
          custom: Json
          do_not_contact: boolean
          emails: Json
          family: Json
          first_name: string
          id: string
          last_name: string
          license_no: string | null
          middle_name: string | null
          nickname: string | null
          notes: string | null
          owner_id: string
          phones: Json
          prefix: string | null
          primary_email: string | null
          primary_phone: string | null
          socials: Json
          source: string | null
          status: string
          strength: number
          suffix: string | null
          tags: string[]
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          addresses?: Json
          avatar_url?: string | null
          birthday?: string | null
          company?: string | null
          contact_types?: string[]
          created_at?: string
          custom?: Json
          do_not_contact?: boolean
          emails?: Json
          family?: Json
          first_name?: string
          id?: string
          last_name?: string
          license_no?: string | null
          middle_name?: string | null
          nickname?: string | null
          notes?: string | null
          owner_id: string
          phones?: Json
          prefix?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          socials?: Json
          source?: string | null
          status?: string
          strength?: number
          suffix?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          addresses?: Json
          avatar_url?: string | null
          birthday?: string | null
          company?: string | null
          contact_types?: string[]
          created_at?: string
          custom?: Json
          do_not_contact?: boolean
          emails?: Json
          family?: Json
          first_name?: string
          id?: string
          last_name?: string
          license_no?: string | null
          middle_name?: string | null
          nickname?: string | null
          notes?: string | null
          owner_id?: string
          phones?: Json
          prefix?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          socials?: Json
          source?: string | null
          status?: string
          strength?: number
          suffix?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      domain_events: {
        Row: {
          actor_id: string | null
          actor_token_id: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          name: string
          occurred_at: string
          payload: Json
          sequence: number
          space_id: string | null
          terminal_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_token_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          name: string
          occurred_at?: string
          payload?: Json
          sequence?: number
          space_id?: string | null
          terminal_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_token_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          name?: string
          occurred_at?: string
          payload?: Json
          sequence?: number
          space_id?: string | null
          terminal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "domain_events_actor_token_id_fkey"
            columns: ["actor_token_id"]
            isOneToOne: false
            referencedRelation: "access_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_events_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "domain_events_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_annotations: {
        Row: {
          body: string
          color: string
          created_at: string
          created_by: string
          deleted_at: string | null
          file_id: string
          id: string
          page_number: number
          resolved_at: string | null
          x_pct: number
          y_pct: number
        }
        Insert: {
          body: string
          color?: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          file_id: string
          id?: string
          page_number: number
          resolved_at?: string | null
          x_pct: number
          y_pct: number
        }
        Update: {
          body?: string
          color?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          file_id?: string
          id?: string
          page_number?: number
          resolved_at?: string | null
          x_pct?: number
          y_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "drawing_annotations_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_access_events: {
        Row: {
          active_until: string | null
          admin_id: string
          ended_at: string | null
          id: string
          notified_target: boolean
          reason: string
          revoked_at: string | null
          revoked_by: string | null
          started_at: string
          target_org_id: string | null
          target_project_id: string | null
          target_space_id: string | null
          target_terminal_id: string | null
          target_user_id: string | null
        }
        Insert: {
          active_until?: string | null
          admin_id: string
          ended_at?: string | null
          id?: string
          notified_target?: boolean
          reason: string
          revoked_at?: string | null
          revoked_by?: string | null
          started_at?: string
          target_org_id?: string | null
          target_project_id?: string | null
          target_space_id?: string | null
          target_terminal_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          active_until?: string | null
          admin_id?: string
          ended_at?: string | null
          id?: string
          notified_target?: boolean
          reason?: string
          revoked_at?: string | null
          revoked_by?: string | null
          started_at?: string
          target_org_id?: string | null
          target_project_id?: string | null
          target_space_id?: string | null
          target_terminal_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emergency_access_events_target_org_id_fkey"
            columns: ["target_org_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_access_events_target_project_id_fkey"
            columns: ["target_project_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_access_events_target_space_id_fkey"
            columns: ["target_space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_access_events_target_terminal_id_fkey"
            columns: ["target_terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          rollout_percentage: number
          scope: string
          scope_id: string | null
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          rollout_percentage?: number
          scope?: string
          scope_id?: string | null
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          rollout_percentage?: number
          scope?: string
          scope_id?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      file_chunks: {
        Row: {
          chunk_index: number
          content: string
          content_tsv: unknown
          created_at: string
          embedding: string | null
          file_id: string
          id: string
          page_number: number | null
          terminal_id: string
          tokens: number
        }
        Insert: {
          chunk_index: number
          content: string
          content_tsv?: unknown
          created_at?: string
          embedding?: string | null
          file_id: string
          id?: string
          page_number?: number | null
          terminal_id: string
          tokens: number
        }
        Update: {
          chunk_index?: number
          content?: string
          content_tsv?: unknown
          created_at?: string
          embedding?: string | null
          file_id?: string
          id?: string
          page_number?: number | null
          terminal_id?: string
          tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "file_chunks_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_chunks_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          blob_key: string
          deleted_at: string | null
          deleted_by: string | null
          filename: string
          folder: string
          id: string
          index_error: string | null
          indexed_at: string | null
          metadata: Json
          mime_type: string
          revision_label: string | null
          search_vector: unknown
          sha256: string | null
          size_bytes: number
          supersedes: string | null
          terminal_id: string
          updated_at: string
          uploaded_at: string
          uploaded_by: string
          version: number
          virus_scan_result: string | null
          virus_scan_status: Database["public"]["Enums"]["virus_scan_status"]
          visibility: Database["public"]["Enums"]["file_visibility"]
          visibility_roles: Database["public"]["Enums"]["terminal_role"][]
          visibility_users: string[]
        }
        Insert: {
          blob_key: string
          deleted_at?: string | null
          deleted_by?: string | null
          filename: string
          folder?: string
          id?: string
          index_error?: string | null
          indexed_at?: string | null
          metadata?: Json
          mime_type: string
          revision_label?: string | null
          search_vector?: unknown
          sha256?: string | null
          size_bytes: number
          supersedes?: string | null
          terminal_id: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by: string
          version?: number
          virus_scan_result?: string | null
          virus_scan_status?: Database["public"]["Enums"]["virus_scan_status"]
          visibility?: Database["public"]["Enums"]["file_visibility"]
          visibility_roles?: Database["public"]["Enums"]["terminal_role"][]
          visibility_users?: string[]
        }
        Update: {
          blob_key?: string
          deleted_at?: string | null
          deleted_by?: string | null
          filename?: string
          folder?: string
          id?: string
          index_error?: string | null
          indexed_at?: string | null
          metadata?: Json
          mime_type?: string
          revision_label?: string | null
          search_vector?: unknown
          sha256?: string | null
          size_bytes?: number
          supersedes?: string | null
          terminal_id?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string
          version?: number
          virus_scan_result?: string | null
          virus_scan_status?: Database["public"]["Enums"]["virus_scan_status"]
          visibility?: Database["public"]["Enums"]["file_visibility"]
          visibility_roles?: Database["public"]["Enums"]["terminal_role"][]
          visibility_users?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "files_supersedes_fkey"
            columns: ["supersedes"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          name: string
          parent_path: string
          path: string
          terminal_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          name: string
          parent_path: string
          path: string
          terminal_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          name?: string
          parent_path?: string
          path?: string
          terminal_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      goals_categories: {
        Row: {
          archived_at: string | null
          color: string
          created_at: string
          display_order: number
          icon: string | null
          id: string
          name: string
          space_id: string | null
          terminal_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          color: string
          created_at?: string
          display_order?: number
          icon?: string | null
          id?: string
          name: string
          space_id?: string | null
          terminal_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          color?: string
          created_at?: string
          display_order?: number
          icon?: string | null
          id?: string
          name?: string
          space_id?: string | null
          terminal_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_categories_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_categories_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      goals_entries: {
        Row: {
          created_at: string
          entry_date: string
          goal_id: string
          id: string
          notes: string | null
          source: string
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          entry_date: string
          goal_id: string
          id?: string
          notes?: string | null
          source?: string
          updated_at?: string
          value: number
        }
        Update: {
          created_at?: string
          entry_date?: string
          goal_id?: string
          id?: string
          notes?: string | null
          source?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "goals_entries_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goals_goals: {
        Row: {
          archived_at: string | null
          category_id: string
          created_at: string
          display_order: number
          id: string
          name: string
          period: string
          source_config: Json | null
          source_type: string
          target_period: string
          unit: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          category_id: string
          created_at?: string
          display_order?: number
          id?: string
          name: string
          period?: string
          source_config?: Json | null
          source_type?: string
          target_period?: string
          unit: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          category_id?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          period?: string
          source_config?: Json | null
          source_type?: string
          target_period?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_goals_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "goals_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      goals_settings: {
        Row: {
          created_at: string
          default_category_id: string | null
          id: string
          setup_complete: boolean
          space_id: string | null
          terminal_id: string | null
          updated_at: string
          week_start_dow: number
        }
        Insert: {
          created_at?: string
          default_category_id?: string | null
          id?: string
          setup_complete?: boolean
          space_id?: string | null
          terminal_id?: string | null
          updated_at?: string
          week_start_dow?: number
        }
        Update: {
          created_at?: string
          default_category_id?: string | null
          id?: string
          setup_complete?: boolean
          space_id?: string | null
          terminal_id?: string | null
          updated_at?: string
          week_start_dow?: number
        }
        Relationships: [
          {
            foreignKeyName: "goals_settings_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "goals_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_settings_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_settings_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      goals_targets: {
        Row: {
          created_at: string
          goal_id: string
          id: string
          valid_from: string
          weekly_target: number
        }
        Insert: {
          created_at?: string
          goal_id: string
          id?: string
          valid_from: string
          weekly_target: number
        }
        Update: {
          created_at?: string
          goal_id?: string
          id?: string
          valid_from?: string
          weekly_target?: number
        }
        Relationships: [
          {
            foreignKeyName: "goals_targets_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_events: {
        Row: {
          admin_user_id: string
          ended_at: string | null
          id: string
          ip_address: string | null
          justification: string
          started_at: string
          target_user_id: string
          user_agent: string | null
        }
        Insert: {
          admin_user_id: string
          ended_at?: string | null
          id?: string
          ip_address?: string | null
          justification: string
          started_at?: string
          target_user_id: string
          user_agent?: string | null
        }
        Update: {
          admin_user_id?: string
          ended_at?: string | null
          id?: string
          ip_address?: string | null
          justification?: string
          started_at?: string
          target_user_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      interactions: {
        Row: {
          body: string
          contact_id: string | null
          created_at: string
          created_by: string
          done_at: string | null
          due_at: string | null
          id: string
          lead_id: string | null
          occurred_at: string
          owner_id: string
          space_id: string | null
          terminal_id: string | null
          type: string
        }
        Insert: {
          body?: string
          contact_id?: string | null
          created_at?: string
          created_by: string
          done_at?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          occurred_at?: string
          owner_id: string
          space_id?: string | null
          terminal_id?: string | null
          type?: string
        }
        Update: {
          body?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string
          done_at?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          occurred_at?: string
          owner_id?: string
          space_id?: string | null
          terminal_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_lead_fk"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "pl_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          email: string
          expires_at: string
          id: string
          invited_at: string
          invited_by: string
          role: string
          space_id: string | null
          terminal_id: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by: string
          role: string
          space_id?: string | null
          terminal_id?: string | null
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by?: string
          role?: string
          space_id?: string | null
          terminal_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempt: number
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_run_at: string
          payload: Json
          queue: string
          status: string
        }
        Insert: {
          attempt?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_run_at?: string
          payload?: Json
          queue: string
          status?: string
        }
        Update: {
          attempt?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_run_at?: string
          payload?: Json
          queue?: string
          status?: string
        }
        Relationships: []
      }
      message_threads: {
        Row: {
          created_at: string
          id: string
          kind: string
          last_message_at: string
          space_id: string | null
          terminal_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          last_message_at?: string
          space_id?: string | null
          terminal_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          last_message_at?: string
          space_id?: string | null
          terminal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          pinging_task_id: string | null
          thread_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          pinging_task_id?: string | null
          thread_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          pinging_task_id?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_pinging_task_id_fkey"
            columns: ["pinging_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_alerts: {
        Row: {
          active: boolean
          condition: string
          created_at: string
          id: string
          last_triggered_at: string | null
          note: string | null
          symbol: string
          threshold: number
          user_id: string
        }
        Insert: {
          active?: boolean
          condition: string
          created_at?: string
          id?: string
          last_triggered_at?: string | null
          note?: string | null
          symbol: string
          threshold: number
          user_id: string
        }
        Update: {
          active?: boolean
          condition?: string
          created_at?: string
          id?: string
          last_triggered_at?: string | null
          note?: string | null
          symbol?: string
          threshold?: number
          user_id?: string
        }
        Relationships: []
      }
      mkt_instruments: {
        Row: {
          currency: string
          exchange: string | null
          name: string
          symbol: string
          type: string
          updated_at: string
        }
        Insert: {
          currency?: string
          exchange?: string | null
          name?: string
          symbol: string
          type?: string
          updated_at?: string
        }
        Update: {
          currency?: string
          exchange?: string | null
          name?: string
          symbol?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      mkt_lots: {
        Row: {
          created_at: string
          fees: number
          id: string
          note: string | null
          portfolio_id: string
          price: number
          quantity: number
          side: string
          symbol: string
          trade_date: string
        }
        Insert: {
          created_at?: string
          fees?: number
          id?: string
          note?: string | null
          portfolio_id: string
          price: number
          quantity: number
          side: string
          symbol: string
          trade_date: string
        }
        Update: {
          created_at?: string
          fees?: number
          id?: string
          note?: string | null
          portfolio_id?: string
          price?: number
          quantity?: number
          side?: string
          symbol?: string
          trade_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_lots_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "mkt_portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_portfolios: {
        Row: {
          archived_at: string | null
          base_currency: string
          created_at: string
          created_by: string
          id: string
          name: string
          space_id: string | null
          terminal_id: string | null
          user_id: string | null
        }
        Insert: {
          archived_at?: string | null
          base_currency?: string
          created_at?: string
          created_by: string
          id?: string
          name: string
          space_id?: string | null
          terminal_id?: string | null
          user_id?: string | null
        }
        Update: {
          archived_at?: string | null
          base_currency?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          space_id?: string | null
          terminal_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_portfolios_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_portfolios_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_quote_cache: {
        Row: {
          fetched_at: string
          payload: Json
          provider: string
          symbol: string
        }
        Insert: {
          fetched_at?: string
          payload: Json
          provider: string
          symbol: string
        }
        Update: {
          fetched_at?: string
          payload?: Json
          provider?: string
          symbol?: string
        }
        Relationships: []
      }
      mkt_watchlist_symbols: {
        Row: {
          added_at: string
          display_order: number
          id: string
          note: string | null
          symbol: string
          watchlist_id: string
        }
        Insert: {
          added_at?: string
          display_order?: number
          id?: string
          note?: string | null
          symbol: string
          watchlist_id: string
        }
        Update: {
          added_at?: string
          display_order?: number
          id?: string
          note?: string | null
          symbol?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_watchlist_symbols_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "mkt_watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_watchlists: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          display_order: number
          id: string
          name: string
          space_id: string | null
          terminal_id: string | null
          user_id: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          display_order?: number
          id?: string
          name: string
          space_id?: string | null
          terminal_id?: string | null
          user_id?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          display_order?: number
          id?: string
          name?: string
          space_id?: string | null
          terminal_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_watchlists_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_watchlists_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      modules_catalog: {
        Row: {
          created_at: string
          description: string
          enabled_by_default: boolean
          icon: string | null
          name: string
          scopes: string[]
          slug: string
          vertical: string | null
        }
        Insert: {
          created_at?: string
          description: string
          enabled_by_default?: boolean
          icon?: string | null
          name: string
          scopes: string[]
          slug: string
          vertical?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          enabled_by_default?: boolean
          icon?: string | null
          name?: string
          scopes?: string[]
          slug?: string
          vertical?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          email_sent_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: string
          read_at: string | null
          terminal_id: string | null
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          email_sent_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind: string
          read_at?: string | null
          terminal_id?: string | null
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          email_sent_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          terminal_id?: string | null
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      permits: {
        Row: {
          applied_on: string | null
          authority: string | null
          created_at: string
          created_by: string
          expires_on: string | null
          id: string
          issued_on: string | null
          kind: string
          metadata: Json
          notes: string | null
          number: string | null
          status: string
          terminal_id: string
          updated_at: string
        }
        Insert: {
          applied_on?: string | null
          authority?: string | null
          created_at?: string
          created_by: string
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          kind: string
          metadata?: Json
          notes?: string | null
          number?: string | null
          status?: string
          terminal_id: string
          updated_at?: string
        }
        Update: {
          applied_on?: string | null
          authority?: string | null
          created_at?: string
          created_by?: string
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          kind?: string
          metadata?: Json
          notes?: string | null
          number?: string | null
          status?: string
          terminal_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permits_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      pl_lead_contacts: {
        Row: {
          added_at: string
          contact_id: string
          lead_id: string
          role: string | null
        }
        Insert: {
          added_at?: string
          contact_id: string
          lead_id: string
          role?: string | null
        }
        Update: {
          added_at?: string
          contact_id?: string
          lead_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pl_lead_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pl_lead_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "pl_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      pl_leads: {
        Row: {
          attributes: Json
          created_at: string
          created_by: string | null
          dead_reason: string | null
          id: string
          last_activity_at: string
          lat: number | null
          lng: number | null
          name: string
          next_follow_up_at: string | null
          owner_id: string | null
          pipeline_id: string
          priority: number
          promoted_terminal_id: string | null
          source: string | null
          space_id: string
          stage: string
          status: string
          subtitle: string | null
          updated_at: string
        }
        Insert: {
          attributes?: Json
          created_at?: string
          created_by?: string | null
          dead_reason?: string | null
          id?: string
          last_activity_at?: string
          lat?: number | null
          lng?: number | null
          name: string
          next_follow_up_at?: string | null
          owner_id?: string | null
          pipeline_id: string
          priority?: number
          promoted_terminal_id?: string | null
          source?: string | null
          space_id: string
          stage?: string
          status?: string
          subtitle?: string | null
          updated_at?: string
        }
        Update: {
          attributes?: Json
          created_at?: string
          created_by?: string | null
          dead_reason?: string | null
          id?: string
          last_activity_at?: string
          lat?: number | null
          lng?: number | null
          name?: string
          next_follow_up_at?: string | null
          owner_id?: string | null
          pipeline_id?: string
          priority?: number
          promoted_terminal_id?: string | null
          source?: string | null
          space_id?: string
          stage?: string
          status?: string
          subtitle?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pl_leads_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pl_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pl_leads_promoted_terminal_id_fkey"
            columns: ["promoted_terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pl_leads_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pl_pipelines: {
        Row: {
          created_at: string
          created_by: string | null
          fields: Json
          fields_customized: boolean
          id: string
          kind: string
          name: string
          position: number
          space_id: string
          stages: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fields?: Json
          fields_customized?: boolean
          id?: string
          kind?: string
          name: string
          position?: number
          space_id: string
          stages?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fields?: Json
          fields_customized?: boolean
          id?: string
          kind?: string
          name?: string
          position?: number
          space_id?: string
          stages?: Json
        }
        Relationships: [
          {
            foreignKeyName: "pl_pipelines_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_config: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          is_platform_admin: boolean
          preferences: Json
          settings: Json
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          is_platform_admin?: boolean
          preferences?: Json
          settings?: Json
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          is_platform_admin?: boolean
          preferences?: Json
          settings?: Json
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_secret: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_secret: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_secret?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quotas: {
        Row: {
          id: string
          limit_credits: number
          period: Database["public"]["Enums"]["quota_period"]
          reset_at: string
          subject_id: string
          subject_type: string
          tool_id: string | null
          updated_at: string
          used_credits: number
        }
        Insert: {
          id?: string
          limit_credits: number
          period: Database["public"]["Enums"]["quota_period"]
          reset_at: string
          subject_id: string
          subject_type: string
          tool_id?: string | null
          updated_at?: string
          used_credits?: number
        }
        Update: {
          id?: string
          limit_credits?: number
          period?: Database["public"]["Enums"]["quota_period"]
          reset_at?: string
          subject_id?: string
          subject_type?: string
          tool_id?: string | null
          updated_at?: string
          used_credits?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotas_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          id: number
          token: string
          ts: string
        }
        Insert: {
          bucket: string
          id?: number
          token: string
          ts?: string
        }
        Update: {
          bucket?: string
          id?: number
          token?: string
          ts?: string
        }
        Relationships: []
      }
      schedule_phases: {
        Row: {
          color: string | null
          created_at: string
          created_by: string
          depends_on: string | null
          end_date: string
          id: string
          metadata: Json
          position: number
          start_date: string
          terminal_id: string
          title: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by: string
          depends_on?: string | null
          end_date: string
          id?: string
          metadata?: Json
          position?: number
          start_date: string
          terminal_id: string
          title: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          depends_on?: string | null
          end_date?: string
          id?: string
          metadata?: Json
          position?: number
          start_date?: string
          terminal_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_phases_depends_on_fkey"
            columns: ["depends_on"]
            isOneToOne: false
            referencedRelation: "schedule_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_phases_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      session_revocations: {
        Row: {
          created_at: string
          id: number
          reason: string
          scope_id: string | null
          scope_type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          reason: string
          scope_id?: string | null
          scope_type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          reason?: string
          scope_id?: string | null
          scope_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      share_link_accesses: {
        Row: {
          id: string
          kind: string
          share_link_id: string
          viewed_at: string
          viewer_email: string | null
          viewer_ip: unknown
          viewer_ua: string | null
        }
        Insert: {
          id?: string
          kind: string
          share_link_id: string
          viewed_at?: string
          viewer_email?: string | null
          viewer_ip?: unknown
          viewer_ua?: string | null
        }
        Update: {
          id?: string
          kind?: string
          share_link_id?: string
          viewed_at?: string
          viewer_email?: string | null
          viewer_ip?: unknown
          viewer_ua?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "share_link_accesses_share_link_id_fkey"
            columns: ["share_link_id"]
            isOneToOne: false
            referencedRelation: "share_links"
            referencedColumns: ["id"]
          },
        ]
      }
      share_links: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          file_id: string
          id: string
          label: string | null
          max_views: number | null
          require_email: boolean
          revoked_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          file_id: string
          id?: string
          label?: string | null
          max_views?: number | null
          require_email?: boolean
          revoked_at?: string | null
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          file_id?: string
          id?: string
          label?: string | null
          max_views?: number | null
          require_email?: boolean
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_links_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_accounts: {
        Row: {
          created_at: string
          device_id: number | null
          linked_at: string | null
          signal_number: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id?: number | null
          linked_at?: string | null
          signal_number?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: number | null
          linked_at?: string | null
          signal_number?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      signal_contacts: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string | null
          signal_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          name?: string | null
          signal_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string | null
          signal_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      signal_messages: {
        Row: {
          attachments: Json
          body: string | null
          created_at: string
          deleted_at: string | null
          direction: string
          edited_at: string | null
          external_id: string | null
          id: string
          quote_external_id: string | null
          reactions: Json
          sender: string | null
          sent_at: string
          status: string
          status_at: string | null
          thread_id: string
          user_id: string
        }
        Insert: {
          attachments?: Json
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          direction: string
          edited_at?: string | null
          external_id?: string | null
          id?: string
          quote_external_id?: string | null
          reactions?: Json
          sender?: string | null
          sent_at?: string
          status?: string
          status_at?: string | null
          thread_id: string
          user_id: string
        }
        Update: {
          attachments?: Json
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          direction?: string
          edited_at?: string | null
          external_id?: string | null
          id?: string
          quote_external_id?: string | null
          reactions?: Json
          sender?: string | null
          sent_at?: string
          status?: string
          status_at?: string | null
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "signal_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_threads: {
        Row: {
          created_at: string
          id: string
          kind: string
          last_message_at: string | null
          last_read_at: string | null
          muted: boolean
          signal_id: string
          sync_enabled: boolean
          terminal_id: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          last_message_at?: string | null
          last_read_at?: string | null
          muted?: boolean
          signal_id: string
          sync_enabled?: boolean
          terminal_id?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          last_message_at?: string | null
          last_read_at?: string | null
          muted?: boolean
          signal_id?: string
          sync_enabled?: boolean
          terminal_id?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_threads_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      space_members: {
        Row: {
          joined_at: string
          role: Database["public"]["Enums"]["org_role"]
          space_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          role?: Database["public"]["Enums"]["org_role"]
          space_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          role?: Database["public"]["Enums"]["org_role"]
          space_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_members_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_modules: {
        Row: {
          archived_at: string | null
          config: Json
          display_order: number
          id: string
          installed_at: string
          installed_by: string
          slug: string
          space_id: string
        }
        Insert: {
          archived_at?: string | null
          config?: Json
          display_order?: number
          id?: string
          installed_at?: string
          installed_by: string
          slug: string
          space_id: string
        }
        Update: {
          archived_at?: string | null
          config?: Json
          display_order?: number
          id?: string
          installed_at?: string
          installed_by?: string
          slug?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_modules_slug_fkey"
            columns: ["slug"]
            isOneToOne: false
            referencedRelation: "modules_catalog"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "space_modules_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_personal: boolean
          name: string
          personal_owner_id: string | null
          search_vector: unknown
          settings: Json
          slug: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_personal?: boolean
          name: string
          personal_owner_id?: string | null
          search_vector?: unknown
          settings?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_personal?: boolean
          name?: string
          personal_owner_id?: string | null
          search_vector?: unknown
          settings?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      subtasks: {
        Row: {
          created_at: string
          created_by: string | null
          done: boolean
          id: string
          label: string
          position: number
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          done?: boolean
          id?: string
          label: string
          position?: number
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          done?: boolean
          id?: string
          label?: string
          position?: number
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          assigned_at: string
          assigned_by: string
          task_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          task_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          depends_on: string
          task_id: string
        }
        Insert: {
          depends_on: string
          task_id: string
        }
        Update: {
          depends_on?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_depends_on_fkey"
            columns: ["depends_on"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_files: {
        Row: {
          attached_at: string
          attached_by: string
          file_id: string
          task_id: string
        }
        Insert: {
          attached_at?: string
          attached_by: string
          file_id: string
          task_id: string
        }
        Update: {
          attached_at?: string
          attached_by?: string
          file_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_files_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_files_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_watchers: {
        Row: {
          added_at: string
          added_by: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_watchers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_date: string | null
          external_assignee_emails: string[]
          id: string
          labels: string[]
          latest_status_at: string | null
          latest_status_author_id: string | null
          latest_status_text: string | null
          metadata: Json
          position: number | null
          priority: number | null
          recurrence_parent_id: string | null
          recurrence_rule: Json | null
          search_vector: unknown
          starred: boolean
          status: Database["public"]["Enums"]["task_status"]
          status_thread_id: string | null
          terminal_id: string
          ticker_seq: number
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_date?: string | null
          external_assignee_emails?: string[]
          id?: string
          labels?: string[]
          latest_status_at?: string | null
          latest_status_author_id?: string | null
          latest_status_text?: string | null
          metadata?: Json
          position?: number | null
          priority?: number | null
          recurrence_parent_id?: string | null
          recurrence_rule?: Json | null
          search_vector?: unknown
          starred?: boolean
          status?: Database["public"]["Enums"]["task_status"]
          status_thread_id?: string | null
          terminal_id: string
          ticker_seq: number
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_date?: string | null
          external_assignee_emails?: string[]
          id?: string
          labels?: string[]
          latest_status_at?: string | null
          latest_status_author_id?: string | null
          latest_status_text?: string | null
          metadata?: Json
          position?: number | null
          priority?: number | null
          recurrence_parent_id?: string | null
          recurrence_rule?: Json | null
          search_vector?: unknown
          starred?: boolean
          status?: Database["public"]["Enums"]["task_status"]
          status_thread_id?: string | null
          terminal_id?: string
          ticker_seq?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_status_thread_id_fkey"
            columns: ["status_thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      terminal_contacts: {
        Row: {
          added_at: string
          contact_id: string
          role: string | null
          terminal_id: string
        }
        Insert: {
          added_at?: string
          contact_id: string
          role?: string | null
          terminal_id: string
        }
        Update: {
          added_at?: string
          contact_id?: string
          role?: string | null
          terminal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminal_contacts_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      terminal_members: {
        Row: {
          added_at: string
          added_by: string
          role: Database["public"]["Enums"]["terminal_role"]
          terminal_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by: string
          role: Database["public"]["Enums"]["terminal_role"]
          terminal_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string
          role?: Database["public"]["Enums"]["terminal_role"]
          terminal_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_members_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      terminal_modules: {
        Row: {
          archived_at: string | null
          config: Json
          display_order: number
          id: string
          installed_at: string
          installed_by: string
          slug: string
          terminal_id: string
        }
        Insert: {
          archived_at?: string | null
          config?: Json
          display_order?: number
          id?: string
          installed_at?: string
          installed_by: string
          slug: string
          terminal_id: string
        }
        Update: {
          archived_at?: string | null
          config?: Json
          display_order?: number
          id?: string
          installed_at?: string
          installed_by?: string
          slug?: string
          terminal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminal_modules_slug_fkey"
            columns: ["slug"]
            isOneToOne: false
            referencedRelation: "modules_catalog"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "terminal_modules_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      terminals: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          metadata: Json
          name: string
          search_vector: unknown
          slug: string
          space_id: string
          status: Database["public"]["Enums"]["project_status"]
          ticker: string
          type: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          metadata?: Json
          name: string
          search_vector?: unknown
          slug: string
          space_id: string
          status?: Database["public"]["Enums"]["project_status"]
          ticker: string
          type?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          metadata?: Json
          name?: string
          search_vector?: unknown
          slug?: string
          space_id?: string
          status?: Database["public"]["Enums"]["project_status"]
          ticker?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminals_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_participants: {
        Row: {
          added_at: string
          last_read_at: string | null
          thread_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          last_read_at?: string | null
          thread_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          last_read_at?: string | null
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_access: {
        Row: {
          access_level: string
          approved_at: string
          approved_by: string | null
          expires_at: string | null
          subject_id: string
          subject_type: string
          tool_id: string
        }
        Insert: {
          access_level: string
          approved_at?: string
          approved_by?: string | null
          expires_at?: string | null
          subject_id: string
          subject_type: string
          tool_id: string
        }
        Update: {
          access_level?: string
          approved_at?: string
          approved_by?: string | null
          expires_at?: string | null
          subject_id?: string
          subject_type?: string
          tool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_access_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_invocations: {
        Row: {
          completed_at: string | null
          cost_credits: number
          cost_usd: number
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          id: string
          inputs_sha256: string | null
          output_sha256: string | null
          output_size_bytes: number | null
          started_at: string
          status: Database["public"]["Enums"]["invocation_status"]
          terminal_id: string | null
          token_id: string | null
          tool_id: string
          tool_version_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          cost_credits?: number
          cost_usd?: number
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          inputs_sha256?: string | null
          output_sha256?: string | null
          output_size_bytes?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["invocation_status"]
          terminal_id?: string | null
          token_id?: string | null
          tool_id: string
          tool_version_id: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          cost_credits?: number
          cost_usd?: number
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          inputs_sha256?: string | null
          output_sha256?: string | null
          output_size_bytes?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["invocation_status"]
          terminal_id?: string | null
          token_id?: string | null
          tool_id?: string
          tool_version_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_invocations_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_invocations_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_invocations_tool_version_id_fkey"
            columns: ["tool_version_id"]
            isOneToOne: false
            referencedRelation: "tool_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_versions: {
        Row: {
          created_at: string
          entrypoint: string
          id: string
          published: boolean
          published_at: string | null
          published_by: string | null
          runtime: string
          scripts: Json
          skill_md: string
          tool_id: string
          version: string
        }
        Insert: {
          created_at?: string
          entrypoint: string
          id?: string
          published?: boolean
          published_at?: string | null
          published_by?: string | null
          runtime?: string
          scripts: Json
          skill_md: string
          tool_id: string
          version: string
        }
        Update: {
          created_at?: string
          entrypoint?: string
          id?: string
          published?: boolean
          published_at?: string | null
          published_by?: string | null
          runtime?: string
          scripts?: Json
          skill_md?: string
          tool_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_versions_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      tools: {
        Row: {
          approval_mode: Database["public"]["Enums"]["approval_mode"]
          cost_credits: number
          cost_description: string | null
          cost_usd_estimate: number
          created_at: string
          current_version: string
          deleted_at: string | null
          description: string
          id: string
          input_schema: Json
          memory_mb: number
          moderation_status: Database["public"]["Enums"]["tool_moderation"]
          name: string
          output_schema: Json | null
          owner_space_id: string
          owner_user_id: string
          requires_providers: string[]
          slug: string
          tags: string[]
          timeout_seconds: number
          updated_at: string
          visibility: Database["public"]["Enums"]["tool_visibility"]
        }
        Insert: {
          approval_mode?: Database["public"]["Enums"]["approval_mode"]
          cost_credits?: number
          cost_description?: string | null
          cost_usd_estimate?: number
          created_at?: string
          current_version?: string
          deleted_at?: string | null
          description: string
          id?: string
          input_schema: Json
          memory_mb?: number
          moderation_status?: Database["public"]["Enums"]["tool_moderation"]
          name: string
          output_schema?: Json | null
          owner_space_id: string
          owner_user_id: string
          requires_providers?: string[]
          slug: string
          tags?: string[]
          timeout_seconds?: number
          updated_at?: string
          visibility?: Database["public"]["Enums"]["tool_visibility"]
        }
        Update: {
          approval_mode?: Database["public"]["Enums"]["approval_mode"]
          cost_credits?: number
          cost_description?: string | null
          cost_usd_estimate?: number
          created_at?: string
          current_version?: string
          deleted_at?: string | null
          description?: string
          id?: string
          input_schema?: Json
          memory_mb?: number
          moderation_status?: Database["public"]["Enums"]["tool_moderation"]
          name?: string
          output_schema?: Json | null
          owner_space_id?: string
          owner_user_id?: string
          requires_providers?: string[]
          slug?: string
          tags?: string[]
          timeout_seconds?: number
          updated_at?: string
          visibility?: Database["public"]["Enums"]["tool_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "tools_owner_space_id_fkey"
            columns: ["owner_space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_module_pins: {
        Row: {
          display_order: number
          fn_key: number | null
          scope_id: string
          scope_kind: string
          slug: string
          user_id: string
        }
        Insert: {
          display_order: number
          fn_key?: number | null
          scope_id: string
          scope_kind: string
          slug: string
          user_id: string
        }
        Update: {
          display_order?: number
          fn_key?: number | null
          scope_id?: string
          scope_kind?: string
          slug?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_module_pins_slug_fkey"
            columns: ["slug"]
            isOneToOne: false
            referencedRelation: "modules_catalog"
            referencedColumns: ["slug"]
          },
        ]
      }
      user_views: {
        Row: {
          columns: Json
          created_at: string
          filter: Json
          id: string
          is_shared: boolean
          name: string
          owner_id: string
          scope: string
          sort: Json
          terminal_id: string | null
          updated_at: string
        }
        Insert: {
          columns?: Json
          created_at?: string
          filter?: Json
          id?: string
          is_shared?: boolean
          name: string
          owner_id: string
          scope: string
          sort?: Json
          terminal_id?: string | null
          updated_at?: string
        }
        Update: {
          columns?: Json
          created_at?: string
          filter?: Json
          id?: string
          is_shared?: boolean
          name?: string
          owner_id?: string
          scope?: string
          sort?: Json
          terminal_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_views_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string
          id: string
          metadata: Json
          name: string
          notes: string | null
          space_id: string
          tags: string[]
          updated_at: string
          website: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by: string
          id?: string
          metadata?: Json
          name: string
          notes?: string | null
          space_id: string
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string
          id?: string
          metadata?: Json
          name?: string
          notes?: string | null
          space_id?: string
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempt: number
          attempted_at: string
          created_at: string
          dead_at: string | null
          dead_lettered_at: string | null
          delivered_at: string | null
          destination_id: string
          event_id: string | null
          event_name: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          next_attempt_at: string | null
          payload: Json
          response_body: string | null
          response_code: number | null
          status: string
        }
        Insert: {
          attempt?: number
          attempted_at?: string
          created_at?: string
          dead_at?: string | null
          dead_lettered_at?: string | null
          delivered_at?: string | null
          destination_id: string
          event_id?: string | null
          event_name: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          next_attempt_at?: string | null
          payload: Json
          response_body?: string | null
          response_code?: number | null
          status?: string
        }
        Update: {
          attempt?: number
          attempted_at?: string
          created_at?: string
          dead_at?: string | null
          dead_lettered_at?: string | null
          delivered_at?: string | null
          destination_id?: string
          event_id?: string | null
          event_name?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          next_attempt_at?: string | null
          payload?: Json
          response_body?: string | null
          response_code?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "webhook_destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "domain_events"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_destinations: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string | null
          events: string[]
          id: string
          owner_space_id: string | null
          secret: string
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          events?: string[]
          id?: string
          owner_space_id?: string | null
          secret: string
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          events?: string[]
          id?: string
          owner_space_id?: string | null
          secret?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_destinations_owner_space_id_fkey"
            columns: ["owner_space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      api_keys_public: {
        Row: {
          created_at: string | null
          id: string | null
          key_hint: string | null
          last_used_at: string | null
          provider: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          key_hint?: string | null
          last_used_at?: string | null
          provider?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          key_hint?: string | null
          last_used_at?: string | null
          provider?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_see_file: {
        Args: { _file: Database["public"]["Tables"]["files"]["Row"] }
        Returns: boolean
      }
      can_see_thread: { Args: { _thread: string }; Returns: boolean }
      contact_link_suggestions: {
        Args: never
        Returns: {
          contact_id: string
        }[]
      }
      ensure_self_contact: { Args: { p_user_id: string }; Returns: undefined }
      explain_slow_query: {
        Args: { _query: string }
        Returns: {
          line: string
        }[]
      }
      get_auth_uid: { Args: never; Returns: string }
      get_slow_queries: {
        Args: { _limit?: number }
        Returns: {
          calls: number
          mean_exec_time: number
          query: string
          rows: number
          total_exec_time: number
        }[]
      }
      goals_add_entry: {
        Args: { p_delta: number; p_entry_date: string; p_goal_id: string }
        Returns: number
      }
      has_emergency_access: { Args: never; Returns: boolean }
      is_space_admin: { Args: { _org: string }; Returns: boolean }
      is_space_member: { Args: { _org: string }; Returns: boolean }
      is_terminal_manager: { Args: { _project: string }; Returns: boolean }
      is_terminal_member: { Args: { _project: string }; Returns: boolean }
      link_contact_by_email: {
        Args: { p_contact_id: string }
        Returns: boolean
      }
      link_contacts_for_membership: {
        Args: { p_space_id: string; p_user_id: string }
        Returns: undefined
      }
      promote_lead_to_terminal: {
        Args: { p_lead_id: string; p_ticker: string }
        Returns: {
          out_name: string
          out_ticker: string
          terminal_id: string
        }[]
      }
      provision_personal_space: { Args: { p_user_id: string }; Returns: string }
      purge_expired_trash: {
        Args: { _cutoff_days?: number }
        Returns: {
          purged: number
          table_name: string
        }[]
      }
      rate_limit_check: {
        Args: {
          _bucket: string
          _max_hits: number
          _token: string
          _window_seconds: number
        }
        Returns: boolean
      }
      rate_limit_cleanup: { Args: never; Returns: number }
      reset_slow_queries: { Args: never; Returns: boolean }
      rokki_signal_unread_counts: {
        Args: never
        Returns: {
          thread_id: string
          unread: number
        }[]
      }
      rokki_slugify: { Args: { input: string }; Returns: string }
      rokki_unread_counts: {
        Args: never
        Returns: {
          thread_id: string
          unread: number
        }[]
      }
      search_chunks_fts: {
        Args: { _limit?: number; _project?: string; _query: string }
        Returns: {
          chunk_index: number
          content: string
          file_id: string
          page_number: number
          rank: number
          terminal_id: string
        }[]
      }
      search_chunks_hybrid: {
        Args: {
          _limit?: number
          _query: string
          _query_embedding?: string
          _rrf_k?: number
          _terminal?: string
        }
        Returns: {
          chunk_index: number
          content: string
          file_id: string
          fts_rank: number
          page_number: number
          score: number
          terminal_id: string
          vector_rank: number
        }[]
      }
      search_chunks_vector: {
        Args: { _limit?: number; _project?: string; _query_embedding: string }
        Returns: {
          chunk_index: number
          content: string
          distance: number
          file_id: string
          page_number: number
          terminal_id: string
        }[]
      }
      search_global: {
        Args: { _kinds?: string[]; _limit?: number; _query: string }
        Returns: {
          id: string
          kind: string
          score: number
          snippet: string
          terminal_id: string
          terminal_ticker: string
          title: string
        }[]
      }
      session_revocations_prune: { Args: never; Returns: number }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      terminal_role: {
        Args: { _project: string }
        Returns: Database["public"]["Enums"]["terminal_role"]
      }
      unaccent: { Args: { "": string }; Returns: string }
      unlink_contact: { Args: { p_contact_id: string }; Returns: undefined }
    }
    Enums: {
      activity_action:
        | "terminal.create"
        | "terminal.update"
        | "terminal.archive"
        | "member.invite"
        | "member.join"
        | "member.remove"
        | "member.role_change"
        | "task.create"
        | "task.update"
        | "task.assign"
        | "task.unassign"
        | "task.complete"
        | "task.delete"
        | "file.upload"
        | "file.update"
        | "file.delete"
        | "file.download"
        | "file.permission_change"
        | "comment.create"
        | "comment.update"
        | "comment.delete"
        | "tool.publish"
        | "tool.invoke"
        | "tool.approve"
        | "tool.deny"
        | "approval.request"
        | "approval.resolve"
        | "token.create"
        | "token.revoke"
        | "key.add"
        | "key.remove"
        | "emergency_access.start"
        | "emergency_access.end"
        | "tasks_updated"
        | "terminals_updated"
        | "spaces_updated"
        | "files_updated"
        | "comments_updated"
      approval_mode: "auto" | "one_time" | "per_invocation"
      approval_status: "pending" | "approved" | "denied" | "expired"
      file_visibility: "project" | "owners" | "custom"
      invocation_status:
        | "queued"
        | "running"
        | "success"
        | "error"
        | "approval_required"
        | "quota_exceeded"
        | "timeout"
      org_role: "owner" | "admin" | "member"
      project_status: "planning" | "active" | "blocked" | "done" | "archived"
      quota_period: "day" | "month"
      task_status: "todo" | "in_progress" | "blocked" | "review" | "done"
      terminal_role:
        | "owner"
        | "manager"
        | "architect"
        | "gc"
        | "lender"
        | "family"
        | "guest"
      token_scope: "read" | "write" | "admin"
      tool_moderation: "approved" | "pending" | "disabled" | "featured"
      tool_visibility: "private" | "org" | "project" | "public"
      virus_scan_status: "pending" | "clean" | "infected" | "skipped"
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
      activity_action: [
        "terminal.create",
        "terminal.update",
        "terminal.archive",
        "member.invite",
        "member.join",
        "member.remove",
        "member.role_change",
        "task.create",
        "task.update",
        "task.assign",
        "task.unassign",
        "task.complete",
        "task.delete",
        "file.upload",
        "file.update",
        "file.delete",
        "file.download",
        "file.permission_change",
        "comment.create",
        "comment.update",
        "comment.delete",
        "tool.publish",
        "tool.invoke",
        "tool.approve",
        "tool.deny",
        "approval.request",
        "approval.resolve",
        "token.create",
        "token.revoke",
        "key.add",
        "key.remove",
        "emergency_access.start",
        "emergency_access.end",
        "tasks_updated",
        "terminals_updated",
        "spaces_updated",
        "files_updated",
        "comments_updated",
      ],
      approval_mode: ["auto", "one_time", "per_invocation"],
      approval_status: ["pending", "approved", "denied", "expired"],
      file_visibility: ["project", "owners", "custom"],
      invocation_status: [
        "queued",
        "running",
        "success",
        "error",
        "approval_required",
        "quota_exceeded",
        "timeout",
      ],
      org_role: ["owner", "admin", "member"],
      project_status: ["planning", "active", "blocked", "done", "archived"],
      quota_period: ["day", "month"],
      task_status: ["todo", "in_progress", "blocked", "review", "done"],
      terminal_role: [
        "owner",
        "manager",
        "architect",
        "gc",
        "lender",
        "family",
        "guest",
      ],
      token_scope: ["read", "write", "admin"],
      tool_moderation: ["approved", "pending", "disabled", "featured"],
      tool_visibility: ["private", "org", "project", "public"],
      virus_scan_status: ["pending", "clean", "infected", "skipped"],
    },
  },
} as const

