import { redirect } from "next/navigation";

/** The market grid now lives on the home page. Keep old /bets links working. */
export default function Page() {
  redirect("/");
}
