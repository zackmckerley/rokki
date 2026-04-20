import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { ToolEditor } from "@/components/ToolEditor";

const DEFAULT_CODE = `// JavaScript runs inside a sandboxed worker with fetch available.
// Export one of: run(input), main(input), or handler(input).
async function run(input) {
  console.log("hello from the tool");
  return { echoed: input };
}
`;

const DEFAULT_INPUT_SCHEMA = `{
  "type": "object",
  "properties": {
    "message": { "type": "string" }
  }
}`;

export default async function NewToolPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar>
        <Link href="/tools" className="text-text-3 hover:text-text-1">
          ← Tools
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">New tool</span>
      </TopBar>
      <main className="mx-auto w-full max-w-6xl flex-1 p-6">
        <h1 className="mb-4 text-xl font-semibold text-text-0">New tool</h1>
        <ToolEditor
          isNew
          initial={{
            slug: "",
            name: "",
            description: "",
            input_schema: DEFAULT_INPUT_SCHEMA,
            output_schema: "",
            code: DEFAULT_CODE,
            timeout_seconds: 10,
            tags: [],
            visibility: "private",
          }}
        />
      </main>
    </div>
  );
}
