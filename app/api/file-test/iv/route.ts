import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Only return the IV for a file that belongs to a switch this user owns —
  // otherwise any signed-in user could probe/enumerate other users' storage
  // paths via this test endpoint.
  const { data, error } = await supabase
    .from("encrypted_files")
    .select("iv, switches!inner(user_id)")
    .eq("storage_path", path)
    .eq("switches.user_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ iv: data.iv });
}