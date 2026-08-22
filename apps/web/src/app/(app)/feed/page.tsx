import { FeedTabs } from "@/components/feed/feed-tabs";
import { StoryRow } from "@/components/feed/story-row";

export default function FeedPage() {
  return (
    <div className="flex flex-col gap-6">
      <StoryRow />
      <FeedTabs />
    </div>
  );
}
