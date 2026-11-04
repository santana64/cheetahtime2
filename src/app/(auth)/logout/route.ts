import { redirect } from "next/navigation";
import { logoutAction } from "@/features/auth/actions";

// GET must stay side-effect free (link prefetching, crawlers, <img src>):
// it only sends the user to the login page.
export async function GET() {
  redirect("/login");
}

export async function POST() {
  await logoutAction();
}
