import type { Metadata } from "next";
import { PolicyDocument } from "@/app/policy/document";

export const metadata: Metadata = {
  title: "編集方針｜クロの時報",
  description: "出典、要約、訂正、商標、ライセンス、プライバシーの方針です。",
};

export default function PolicyPage() {
  return <PolicyDocument />;
}
