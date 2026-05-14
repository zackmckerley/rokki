# 01 — Data Model

**Scope:** Complete Postgres schema, Row Level Security (RLS) policies, indexes, triggers, and migrations.

This doc is the source of truth. The SQL below is copy-pasteable into Supabase's SQL editor or a migration file. Do not deviate.

## 1.1 Conventions

- All tables are in the `public` schema
- Primary keys: `UUID DEFAULT gen_random_uuid()`
- Timestamps: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- Soft deletes: a `deleted_at TIMESTAMPTZ` column where applicable; never hard-delete user-created content in Phase 1
- Audit: all tables have `created_at`; mutable tables have `updated_at` maintained by trigger
- Naming: `snake_case`, plural table names, singular column names
- Text: `TEXT` always (never VARCHAR with arbitrary limits); validate length at the application layer

## 1.2 Extensions

Run once per database:

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- gen_random_uuid(), digest()
CREATE EXTENSION IF NOT EXISTS "citext";         -- case-insensitive text for emails
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- fuzzy text search
CREATE EXTENSION IF NOT EXISTS "vector";         -- pgvector for file embeddings (Supabase)
CREATE EXTENSION IF NOT EXISTS "unaccent";       -- for search normalization
```

## 1.3 Enums

```sql
CREATE TYPE org_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE project_role AS ENUM ('owner', 'manager', 'architect', 'gc', 'lender', 'family', 'guest');
CREATE TYPE project_status AS ENUM ('planning', 'active', 'blocked', 'done', 'archived');
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'blocked', 'review', 'done');
CREATE TYPE file_visibility AS ENUM ('project', 'owners', 'custom');
CREATE TYPE virus_scan_status AS ENUM ('pending', 'clean', 'infected', 'skipped');
CREATE TYPE tool_visibility AS ENUM ('private', 'org', 'project', 'public');
CREATE TYPE approval_mode AS ENUM ('auto', 'one_time', 'per_invocation');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'denied', 'expired');
CREATE TYPE invocation_status AS ENUM ('queued', 'running', 'success', 'error', 'approval_required', 'quota_exceeded', 'timeout');
CREATE TYPE quota_period AS ENUM ('day', 'month');
CREATE TYPE token_scope AS ENUM ('read', 'write', 'admin');
CREATE TYPE activity_action AS ENUM (
  'project.create', 'project.update', 'project.archive',
  'member.invite', 'member.join', 'member.remove', 'member.role_change',
  'task.create', 'task.update', 'task.assign', 'task.unassign', 'task.complete', 'task.delete',
  'file.upload', 'file.update', 'file.delete', 'file.download', 'file.permission_change',
  'comment.create', 'comment.update', 'comment.delete',
  'tool.publish', 'tool.invoke', 'tool.approve', 'tool.deny',
  'approval.request', 'approval.resolve',
  'token.create', 'token.revoke',
  'key.add', 'key.remove',
  'emergency_access.start', 'emergency_access.end'
);
```

## 1.4 Schema

### 1.4.1 Orgs & profiles

```sql
CREATE TABLE orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT CHECK (char_length(full_name) <= 120),
  avatar_url TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE org_members (
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role org_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

CREATE INDEX idx_org_members_user ON org_members(user_id);
```

### 1.4.2 Projects

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL CHECK (ticker ~ '^[A-Z][A-Z0-9]{1,9}$'),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description TEXT,
  type TEXT NOT NULL DEFAULT 'construction',
  status project_status NOT NULL DEFAULT 'planning',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  UNIQUE (org_id, ticker)
);

CREATE INDEX idx_projects_org ON projects(org_id) WHERE archived_at IS NULL;
CREATE INDEX idx_projects_status ON projects(status) WHERE archived_at IS NULL;

CREATE TABLE project_members (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role project_role NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by UUID NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX idx_project_members_user ON project_members(user_id);
```

### 1.4.3 Tasks

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ticker_seq INT NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  description TEXT,
  status task_status NOT NULL DEFAULT 'todo',
  priority SMALLINT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 4),
  due_date DATE,
  labels TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (project_id, ticker_seq)
);

CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX idx_tasks_due ON tasks(due_date) WHERE status NOT IN ('done');

CREATE TABLE task_assignees (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID NOT NULL REFERENCES auth.users(id),
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX idx_task_assignees_user ON task_assignees(user_id);

CREATE TABLE task_dependencies (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on),
  CHECK (task_id <> depends_on)
);
```

### 1.4.4 Files

```sql
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  folder TEXT NOT NULL DEFAULT '/',
  filename TEXT NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 300),
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  blob_key TEXT NOT NULL UNIQUE,              -- Azure Blob key (internal, opaque)
  visibility file_visibility NOT NULL DEFAULT 'project',
  visibility_roles project_role[] NOT NULL DEFAULT '{}',
  visibility_users UUID[] NOT NULL DEFAULT '{}',
  version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  supersedes UUID REFERENCES files(id),
  virus_scan_status virus_scan_status NOT NULL DEFAULT 'pending',
  virus_scan_result TEXT,
  sha256 TEXT,                                 -- for dedup / integrity
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_files_project ON files(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_files_project_folder ON files(project_id, folder) WHERE deleted_at IS NULL;
CREATE INDEX idx_files_supersedes ON files(supersedes);

-- File text content chunks for RAG (see §05 for pipeline)
CREATE TABLE file_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  tokens INT NOT NULL,
  embedding VECTOR(1536),                     -- OpenAI text-embedding-3-small dimensions
  page_number INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (file_id, chunk_index)
);

