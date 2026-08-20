import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { SafeAnalytics } from "@/components/SafeAnalytics";
import { LanguageProvider } from "@/components/LanguageContext";
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
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://simplefixhk.com";
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
      default: "修理易 | SimpleFix — 整理維修需要、尋找師傅、比較報價",
      template: "%s · SimpleFix",
    },
    description:
      "屋企有維修？一次過話俾修理易知。我哋幫你整理資料、搵合適師傅同清楚比較不同做法及報價。創始試用期間業主免費。",
    openGraph: {
      title: "屋企有維修？唔使自己逐個師傅追住問。",
      description:
        "修理易香港幫你整理維修、搵合適師傅，再將不同做法及報價整理好，等你清楚比較後自己決定。",
      type: "website",
      images: [
        {
          url: new URL("/og.png", metadataBase).toString(),
          width: 1792,
          height: 897,
          alt: "修理易香港幫物業業主整理維修及比較師傅報價",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "屋企有維修？唔使自己逐個師傅追住問。",
      description:
        "一次過話俾我哋知發生咩事。我哋幫你整理資料、搵合適師傅及比較不同做法。",
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
      {/* Traditional Chinese is the default language, matching
          LanguageProvider's own "zh" default state — the client-side
          effect in LanguageContext.tsx keeps this in sync once the
          visitor actually switches (see its own comment for why this
          can't be resolved server-side: no i18n routing exists). */}
      <html lang="zh-Hant-HK">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          {/* The single, authoritative language provider for the whole
              app — homepage, public shell, questionnaire and every other
              surface share this one instance. Do not add another
              LanguageProvider anywhere else in the tree (see
              components/LandlordApp.tsx, which used to mount its own). */}
          <LanguageProvider>
            <a className="skip-link" href="#main-content">
              跳至主要內容 / Skip to main content
            </a>
            <div id="main-content">{children}</div>
          </LanguageProvider>
          <SafeAnalytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
