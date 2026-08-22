import { Plus } from "lucide-react";

import { UserAvatar } from "@/components/user";
import { currentUser, mockStories, userById } from "@/lib/mock-data";

export function StoryRow() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {mockStories.map((story) => {
        const user = userById(story.userId);
        const isOwn = story.isOwn === true;
        return (
          <button
            key={story.userId}
            type="button"
            className="flex w-16 shrink-0 flex-col items-center gap-1.5"
          >
            <span
              className={
                isOwn
                  ? "border-primary/60 text-primary relative flex size-14 items-center justify-center rounded-full border-2 border-dashed"
                  : "ring-primary/70 ring-background block rounded-full p-0.5 ring-2 ring-offset-2 ring-offset-background"
              }
            >
              {isOwn ? (
                <>
                  <UserAvatar name={currentUser.name} className="size-12" />
                  <Plus className="bg-primary text-primary-foreground absolute right-0 bottom-0 size-5 rounded-full p-0.5" />
                </>
              ) : (
                <UserAvatar name={user.name} className="size-14" />
              )}
            </span>
            <span className="text-muted-foreground w-16 truncate text-xs">
              {isOwn ? "Tu historia" : user.name.split(" ")[0]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
