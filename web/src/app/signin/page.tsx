import { Suspense } from "react";
import AuthPanel from "@/components/auth-panel";

export default function SignInPage() {
  return (
    <Suspense fallback={<main className="loading-page"><span className="loading-heart" aria-hidden="true">♡</span><p>Opening sign in...</p></main>}>
      <AuthPanel />
    </Suspense>
  );
}
