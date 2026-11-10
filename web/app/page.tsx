import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import Scrawl from "./scrawl";
import "./scrawl.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Scrawl",
  description: "Draw a game level on paper. Meta's Muse Ember turns it into a level you can play, for a fraction of a cent.",
};

export default function Home() {
  return (
    <div className={display.variable}>
      <Scrawl />
    </div>
  );
}
