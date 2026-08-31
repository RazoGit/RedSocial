"use client";

import { useState } from "react";

import { FeedList } from "@/components/feed/feed-list";
import { PostCard } from "@/components/feed/post-card";
import { paraTiPosts } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type FeedTab = "para-ti" | "siguiendo";

const tabs: { value: FeedTab; label: string }[] = [
  { value: "para-ti", label: "Para ti" },
  { value: "siguiendo", label: "Siguiendo" },
];

export function FeedTabs() {
  const [tab, setTab] = useState<FeedTab>("para-ti");
  const posts = paraTiPosts();

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Selector de feed"
        className="border-border grid grid-cols-2 border-b"
      >
        {tabs.map((item) => (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={tab === item.value}
            onClick={() => setTab(item.value)}
            className={cn(
              "border-b-2 pb-3 text-sm font-medium transition-colors",
              tab === item.value
                ? "border-primary text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "para-ti" ? (
        <div className="flex flex-col gap-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <FeedList />
      )}
    </div>
  );
}
