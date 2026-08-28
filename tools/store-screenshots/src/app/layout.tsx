import type {Metadata} from "next";
import localFont from "next/font/local";
import {Inter} from "next/font/google";
import "./globals.css";

/**
 * The app's own display face, copied from `assets/fonts`, not pulled from
 * Google. The slides and the screenshots inside them have to agree exactly --
 * a near-miss between two dot-matrix faces reads as a rendering fault rather
 * than a style, and Google's copy is free to move version.
 */
const doto = localFont({
    src: [
        {path: "../fonts/Doto-Bold.ttf", weight: "700", style: "normal"},
        {path: "../fonts/Doto-ExtraBold.ttf", weight: "800", style: "normal"}
    ],
    variable: "--font-doto"
});

const mono = localFont({
    src: [{path: "../fonts/SpaceMono-Regular.ttf", weight: "400", style: "normal"}],
    variable: "--font-mono"
});

/** The app's UI face, so headlines are the product's own voice at volume. */
const inter = Inter({subsets: ["latin"], variable: "--font-inter"});

export const metadata: Metadata = {
    title: "XBRW++ - Store screenshots"
};

export default function RootLayout({children}: {children: React.ReactNode}) {
    return (
        <html lang="en">
            <body className={`${doto.variable} ${mono.variable} ${inter.variable}`}>{children}</body>
        </html>
    );
}
