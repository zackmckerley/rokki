import { LoginCanvas } from "./LoginCanvas";

export const metadata = {
  title: "Sign in · Rokki",
};

/**
 * Login page.
 *
 * Cosmos-first paint order: a 4K space-nebula video fills the viewport
 * and starts playing on mount; the wordmark + sign-in form fade in
 * only after the video has a paintable frame. See `LoginCanvas` for
 * the ready-state plumbing.
 */
export default function LoginPage() {
  return <LoginCanvas />;
}