CREATE INDEX idx_file_chunks_project ON file_chunks(project_id);
CREATE INDEX idx_file_chunks_embedding ON file_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### 1.4.5 Comments

```sql
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('task', 'file', 'project')),
  entity_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,  -- denormalized for RLS
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 20000),
  mentions UUID[] NOT NULL DEFAULT '{}',       -- user_ids @-mentioned
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_comments_entity ON comments(entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_comments_project ON comments(project_id) WHERE deleted_at IS NULL;
```

### 1.4.6 Activity log

```sql
CREATE TABLE activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES orgs(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_token_id UUID,                         -- if via AI, which access_token
  actor_tool_id UUID,                          -- if via a tool, which tool
  action activity_action NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_project_created ON activity(project_id, created_at DESC);
CREATE INDEX idx_activity_org_created ON activity(org_id, created_at DESC);
CREATE INDEX idx_activity_actor_created ON activity(actor_id, created_at DESC);
```

### 1.4.7 Tools & invocations

```sql
CREATE TABLE tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z][a-z0-9-]{1,60}[a-z0-9]$'),
  owner_org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  current_version TEXT NOT NULL DEFAULT '0.0.0',
  visibility tool_visibility NOT NULL DEFAULT 'private',
  input_schema JSONB NOT NULL,                 -- JSON Schema Draft 2020-12
  output_schema JSONB,
  requires_providers TEXT[] NOT NULL DEFAULT '{}',   -- e.g., ['anthropic']
  approval_mode approval_mode NOT NULL DEFAULT 'auto',
  cost_credits INT NOT NULL DEFAULT 0,
  cost_usd_estimate NUMERIC(10, 6) NOT NULL DEFAULT 0,
  cost_description TEXT,
  timeout_seconds INT NOT NULL DEFAULT 60 CHECK (timeout_seconds BETWEEN 1 AND 600),
  memory_mb INT NOT NULL DEFAULT 512 CHECK (memory_mb IN (128, 256, 512, 1024, 2048)),
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (owner_org_id, slug)
);

CREATE INDEX idx_tools_visibility ON tools(visibility) WHERE deleted_at IS NULL;

CREATE TABLE tool_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  version TEXT NOT NULL CHECK (version ~ '^\d+\.\d+\.\d+$'),
  skill_md TEXT NOT NULL,                      -- full SKILL.md content
  scripts JSONB NOT NULL,                      -- {filename: base64_content}
  runtime TEXT NOT NULL DEFAULT 'node:20',     -- node:20 | python:3.12
  entrypoint TEXT NOT NULL,                    -- relative path to script
  published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tool_id, version)
);

CREATE TABLE tool_access (
  tool_id UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'project', 'org')),
  subject_id UUID NOT NULL,
  access_level TEXT NOT NULL CHECK (access_level IN ('use', 'admin')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  PRIMARY KEY (tool_id, subject_type, subject_id)
);

CREATE TABLE tool_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id UUID NOT NULL REFERENCES tools(id),
  tool_version_id UUID NOT NULL REFERENCES tool_versions(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  token_id UUID,                               -- if via MCP, which token
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  inputs_sha256 TEXT,
  status invocation_status NOT NULL DEFAULT 'queued',
  cost_credits INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  duration_ms INT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  output_sha256 TEXT,
  output_size_bytes INT
);

CREATE INDEX idx_invocations_user_created ON tool_invocations(user_id, started_at DESC);
CREATE INDEX idx_invocations_tool_created ON tool_invocations(tool_id, started_at DESC);
CREATE INDEX idx_invocations_status ON tool_invocations(status) WHERE status IN ('queued', 'running', 'approval_required');
```

### 1.4.8 Auth & tokens

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('anthropic', 'openai', 'google', 'mistral', 'cohere')),
  wrapped_dek BYTEA NOT NULL,                  -- DEK wrapped by KMS master key
  ciphertext BYTEA NOT NULL,                   -- AES-256-GCM(api_key, DEK)
  iv BYTEA NOT NULL,                           -- GCM IV (12 bytes)
  tag BYTEA NOT NULL,                          -- GCM auth tag (16 bytes)
  key_hint TEXT NOT NULL,                      -- last 4 chars of key for UI display
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE TABLE access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  token_hash TEXT NOT NULL UNIQUE,             -- sha256 hash of plaintext token
  token_prefix TEXT NOT NULL,                  -- first 8 chars for UI (e.g., "rk_live_ab12")
  scopes token_scope[] NOT NULL DEFAULT '{read}',
  project_restrictions UUID[],                 -- NULL = all accessible; array = only these
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  last_used_ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT
);

