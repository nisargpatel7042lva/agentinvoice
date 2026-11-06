import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import "./landing.css";

export const metadata: Metadata = {
  title: "AgentInvoice: get paid today for invoices due next month",
};

export default function HomePage() {
  return <Landing />;
}
