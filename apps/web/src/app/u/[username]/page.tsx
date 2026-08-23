import type { Metadata } from "next";

import { PublicProfile } from "@/components/profile/public-profile";

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username} | R` };
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params;
  return <PublicProfile username={username} />;
}