CREATE INDEX idx_tokens_user ON access_tokens(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_tokens_hash ON access_tokens(token_hash) WHERE revoked_at IS NULL;
```

### 1.4.9 Invites

```sql
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL,
  org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id),
  CHECK (org_id IS NOT NULL OR project_id IS NOT NULL)
);

CREATE INDEX idx_invites_email ON invites(email) WHERE accepted_at IS NULL;
CREATE INDEX idx_invites_token ON invites(token);
```

### 1.4.10 Approvals

```sql
CREATE TABLE approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('tool_access', 'tool_invocation', 'file_access', 'join_project')),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approver_org_id UUID REFERENCES orgs(id),        -- org whose admins should resolve
  approver_project_id UUID REFERENCES projects(id),-- project whose owners should resolve
  approver_user_id UUID REFERENCES auth.users(id), -- specific approver (platform admin)
  subject_type TEXT NOT NULL,
  subject_id UUID NOT NULL,
  status approval_status NOT NULL DEFAULT 'pending',
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  note TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '14 days'
);

CREATE INDEX idx_approvals_pending ON approvals(status, requested_at) WHERE status = 'pending';
CREATE INDEX idx_approvals_requester ON approvals(requester_id, requested_at DESC);
```

### 1.4.11 Quotas

```sql
CREATE TABLE quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'org')),
  subject_id UUID NOT NULL,
  tool_id UUID REFERENCES tools(id) ON DELETE CASCADE,    -- NULL = platform-wide
  period quota_period NOT NULL,
  limit_credits INT NOT NULL CHECK (limit_credits >= 0),
  used_credits INT NOT NULL DEFAULT 0 CHECK (used_credits >= 0),
  reset_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subject_type, subject_id, tool_id, period)
);

CREATE INDEX idx_quotas_subject ON quotas(subject_type, subject_id);
```

### 1.4.12 Emergency access audit

```sql
CREATE TABLE emergency_access_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  target_user_id UUID REFERENCES auth.users(id),
  target_org_id UUID REFERENCES orgs(id),
  target_project_id UUID REFERENCES projects(id),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  notified_target BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_emergency_admin ON emergency_access_events(admin_id, started_at DESC);
```

## 1.5 Triggers

### 1.5.1 Auto-update `updated_at`

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to every table with updated_at:
CREATE TRIGGER trg_orgs_updated BEFORE UPDATE ON orgs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_files_updated BEFORE UPDATE ON files FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tools_updated BEFORE UPDATE ON tools FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### 1.5.2 Auto-increment task ticker_seq

```sql
CREATE OR REPLACE FUNCTION set_task_ticker_seq()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticker_seq IS NULL OR NEW.ticker_seq = 0 THEN
    SELECT COALESCE(MAX(ticker_seq), 0) + 1 INTO NEW.ticker_seq
    FROM tasks WHERE project_id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_task_ticker BEFORE INSERT ON tasks FOR EACH ROW EXECUTE FUNCTION set_task_ticker_seq();
