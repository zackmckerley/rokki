import { SharePageClient } from "./SharePageClient";

interface Props {
  params: Promise<{ token: string }>;
}

/**
 * Public share-link landing page. Unauthenticated by design — the token
 * in the URL is the capability. The client component fetches the signed
 * download URL from /api/v1/share/:token and renders the file inline
 * (PDFs) or offers a download button.
 */
export default async function SharePage({ params }: Props) {
  const { token } = await params;
  return <SharePageClient token={token} />;
}
