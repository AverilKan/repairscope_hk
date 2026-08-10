import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
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
      default: "RepairScope — Help with significant rental-property repairs",
      template: "%s · RepairScope",
    },
    description:
      "Tell RepairScope what has gone wrong. We create a clear repair brief, approach suitable independent contractors and organise their proposals for you.",
    openGraph: {
      title: "Got a significant repair at your rental property?",
      description:
        "Tell us what has gone wrong once. RepairScope helps source suitable contractors and makes their proposals easier to understand.",
      type: "website",
      images: [
        {
          url: new URL("/og.png", metadataBase).toString(),
          width: 1792,
          height: 897,
          alt: "RepairScope helps landlords source contractors for significant repairs",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Got a significant repair at your rental property?",
      description:
        "Tell us what has gone wrong once. We organise the brief, contractor sourcing and responses.",
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
    <ClerkProvider>
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
    </ClerkProvider>
  );
}