```

### 1.5.3 Auto-add creator as project owner

```sql
CREATE OR REPLACE FUNCTION add_project_creator_as_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO project_members (project_id, user_id, role, added_by)
  VALUES (NEW.id, NEW.created_by, 'owner', NEW.created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_project_creator AFTER INSERT ON projects FOR EACH ROW EXECUTE FUNCTION add_project_creator_as_owner();
```

### 1.5.4 Auto-add org creator as owner

```sql
CREATE OR REPLACE FUNCTION add_org_creator_as_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO org_members (org_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_org_creator AFTER INSERT ON orgs FOR EACH ROW EXECUTE FUNCTION add_org_creator_as_owner();
```

### 1.5.5 Auto-write activity log

Activity is written by the application layer (not triggers) for richer context. Triggers would lose actor attribution when service role is used. See §02 and §03 for where the app writes activity rows.

### 1.5.6 Auto-create profile on new user

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_new_user AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

## 1.6 Helper functions for RLS

These functions simplify RLS policies and are reused everywhere. They are marked `SECURITY INVOKER` (default) and `STABLE` so Postgres can cache results within a query.

```sql
-- Is the current user a member of this org?
CREATE OR REPLACE FUNCTION is_org_member(_org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = _org AND user_id = auth.uid()
  );
$$;

-- Is the current user an org admin or owner?
CREATE OR REPLACE FUNCTION is_org_admin(_org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = _org AND user_id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

-- Is the current user a member of this project?
CREATE OR REPLACE FUNCTION is_project_member(_project UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = _project AND user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM projects p
    JOIN org_members om ON om.org_id = p.org_id
    WHERE p.id = _project
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
  );
$$;

-- Current user's role on this project (NULL if no access)
CREATE OR REPLACE FUNCTION project_role(_project UUID)
RETURNS project_role LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT role FROM project_members
  WHERE project_id = _project AND user_id = auth.uid()
  LIMIT 1;
$$;

-- Current user is project owner or manager (write-level access)
CREATE OR REPLACE FUNCTION is_project_manager(_project UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT project_role(_project) IN ('owner', 'manager')
  OR EXISTS (
    SELECT 1 FROM projects p
    JOIN org_members om ON om.org_id = p.org_id
    WHERE p.id = _project
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
  );
$$;

-- Is current user platform admin AND emergency access active?
CREATE OR REPLACE FUNCTION has_emergency_access()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    (SELECT is_platform_admin FROM profiles WHERE user_id = auth.uid())
    AND current_setting('app.emergency_access', true) = 'true';
$$;

-- Can current user see a file based on its visibility rules?
CREATE OR REPLACE FUNCTION can_see_file(_file files)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT CASE
    WHEN NOT is_project_member(_file.project_id) THEN false
    WHEN _file.deleted_at IS NOT NULL THEN false
    WHEN _file.visibility = 'project' THEN true
    WHEN _file.visibility = 'owners' THEN is_project_manager(_file.project_id)
    WHEN _file.visibility = 'custom' THEN
      auth.uid() = ANY(_file.visibility_users)
      OR project_role(_file.project_id) = ANY(_file.visibility_roles)
    ELSE false
  END;
$$;
```

## 1.7 Row Level Security

Every table has RLS enabled. Default-deny: only explicit policies grant access.

```sql
-- Enable RLS on every user-data table
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_invocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_access_events ENABLE ROW LEVEL SECURITY;
```

### 1.7.1 Orgs

```sql
CREATE POLICY "orgs_select" ON orgs FOR SELECT TO authenticated
USING (is_org_member(id) OR has_emergency_access());

CREATE POLICY "orgs_insert" ON orgs FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "orgs_update" ON orgs FOR UPDATE TO authenticated
USING (is_org_admin(id));

CREATE POLICY "orgs_delete" ON orgs FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM org_members WHERE org_id = orgs.id AND user_id = auth.uid() AND role = 'owner')
);
```

### 1.7.2 Org members

```sql
CREATE POLICY "org_members_select" ON org_members FOR SELECT TO authenticated
USING (is_org_member(org_id) OR user_id = auth.uid() OR has_emergency_access());

CREATE POLICY "org_members_insert" ON org_members FOR INSERT TO authenticated
WITH CHECK (is_org_admin(org_id));

CREATE POLICY "org_members_update" ON org_members FOR UPDATE TO authenticated
USING (is_org_admin(org_id) AND user_id <> auth.uid());

CREATE POLICY "org_members_delete" ON org_members FOR DELETE TO authenticated
USING (
  (is_org_admin(org_id) AND user_id <> auth.uid())
  OR user_id = auth.uid()   -- users can leave
);
```

### 1.7.3 Profiles

```sql
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated
USING (true);  -- profiles are public within the platform (name + avatar)

CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid() AND is_platform_admin IS NOT DISTINCT FROM profiles.is_platform_admin);
-- is_platform_admin can only be set via service role, not by user

CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND is_platform_admin = false);
```

### 1.7.4 Projects

```sql
CREATE POLICY "projects_select" ON projects FOR SELECT TO authenticated
USING (is_project_member(id) OR has_emergency_access());

CREATE POLICY "projects_insert" ON projects FOR INSERT TO authenticated
WITH CHECK (is_org_member(org_id) AND created_by = auth.uid());

CREATE POLICY "projects_update" ON projects FOR UPDATE TO authenticated
USING (is_project_manager(id));

CREATE POLICY "projects_delete" ON projects FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM project_members WHERE project_id = projects.id AND user_id = auth.uid() AND role = 'owner')
  OR is_org_admin(org_id)
);
```

### 1.7.5 Project members

```sql
CREATE POLICY "project_members_select" ON project_members FOR SELECT TO authenticated
USING (is_project_member(project_id) OR user_id = auth.uid() OR has_emergency_access());

CREATE POLICY "project_members_insert" ON project_members FOR INSERT TO authenticated
WITH CHECK (is_project_manager(project_id));

CREATE POLICY "project_members_update" ON project_members FOR UPDATE TO authenticated
USING (is_project_manager(project_id) AND user_id <> auth.uid());

CREATE POLICY "project_members_delete" ON project_members FOR DELETE TO authenticated
USING (
  (is_project_manager(project_id) AND user_id <> auth.uid())
  OR user_id = auth.uid()
);
```

### 1.7.6 Tasks

```sql
CREATE POLICY "tasks_select" ON tasks FOR SELECT TO authenticated
USING (is_project_member(project_id) OR has_emergency_access());

