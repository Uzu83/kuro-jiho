import { HomeView } from "@/app/listings/views";
import { loadHome } from "@/lib/listings/load";

export const revalidate = 3600;

export default async function HomePage() {
  const home = await loadHome();
  return <HomeView home={home} />;
}
