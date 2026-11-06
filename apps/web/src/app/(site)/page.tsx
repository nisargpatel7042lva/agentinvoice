import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import "./landing.css";

export const metadata: Metadata = {
  title: "Invoice Agent: get paid today for invoices due next month",
};

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <Landing />;
}