CREATE POLICY "tasks_insert" ON tasks FOR INSERT TO authenticated
WITH CHECK (is_project_member(project_id) AND created_by = auth.uid());

CREATE POLICY "tasks_update" ON tasks FOR UPDATE TO authenticated
USING (
  is_project_manager(project_id)
  OR created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM task_assignees WHERE task_id = tasks.id AND user_id = auth.uid())
);

CREATE POLICY "tasks_delete" ON tasks FOR DELETE TO authenticated
USING (is_project_manager(project_id) OR created_by = auth.uid());
```

### 1.7.7 Task assignees / dependencies

```sql
CREATE POLICY "task_assignees_select" ON task_assignees FOR SELECT TO authenticated
USING (is_project_member((SELECT project_id FROM tasks WHERE id = task_id)));

CREATE POLICY "task_assignees_insert" ON task_assignees FOR INSERT TO authenticated
WITH CHECK (is_project_member((SELECT project_id FROM tasks WHERE id = task_id)));

CREATE POLICY "task_assignees_delete" ON task_assignees FOR DELETE TO authenticated
USING (is_project_member((SELECT project_id FROM tasks WHERE id = task_id)));

CREATE POLICY "task_dependencies_select" ON task_dependencies FOR SELECT TO authenticated
USING (is_project_member((SELECT project_id FROM tasks WHERE id = task_id)));

CREATE POLICY "task_dependencies_insert" ON task_dependencies FOR INSERT TO authenticated
WITH CHECK (is_project_manager((SELECT project_id FROM tasks WHERE id = task_id)));

CREATE POLICY "task_dependencies_delete" ON task_dependencies FOR DELETE TO authenticated
USING (is_project_manager((SELECT project_id FROM tasks WHERE id = task_id)));
```

### 1.7.8 Files

```sql
CREATE POLICY "files_select" ON files FOR SELECT TO authenticated
USING (can_see_file(files.*) OR has_emergency_access());

CREATE POLICY "files_insert" ON files FOR INSERT TO authenticated
WITH CHECK (is_project_member(project_id) AND uploaded_by = auth.uid());

CREATE POLICY "files_update" ON files FOR UPDATE TO authenticated
USING (
  is_project_manager(project_id) OR uploaded_by = auth.uid()
);

CREATE POLICY "files_delete" ON files FOR DELETE TO authenticated
USING (is_project_manager(project_id) OR uploaded_by = auth.uid());

-- file_chunks follows file visibility
CREATE POLICY "file_chunks_select" ON file_chunks FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM files WHERE id = file_chunks.file_id AND can_see_file(files.*))
);

-- file_chunks are written by service role (via indexer); no user-facing write policy needed
```

### 1.7.9 Comments

```sql
CREATE POLICY "comments_select" ON comments FOR SELECT TO authenticated
USING (is_project_member(project_id));

CREATE POLICY "comments_insert" ON comments FOR INSERT TO authenticated
WITH CHECK (is_project_member(project_id) AND created_by = auth.uid());

CREATE POLICY "comments_update" ON comments FOR UPDATE TO authenticated
USING (created_by = auth.uid());

CREATE POLICY "comments_delete" ON comments FOR DELETE TO authenticated
USING (created_by = auth.uid() OR is_project_manager(project_id));
```

### 1.7.10 Activity

```sql
CREATE POLICY "activity_select" ON activity FOR SELECT TO authenticated
USING (
  (project_id IS NOT NULL AND is_project_member(project_id))
  OR (org_id IS NOT NULL AND is_org_member(org_id))
  OR actor_id = auth.uid()
  OR has_emergency_access()
);

-- Activity is insert-only by service role. No user-facing insert policy.
-- No update / delete ever.
```

### 1.7.11 Tools

```sql
CREATE POLICY "tools_select" ON tools FOR SELECT TO authenticated
USING (
  visibility = 'public'
  OR (visibility = 'org' AND is_org_member(owner_org_id))
  OR owner_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM tool_access
    WHERE tool_id = tools.id
      AND (
        (subject_type = 'user' AND subject_id = auth.uid())
        OR (subject_type = 'project' AND is_project_member(subject_id))
        OR (subject_type = 'org' AND is_org_member(subject_id))
      )
      AND (expires_at IS NULL OR expires_at > now())
  )
);

CREATE POLICY "tools_insert" ON tools FOR INSERT TO authenticated
WITH CHECK (owner_user_id = auth.uid() AND is_org_member(owner_org_id));

CREATE POLICY "tools_update" ON tools FOR UPDATE TO authenticated
USING (owner_user_id = auth.uid() OR is_org_admin(owner_org_id));

