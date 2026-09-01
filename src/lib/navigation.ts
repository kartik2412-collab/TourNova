import type { LucideIcon } from "lucide-react";
import {
  Compass,
  Map,
  Route,
  BadgeIndianRupee,
  Users,
  MapPin,
  Siren,
  BotMessageSquare,
} from "lucide-react";

/**
 * Top-level module navigation for TourNova.
 * Every module maps to a route under /app or is a top-level route.
 * Status marks which modules are real vs placeholder ("coming soon").
 */

export type ModuleStatus = "live" | "coming-soon";

export interface NavModule {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  status: ModuleStatus;
}

export const navModules: NavModule[] = [
  {
    title: "Discover",
    description: "Verified destinations and attractions.",
    href: "/discover",
    icon: Compass,
    status: "live",
  },
  {
    title: "Map",
    description: "Interactive map of verified places.",
    href: "/map",
    icon: Map,
    status: "live",
  },
  {
    title: "Plan",
    description: "Build trip itineraries.",
    href: "/plan",
    icon: Route,
    status: "coming-soon",
  },
  {
    title: "FairPrice",
    description: "Know the price before you pay.",
    href: "/fairprice",
    icon: BadgeIndianRupee,
    status: "coming-soon",
  },
  {
    title: "Crowd",
    description: "Crowd levels at destinations.",
    href: "/crowd",
    icon: Users,
    status: "coming-soon",
  },
  {
    title: "Nearby",
    description: "Verified places near you.",
    href: "/nearby",
    icon: MapPin,
    status: "live",
  },
  {
    title: "Emergency",
    description: "Emergency services and assistance.",
    href: "/emergency",
    icon: Siren,
    status: "coming-soon",
  },
  {
    title: "AI Assistant",
    description: "Ask about destinations, prices, and more.",
    href: "/assistant",
    icon: BotMessageSquare,
    status: "coming-soon",
  },
];
