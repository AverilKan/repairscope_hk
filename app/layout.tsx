import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const configuredSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://repairscope.example";
  const metadataBase = forwardedHost
    ? new URL(
        `${
          requestHeaders.get("x-forwarded-proto") ??
          (forwardedHost.startsWith("127.0.0.1") ||
          forwardedHost.startsWith("localhost")
            ? "http"
            : "https")
        }://${forwardedHost}`,
      )
    : new URL(configuredSiteUrl);

  return {
    metadataBase,
    title: {
      default: "RepairScope — Repair proposals, clarified",
      template: "%s · RepairScope",
    },
    description:
      "Create neutral repair briefs, compare independent contractor proposals and clarify meaningful differences privately.",
    openGraph: {
      title: "RepairScope — Repair proposals, clarified",
      description:
        "From tenant report to neutral brief, comparable proposals and immutable revisions.",
      type: "website",
      images: [
        {
          url: new URL("/og.png", metadataBase).toString(),
          width: 1792,
          height: 897,
          alt: "RepairScope — Repair proposals, clarified",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "RepairScope — Repair proposals, clarified",
      description:
        "Neutral briefs, independent proposals and private questions.",
      images: [new URL("/og.png", metadataBase).toString()],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <div id="main-content">{children}</div>
      </body>
    </html>
  );
}