CREATE POLICY "tools_delete" ON tools FOR DELETE TO authenticated
USING (owner_user_id = auth.uid() OR is_org_admin(owner_org_id));
```

### 1.7.12 Tool versions / access / invocations

```sql
CREATE POLICY "tool_versions_select" ON tool_versions FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM tools WHERE id = tool_versions.tool_id AND owner_user_id = auth.uid())
  -- only the tool owner sees versions/skill_md; the marketplace shows only current_version metadata
);

CREATE POLICY "tool_versions_insert" ON tool_versions FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM tools WHERE id = tool_versions.tool_id AND owner_user_id = auth.uid())
);

CREATE POLICY "tool_access_select" ON tool_access FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM tools WHERE id = tool_access.tool_id AND owner_user_id = auth.uid())
  OR (subject_type = 'user' AND subject_id = auth.uid())
);

CREATE POLICY "tool_access_insert" ON tool_access FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM tools WHERE id = tool_access.tool_id AND owner_user_id = auth.uid())
);

CREATE POLICY "tool_access_delete" ON tool_access FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM tools WHERE id = tool_access.tool_id AND owner_user_id = auth.uid())
);

CREATE POLICY "tool_invocations_select" ON tool_invocations FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM tools WHERE id = tool_invocations.tool_id AND owner_user_id = auth.uid())
  OR has_emergency_access()
);

-- Invocations are written by service role only
```

### 1.7.13 API keys / access tokens

```sql
-- api_keys: visible only to owner, and only metadata (never the ciphertext)
CREATE POLICY "api_keys_select" ON api_keys FOR SELECT TO authenticated
USING (user_id = auth.uid());
-- NOTE: The application layer must project columns to exclude ciphertext/wrapped_dek/iv/tag
-- when returning to clients. Use a view or explicit SELECT list.

CREATE POLICY "api_keys_insert" ON api_keys FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "api_keys_delete" ON api_keys FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- access_tokens: visible only to owner
CREATE POLICY "access_tokens_select" ON access_tokens FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "access_tokens_insert" ON access_tokens FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "access_tokens_update" ON access_tokens FOR UPDATE TO authenticated
USING (user_id = auth.uid());
-- Only revoked_at / revoked_reason may be updated by user; enforce in app layer

-- Safe view for returning api_keys to clients
CREATE VIEW api_keys_public AS
SELECT id, user_id, provider, key_hint, last_used_at, created_at
FROM api_keys;

GRANT SELECT ON api_keys_public TO authenticated;
```

### 1.7.14 Invites / approvals / quotas

```sql
CREATE POLICY "invites_select" ON invites FOR SELECT TO authenticated
USING (
  invited_by = auth.uid()
  OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

CREATE POLICY "invites_insert" ON invites FOR INSERT TO authenticated
WITH CHECK (
  invited_by = auth.uid()
  AND (
    (org_id IS NOT NULL AND is_org_admin(org_id))
    OR (project_id IS NOT NULL AND is_project_manager(project_id))
  )
);

CREATE POLICY "invites_update" ON invites FOR UPDATE TO authenticated
USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));
-- accepting: only the invitee can update (to mark accepted)

CREATE POLICY "approvals_select" ON approvals FOR SELECT TO authenticated
USING (
  requester_id = auth.uid()
  OR approver_user_id = auth.uid()
  OR (approver_org_id IS NOT NULL AND is_org_admin(approver_org_id))
  OR (approver_project_id IS NOT NULL AND is_project_manager(approver_project_id))
);

CREATE POLICY "approvals_insert" ON approvals FOR INSERT TO authenticated
WITH CHECK (requester_id = auth.uid());

CREATE POLICY "approvals_update" ON approvals FOR UPDATE TO authenticated
USING (
  approver_user_id = auth.uid()
  OR (approver_org_id IS NOT NULL AND is_org_admin(approver_org_id))
  OR (approver_project_id IS NOT NULL AND is_project_manager(approver_project_id))
);

CREATE POLICY "quotas_select" ON quotas FOR SELECT TO authenticated
USING (
  (subject_type = 'user' AND subject_id = auth.uid())
  OR (subject_type = 'org' AND is_org_admin(subject_id))
);

-- Quotas written only by service role
```

### 1.7.15 Emergency access

```sql
CREATE POLICY "emergency_access_select" ON emergency_access_events FOR SELECT TO authenticated
USING (
  admin_id = auth.uid()
  OR target_user_id = auth.uid()
  OR (target_org_id IS NOT NULL AND is_org_admin(target_org_id))
  OR (target_project_id IS NOT NULL AND is_project_manager(target_project_id))
);

-- Inserts only by service role when admin triggers emergency access
```

## 1.8 Seed data

Run once per fresh database (after migration):

```sql
-- Seed platform admin (Zack)
-- Supabase will create the auth.users row via magic link first; then run:
UPDATE profiles SET is_platform_admin = true WHERE user_id = '<zack-user-id>';

