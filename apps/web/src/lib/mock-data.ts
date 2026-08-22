export interface MockUser {
  id: string;
  name: string;
  handle: string;
  verified?: boolean;
}

export interface MockPost {
  id: string;
  userId: string;
  time: string;
  text?: string;
  hashtag?: string;
  hue: number;
  likes: number;
  comments: number;
  reposts: number;
  following?: boolean;
}

export interface MockStory {
  userId: string;
  isOwn?: boolean;
}

export interface MockNotification {
  id: string;
  type: "like" | "comment" | "follow";
  userId: string;
  text: string;
  time: string;
  unread?: boolean;
}

export const currentUser: MockUser = {
  id: "u0",
  name: "Alex Razo",
  handle: "alexrazo",
};

export const mockUsers: MockUser[] = [
  { id: "u1", name: "Ana Torres", handle: "anatorres", verified: true },
  { id: "u2", name: "Bruno Diaz", handle: "brunodiaz" },
  { id: "u3", name: "Carla Ruiz", handle: "carlarv", verified: true },
  { id: "u4", name: "Diego Sanz", handle: "dsanz" },
  { id: "u5", name: "Elena Vega", handle: "elenavg" },
];

export const userById = (id: string): MockUser =>
  [...mockUsers, currentUser].find((user) => user.id === id) ?? currentUser;

export const mockPosts: MockPost[] = [
  {
    id: "p1",
    userId: "u1",
    time: "2 h",
    hashtag: "#DisenoNeon",
    likes: 342,
    comments: 18,
    reposts: 27,
    following: true,
    hue: 150,
  },
  {
    id: "p2",
    userId: "u2",
    time: "5 h",
    text: "La nueva paleta de la app esta quedando brutal. Verde neon sobre negro puro.",
    hashtag: "#UI",
    likes: 128,
    comments: 9,
    reposts: 4,
    following: true,
    hue: 200,
  },
  {
    id: "p3",
    userId: "u3",
    time: "8 h",
    hashtag: "#NeonNights",
    likes: 89,
    comments: 3,
    reposts: 1,
    hue: 260,
  },
  {
    id: "p4",
    userId: "u4",
    time: "1 d",
    text: "Probando el feed de R. Se siente rapido y limpio.",
    likes: 56,
    comments: 12,
    reposts: 2,
    following: true,
    hue: 90,
  },
  {
    id: "p5",
    userId: "u5",
    time: "1 d",
    hashtag: "#FotografiaNocturna",
    likes: 210,
    comments: 31,
    reposts: 15,
    hue: 30,
  },
  {
    id: "p6",
    userId: "u1",
    time: "2 d",
    text: "Recordatorio: menos notificaciones, mas conexiones reales.",
    likes: 501,
    comments: 44,
    reposts: 63,
    following: true,
    hue: 170,
  },
];

export const postById = (id: string): MockPost | undefined =>
  mockPosts.find((post) => post.id === id);

export const paraTiPosts = (): MockPost[] => mockPosts;

export const siguiendoPosts = (): MockPost[] => mockPosts.filter((post) => post.following);

export const mockStories: MockStory[] = [
  { userId: "u0", isOwn: true },
  { userId: "u1" },
  { userId: "u2" },
  { userId: "u3" },
  { userId: "u4" },
  { userId: "u5" },
];

export const mockNotifications: MockNotification[] = [
  {
    id: "n1",
    type: "like",
    userId: "u1",
    text: "le gusto tu publicacion",
    time: "10 min",
    unread: true,
  },
  {
    id: "n2",
    type: "follow",
    userId: "u3",
    text: "empezo a seguirte",
    time: "1 h",
    unread: true,
  },
  {
    id: "n3",
    type: "comment",
    userId: "u2",
    text: "comento: esto esta increible",
    time: "3 h",
    unread: true,
  },
  {
    id: "n4",
    type: "like",
    userId: "u4",
    text: "le gusto tu publicacion",
    time: "1 d",
  },
  {
    id: "n5",
    type: "follow",
    userId: "u5",
    text: "empezo a seguirte",
    time: "2 d",
  },
];

export interface ProfileStats {
  posts: number;
  followers: string;
  following: string;
}

export const profileStats: ProfileStats = {
  posts: 128,
  followers: "12.4 k",
  following: "340",
};

export function coverGradient(hue: number): string {
  return `linear-gradient(140deg, oklch(0.17 0.02 ${hue}) 0%, oklch(0.28 0.06 ${hue}) 55%, oklch(0.42 0.13 ${hue}) 100%)`;
}
