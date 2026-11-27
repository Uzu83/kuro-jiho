import { HomeBoard } from "@/app/listings";
import { loadHome } from "@/lib/articles/surfaces";

export const revalidate = 3600;

export default async function Home() {
  const home = await loadHome(new Date());
  return <HomeBoard today={home.today} slots={home.slots} themes={home.themes} />;
}