-- Zack's personal org
INSERT INTO orgs (slug, name, created_by) VALUES
  ('personal-zack', 'Zack Personal', '<zack-user-id>'),
  ('helios', 'HELIOS', '<zack-user-id>');
```

Seed data belongs in `supabase/seed.sql` and runs only in local / staging environments. Production gets seeded manually via admin UI.

## 1.9 Migrations

- Location: `supabase/migrations/NNNNN_name.sql`
- Numbering: timestamp-based (Supabase default: `20260419120000_initial_schema.sql`)
- Never edit a committed migration; add a new one
- Every migration includes its own rollback statement as a comment at the bottom:

```sql
-- Migration: 20260419120000_initial_schema.sql
-- ... schema ...

-- ROLLBACK:
-- DROP TABLE IF EXISTS emergency_access_events, quotas, approvals, invites, access_tokens, api_keys, tool_invocations, tool_access, tool_versions, tools, activity, comments, file_chunks, files, task_dependencies, task_assignees, tasks, project_members, projects, profiles, org_members, orgs CASCADE;
-- DROP TYPE IF EXISTS activity_action, token_scope, quota_period, invocation_status, approval_status, approval_mode, tool_visibility, virus_scan_status, file_visibility, task_status, project_status, project_role, org_role CASCADE;
```

## 1.10 Realtime channels

Supabase Realtime is enabled on tables where clients subscribe. Configure in Supabase dashboard:

| Table | Broadcast | Reason |
|---|---|---|
| tasks | INSERT, UPDATE, DELETE | Live task board |
| task_assignees | INSERT, DELETE | Assignment changes |
| files | INSERT, UPDATE, DELETE | File list updates |
| comments | INSERT, UPDATE, DELETE | Threaded comment UI |
| activity | INSERT | Ticker tape |
| approvals | INSERT, UPDATE | Approval inbox badge |
| tool_invocations | INSERT, UPDATE | Running tool status |

See §07_REALTIME for subscription topology.

## 1.11 Indexes summary

All indexes declared inline above. Summary of composite / partial indexes that matter for performance:

- `projects(org_id) WHERE archived_at IS NULL` — dashboard project list
- `tasks(project_id, status)` — kanban / list views
- `tasks(due_date) WHERE status NOT IN ('done')` — "due soon" queries
- `files(project_id, folder) WHERE deleted_at IS NULL` — file tree
- `file_chunks USING ivfflat (embedding vector_cosine_ops)` — semantic search
- `activity(project_id, created_at DESC)` — ticker tape
- `tool_invocations(user_id, started_at DESC)` — user history

## 1.12 Common pitfalls

- **Do not rely on `auth.uid()` returning non-NULL without `TO authenticated`.** Every policy must specify `TO authenticated` or `TO service_role`. Default `TO public` is a security bug.
- **Never bypass RLS in queries from the app.** Use the anon/authenticated key and let RLS enforce. The service role key is only for internal systems (MCP server writing activity, indexer writing file_chunks, quotas decrement).
- **Do not hard-delete projects, tasks, or files in Phase 1.** Use `archived_at` / `deleted_at`. Hard delete requires a separate "permanent delete" flow with extra confirmation and audit logging.
- **`has_emergency_access()` requires both conditions** — platform_admin AND session setting. Setting one without the other grants nothing.
- **Changes to `is_platform_admin` must be done via service role** with SQL migration or an admin-only endpoint that bypasses RLS deliberately. Never expose it to user updates even if `user_id = auth.uid()` matches.
- **The `files` RLS uses a `can_see_file(files.*)` function** — this passes the whole row. Do not refactor to pass individual columns; GiST / index optimization depends on row-form access.
- **Ticker collisions within an org are prevented by UNIQUE(org_id, ticker).** Do not validate uniqueness in application code as the only guard — rely on the DB constraint and handle the `23505` error.
- **Task `ticker_seq` is set by trigger.** Do not set it from the application. Race conditions are handled by the trigger using `MAX()` — acceptable for low write rate; if you ever exceed ~100 task-inserts/sec per project, switch to a per-project sequence.
- **`access_tokens.token_hash`** is sha256 of the plaintext token. The plaintext is shown to the user exactly once. Do not store plaintext, do not return plaintext after creation.
- **Every RLS policy has been reviewed for the "what if the actor is in a different org" case.** Do not add a policy that allows cross-org access without explicit review.

## 1.13 Module system

Added 2026-05-13. Implements pluggable modules per `MODULE_PLAN.md`.

The module system splits "what the user sees" from "where they are." A
**scope** is a `space` or `terminal` (or the user's global Home).
**Modules** install into a scope and render as tabs inside that scope's
pane. Per-user pinning controls which modules show as tabs vs. live in
the `⋯ More` overflow.

Four tables, all additive — nothing in the existing schema changes.

### 1.13.1 `modules_catalog` — registry of installable module slugs

```sql
CREATE TABLE modules_catalog (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT,                              -- lucide icon name
  scopes TEXT[] NOT NULL,                 -- ['user','space','terminal']
  vertical TEXT NULL,                     -- 'realestate' | 'construction' | NULL
  enabled_by_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE modules_catalog ENABLE ROW LEVEL SECURITY;
-- Catalog is read-only for everyone authenticated. Writes are seed-only
-- (migrations + platform-admin tooling, both via service role).
CREATE POLICY "modules_catalog_read" ON modules_catalog
  FOR SELECT TO authenticated USING (TRUE);
```

Seed at migration time with the five v1 slugs: `tasks`, `files`,
`messenger`, `schedule`, `goals`. Adding a new module slug is a
migration — never application code.

### 1.13.2 `space_modules` — which modules are installed on a space

```sql
CREATE TABLE space_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  slug TEXT NOT NULL REFERENCES modules_catalog(slug),
  display_order INT NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  installed_by UUID NOT NULL REFERENCES auth.users(id),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  UNIQUE (space_id, slug)
);

