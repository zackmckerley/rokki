-- Web-push subscriptions. Each browser tab that grants notification
-- permission POSTs a PushSubscription to /api/v1/me/push-subscriptions;
-- we dedupe on (user_id, endpoint) so repeated grants are idempotent.

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,  -- ECDH public key, base64url
  auth_secret TEXT NOT NULL,  -- base64url
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can see and delete their own subscriptions. Writes come through the
-- server (which uses service-role) so no INSERT policy for authenticated.
CREATE POLICY "push_subscriptions_self_select" ON push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "push_subscriptions_self_delete" ON push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
