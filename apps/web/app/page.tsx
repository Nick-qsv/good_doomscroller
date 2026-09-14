import { Suspense } from "react";

import { Feed } from "@/components/feed";

export default function Home() {
  return (
    <Suspense fallback={<p className="feed-starting" role="status">Opening the library…</p>}>
      <Feed />
    </Suspense>
  );
}