CREATE INDEX idx_space_modules_space ON space_modules(space_id)
  WHERE archived_at IS NULL;

ALTER TABLE space_modules ENABLE ROW LEVEL SECURITY;
-- Members of the space see installed modules.
CREATE POLICY "space_modules_read" ON space_modules
  FOR SELECT TO authenticated USING (
    space_id IN (SELECT space_id FROM space_members WHERE user_id = auth.uid())
  );
-- Only owners/admins of the space can install or archive.
CREATE POLICY "space_modules_write" ON space_modules
  FOR ALL TO authenticated USING (
    space_id IN (
      SELECT space_id FROM space_members
      WHERE user_id = auth.uid() AND role IN ('owner','admin')
    )
  )
  WITH CHECK (
    space_id IN (
      SELECT space_id FROM space_members
      WHERE user_id = auth.uid() AND role IN ('owner','admin')
    )
  );
```

Archive (`archived_at IS NOT NULL`) is the only "uninstall." Data the
module wrote stays — reinstalling restores it.

### 1.13.3 `terminal_modules` — which modules are installed on a terminal

```sql
CREATE TABLE terminal_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id UUID NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
  slug TEXT NOT NULL REFERENCES modules_catalog(slug),
  display_order INT NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  installed_by UUID NOT NULL REFERENCES auth.users(id),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  UNIQUE (terminal_id, slug)
);

CREATE INDEX idx_terminal_modules_terminal ON terminal_modules(terminal_id)
  WHERE archived_at IS NULL;

ALTER TABLE terminal_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "terminal_modules_read" ON terminal_modules
  FOR SELECT TO authenticated USING (
    terminal_id IN (SELECT terminal_id FROM terminal_members WHERE user_id = auth.uid())
  );
CREATE POLICY "terminal_modules_write" ON terminal_modules
  FOR ALL TO authenticated USING (
    terminal_id IN (
      SELECT terminal_id FROM terminal_members
      WHERE user_id = auth.uid() AND role IN ('owner','manager')
    )
  )
  WITH CHECK (
    terminal_id IN (
      SELECT terminal_id FROM terminal_members
      WHERE user_id = auth.uid() AND role IN ('owner','manager')
    )
  );
```

### 1.13.4 `user_module_pins` — per-user tab order + F-key bindings

```sql
CREATE TABLE user_module_pins (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('user','space','terminal')),
  scope_id UUID NULL,                     -- NULL for scope_kind='user'
  slug TEXT NOT NULL REFERENCES modules_catalog(slug),
  display_order INT NOT NULL,
  fn_key INT NULL CHECK (fn_key IS NULL OR fn_key BETWEEN 5 AND 10),
  PRIMARY KEY (user_id, scope_kind, scope_id, slug)
);

ALTER TABLE user_module_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_module_pins_own" ON user_module_pins
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

Pinning is a personal preference — never visible to other users and
never enforced cross-user. F-key range is 5..10 because F1-F4 are
reserved (Help / Tasks / Files / Tools per the UI design).

### 1.13.5 Permissions matrix

| Action | Who |
|---|---|
| Install/archive module on a space | Space owner or admin |
| Install/archive module on a terminal | Terminal owner or manager |
| Reorder/pin modules (own view) | Any user — `user_module_pins` |
| Create catalog entries | Migration / platform-admin only |

All enforced by RLS above — no application-layer permission checks.

### 1.13.6 Feature flag

A row in the existing `feature_flags` table gates the new UI cutover:

```sql
INSERT INTO feature_flags (key, scope, value, rollout_percentage, description)
VALUES ('pane_shell_enabled', 'global', 'false'::jsonb, 0,
        'Module system pane shell — gates the new sidebar+tabs UI');
```

Off (0% rollout) by default. Per-user overrides (scope = `user`,
`scope_id = <uid>`, `value = true`) let staff dogfood without flipping
for everyone.
