"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";

import { authorAvatarProfileFor } from "@/lib/author-avatar-profiles";

type PortraitStyle = CSSProperties & {
  "--portrait-focus-x": string;
  "--portrait-focus-y": string;
  "--portrait-zoom": number;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

export function AuthorAvatar({ author }: { author: string }) {
  const profile = authorAvatarProfileFor(author);
  const [failedAuthor, setFailedAuthor] = useState<string | null>(null);
  const portraitStyle: PortraitStyle | undefined = profile ? {
    "--portrait-focus-x": `${profile.crop.focusX}%`,
    "--portrait-focus-y": `${profile.crop.focusY}%`,
    "--portrait-zoom": profile.crop.zoom,
  } : undefined;

  return (
    <div className="avatar" aria-hidden="true">
      <span className="avatar-initials">{initials(author)}</span>
      {profile && failedAuthor !== author ? (
        <Image
          className="author-portrait"
          src={profile.image}
          alt=""
          width={42}
          height={42}
          style={portraitStyle}
          unoptimized
          onError={() => setFailedAuthor(author)}
        />
      ) : null}
    </div>
  );
}
