"use client";

/**
 * App Store screenshot generator for XBRW++.
 *
 * Renders each slide at Apple's largest required resolution and exports it with
 * `html-to-image`. Everything is sized as a fraction of the canvas width, so a
 * slide designed once exports correctly at every size in `IPHONE_SIZES`.
 *
 * The art direction is the app turned up: the same black, the same magenta, the
 * same dot screen off the icon, the same card accents -- but at a volume the app
 * itself would be obnoxious at. A listing is seen for about a second in a
 * scrolling list, which is a different job from a screen someone uses every
 * morning.
 *
 * `supportsTablet` is false in `app.json`, so Apple asks only for iPhone
 * portrait. There is deliberately no iPad, Android or Feature Graphic path
 * here; the one extra target is a landscape promo banner for Discord.
 */

import {useCallback, useEffect, useLayoutEffect, useRef, useState} from "react";
import {toPng} from "html-to-image";

/* ------------------------------------------------------------------ canvas */

/** iPhone 6.9", the only size Apple now requires. Everything else scales down. */
const W = 1320;
const H = 2868;

/** Discord crops embeds to roughly 16:9, so the promo banner matches. */
const PROMO_W = 1920;
const PROMO_H = 1080;

const IPHONE_SIZES = [
    {label: '6.9"', w: 1320, h: 2868},
    {label: '6.5"', w: 1284, h: 2778},
    {label: '6.3"', w: 1206, h: 2622},
    {label: '6.1"', w: 1125, h: 2436}
] as const;

const PROMO_SIZES = [{label: "Discord banner", w: PROMO_W, h: PROMO_H}] as const;

/* ------------------------------------------------------------------ palette */

/** Lifted from `constants/colors.ts` so the slides cannot drift from the app. */
const C = {
    base: "#000000",
    surface: "#101010",
    raised: "#161616",
    line: "#262626",
    dim: "#A3A3A3",
    text: "#FFFFFF",
    brand: "#FF007F",
    ink: "#0C0C0C"
} as const;

const ACCENT = {
    sky: "#9FC3F0",
    peach: "#F0B98E",
    blossom: "#F0A0AB",
    mint: "#97D8C4",
    lilac: "#BDB2E8",
    oolong: "#DCC194"
} as const;

/* ------------------------------------------------------------------- images */

const SHOTS = ["home", "import", "stages", "read", "hero"] as const;
type Shot = (typeof SHOTS)[number];

const shot = (name: Shot) => `/screenshots/en/${name}.png`;

const IMAGE_PATHS = ["/mockup.png", "/app-icon.png", ...SHOTS.map(shot)];

const imageCache: Record<string, string> = {};

async function preloadAllImages() {
    await Promise.all(
        IMAGE_PATHS.map(async (path) => {
            const resp = await fetch(path);
            if (!resp.ok) throw new Error(`${path} -> ${resp.status}`);
            const blob = await resp.blob();
            imageCache[path] = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });
        })
    );
}

/**
 * `html-to-image` re-fetches every `img` src while cloning the DOM into an SVG
 * `foreignObject`, and those re-fetches race: some hit the cache, some fail
 * silently and leave a transparent rectangle where a phone should be. Handing
 * it a data URI removes the fetch, so there is nothing left to race.
 */
function img(path: string): string {
    return imageCache[path] ?? path;
}

/* -------------------------------------------------------------- phone frame */

const MK_W = 1022;
const MK_H = 2082;
const MK_RATIO = MK_W / MK_H;
const SC_L = (52 / MK_W) * 100;
const SC_T = (46 / MK_H) * 100;
const SC_W = (918 / MK_W) * 100;
const SC_H = (1990 / MK_H) * 100;
const SC_RX = (126 / 918) * 100;
const SC_RY = (126 / 1990) * 100;

function Phone({src, alt, style}: {src: string; alt: string; style?: React.CSSProperties}) {
    return (
        <div style={{position: "relative", aspectRatio: `${MK_W}/${MK_H}`, ...style}}>
            <img
                src={img("/mockup.png")}
                alt=""
                style={{
                    display: "block",
                    width: "100%",
                    height: "100%",
                    // The stock mockup is a warm gold titanium, which reads as a
                    // second brand colour next to the magenta and pulls the eye
                    // off the screen content. Desaturating to near-black keeps
                    // the frame as an outline and lets the app do the talking.
                    filter: "saturate(0.12) brightness(0.5)"
                }}
                draggable={false}
            />
            <div
                style={{
                    position: "absolute",
                    zIndex: 10,
                    overflow: "hidden",
                    left: `${SC_L}%`,
                    top: `${SC_T}%`,
                    width: `${SC_W}%`,
                    height: `${SC_H}%`,
                    borderRadius: `${SC_RX}% / ${SC_RY}%`
                }}>
                <img
                    src={src}
                    alt={alt}
                    style={{
                        display: "block",
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        objectPosition: "top"
                    }}
                    draggable={false}
                />
            </div>
        </div>
    );
}

/* --------------------------------------------------------------- decoration */

/**
 * The dot screen from the app icon, used as a ground texture.
 *
 * A flat gradient would have been easier, but the mark, the `Doto` face, the
 * pour-profile fill and the splash are all the same idea -- an image resolved
 * out of dots -- and these slides are the first thing anyone sees of it.
 */
function DotScreen({
    cW,
    colour,
    size = 0.012
}: {
    cW: number;
    colour: string;
    size?: number;
}) {
    const step = cW * size;
    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                backgroundImage: `radial-gradient(circle, ${colour} ${step * 0.17}px, transparent ${step * 0.19}px)`,
                backgroundSize: `${step}px ${step}px`,
                pointerEvents: "none"
            }}
        />
    );
}

function Glow({
    cW,
    colour,
    x,
    y,
    size,
    opacity
}: {
    cW: number;
    colour: string;
    x: string;
    y: string;
    size: number;
    opacity: number;
}) {
    const d = cW * size;
    return (
        <div
            style={{
                position: "absolute",
                left: x,
                top: y,
                width: d,
                height: d,
                marginLeft: -d / 2,
                marginTop: -d / 2,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${colour} 0%, transparent 70%)`,
                opacity,
                pointerEvents: "none"
            }}
        />
    );
}

/* ------------------------------------------------------------------ caption */

function Eyebrow({cW, children, colour = C.brand}: {cW: number; children: React.ReactNode; colour?: string}) {
    return (
        <div
            style={{
                fontFamily: "var(--font-doto)",
                fontWeight: 800,
                fontSize: cW * 0.032,
                letterSpacing: cW * 0.006,
                color: colour,
                textTransform: "uppercase",
                marginBottom: cW * 0.028
            }}>
            {children}
        </div>
    );
}

function Headline({
    cW,
    children,
    colour = C.text,
    scale = 1
}: {
    cW: number;
    children: React.ReactNode;
    colour?: string;
    scale?: number;
}) {
    return (
        <div
            style={{
                fontFamily: "var(--font-inter)",
                fontWeight: 800,
                fontSize: cW * 0.093 * scale,
                lineHeight: 0.98,
                letterSpacing: `-${cW * 0.0032}px`,
                color: colour
            }}>
            {children}
        </div>
    );
}

/** Top-anchored caption block, the default for a portrait slide. */
function Caption({
    cW,
    eyebrow,
    headline,
    align = "center",
    eyebrowColour,
    scale = 1
}: {
    cW: number;
    eyebrow: React.ReactNode;
    headline: React.ReactNode;
    align?: "center" | "left";
    eyebrowColour?: string;
    scale?: number;
}) {
    return (
        <div
            style={{
                position: "absolute",
                top: cW * 0.13,
                left: cW * 0.085,
                right: cW * 0.085,
                textAlign: align,
                zIndex: 5
            }}>
            <Eyebrow cW={cW} colour={eyebrowColour}>
                {eyebrow}
            </Eyebrow>
            <Headline cW={cW} scale={scale}>
                {headline}
            </Headline>
        </div>
    );
}

/* ------------------------------------------------------------------- slides */

type SlideProps = {cW: number; cH: number};
type SlideDef = {id: string; component: (p: SlideProps) => React.JSX.Element};

const frame: React.CSSProperties = {
    width: "100%",
    height: "100%",
    position: "relative",
    overflow: "hidden",
    background: C.base
};

/** 1 - Hero. The one slide most people will ever see. */
const slideHero: SlideDef = {
    id: "hero",
    component: ({cW, cH}) => (
        <div style={frame}>
            <Glow cW={cW} colour={C.brand} x="50%" y="78%" size={1.5} opacity={0.42} />
            <Glow cW={cW} colour={ACCENT.blossom} x="12%" y="18%" size={0.8} opacity={0.14} />
            <DotScreen cW={cW} colour="rgba(255,255,255,0.10)" />
            <Caption
                cW={cW}
                eyebrow="XBRW++"
                headline={
                    <>
                        Rewrite the card
                        <br />
                        that came with
                        <br />
                        <span style={{color: C.brand}}>your</span> coffee.
                    </>
                }
            />
            <Phone
                src={img(shot("home"))}
                alt="Recipe library"
                style={{
                    position: "absolute",
                    bottom: 0,
                    width: "84%",
                    left: "50%",
                    transform: "translateX(-50%) translateY(8%)"
                }}
            />
        </div>
    )
};

/** 2 - Import. A four-step spine down the left, phone entering from the right. */
const IMPORT_STEPS = ["Paste a link.", "Write the card.", "Tap it.", "Brew it."];

const slideImport: SlideDef = {
    id: "import",
    component: ({cW, cH}) => (
        <div style={frame}>
            <Glow cW={cW} colour={ACCENT.sky} x="80%" y="30%" size={1.3} opacity={0.3} />
            <Glow cW={cW} colour={C.brand} x="5%" y="88%" size={1.0} opacity={0.28} />
            <DotScreen cW={cW} colour="rgba(255,255,255,0.09)" />
            <Caption
                cW={cW}
                eyebrow="Import"
                align="left"
                eyebrowColour={ACCENT.sky}
                headline={
                    <>
                        Link in.
                        <br />
                        <span style={{color: ACCENT.sky}}>Coffee out.</span>
                    </>
                }
            />
            <div
                style={{
                    position: "absolute",
                    top: cH * 0.235,
                    left: cW * 0.075,
                    zIndex: 6,
                    background: C.raised,
                    border: `${cW * 0.0022}px solid ${C.line}`,
                    borderRadius: cW * 0.028,
                    padding: `${cW * 0.022}px ${cW * 0.032}px`,
                    fontFamily: "var(--font-mono)",
                    fontSize: cW * 0.026,
                    color: C.dim,
                    transform: "rotate(-3deg)",
                    boxShadow: `0 ${cW * 0.02}px ${cW * 0.06}px rgba(0,0,0,0.7)`
                }}>
                xbloom.com/share/<span style={{color: ACCENT.sky}}>a1f9c2</span>
            </div>
            <div
                style={{
                    position: "absolute",
                    top: cH * 0.345,
                    left: cW * 0.085,
                    width: cW * 0.44,
                    zIndex: 6,
                    display: "flex",
                    flexDirection: "column",
                    gap: cH * 0.028
                }}>
                {IMPORT_STEPS.map((step, i) => (
                    <div key={step} style={{display: "flex", alignItems: "center", gap: cW * 0.035}}>
                        <div
                            style={{
                                position: "relative",
                                flexShrink: 0,
                                width: cW * 0.072,
                                height: cW * 0.072,
                                borderRadius: cW * 0.018,
                                background: i === IMPORT_STEPS.length - 1 ? ACCENT.sky : "transparent",
                                border: `${cW * 0.004}px solid ${ACCENT.sky}`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: "var(--font-mono)",
                                fontWeight: 700,
                                fontSize: cW * 0.032,
                                color: i === IMPORT_STEPS.length - 1 ? C.ink : ACCENT.sky
                            }}>
                            {i + 1}
                            {/* Dotted spine joining the markers, in the same dot
                                language as the background screen and the icon. */}
                            {i < IMPORT_STEPS.length - 1 && (
                                <div
                                    style={{
                                        position: "absolute",
                                        top: "100%",
                                        left: "50%",
                                        width: cW * 0.006,
                                        height: cH * 0.028,
                                        transform: "translateX(-50%)",
                                        backgroundImage: `radial-gradient(${ACCENT.sky} 45%, transparent 46%)`,
                                        backgroundSize: `${cW * 0.006}px ${cW * 0.014}px`,
                                        opacity: 0.55
                                    }}
                                />
                            )}
                        </div>
                        <div
                            style={{
                                fontFamily: "var(--font-inter)",
                                fontWeight: 700,
                                fontSize: cW * 0.042,
                                letterSpacing: `-${cW * 0.0008}px`,
                                color: i === IMPORT_STEPS.length - 1 ? C.text : C.dim,
                                whiteSpace: "nowrap"
                            }}>
                            {step}
                        </div>
                    </div>
                ))}
            </div>
            <Phone
                src={img(shot("import"))}
                alt="Import sheet"
                style={{
                    position: "absolute",
                    bottom: 0,
                    width: "60%",
                    right: "-14%",
                    transform: "translateY(2%) rotate(3deg)"
                }}
            />
        </div>
    )
};

/** 3 - Editor. Two phones layered, to say "there is a lot in here". */
const slideStages: SlideDef = {
    id: "stages",
    component: ({cW, cH}) => (
        <div style={frame}>
            <Glow cW={cW} colour={ACCENT.peach} x="30%" y="72%" size={1.4} opacity={0.3} />
            <Glow cW={cW} colour={ACCENT.oolong} x="88%" y="20%" size={0.9} opacity={0.18} />
            <DotScreen cW={cW} colour="rgba(255,255,255,0.09)" />
            <Caption
                cW={cW}
                eyebrow="Every stage"
                eyebrowColour={ACCENT.peach}
                scale={0.86}
                headline={
                    <>
                        Change one degree.
                        <br />
                        Or <span style={{color: ACCENT.peach}}>everything</span>.
                    </>
                }
            />
            <Phone
                src={img(shot("hero"))}
                alt="Recipe editor"
                style={{
                    position: "absolute",
                    bottom: 0,
                    width: "58%",
                    left: "-10%",
                    transform: "translateY(-4%) rotate(-8deg)",
                    opacity: 0.5
                }}
            />
            <Phone
                src={img(shot("stages"))}
                alt="Pour stages"
                style={{
                    position: "absolute",
                    bottom: 0,
                    width: "78%",
                    right: "-4%",
                    transform: "translateY(5%)"
                }}
            />
        </div>
    )
};

/** 4 - Read. Contactless arcs behind the phone, echoing the scan overlay. */
const slideRead: SlideDef = {
    id: "read",
    component: ({cW, cH}) => (
        <div style={frame}>
            <Glow cW={cW} colour={ACCENT.mint} x="50%" y="62%" size={1.5} opacity={0.32} />
            <DotScreen cW={cW} colour="rgba(255,255,255,0.09)" />
            {[0.78, 1.02, 1.26, 1.5].map((s, i) => (
                <div
                    key={s}
                    style={{
                        position: "absolute",
                        left: "50%",
                        top: cH * 0.46,
                        width: cW * s,
                        height: cW * s,
                        marginLeft: -(cW * s) / 2,
                        marginTop: -(cW * s) / 2,
                        borderRadius: "50%",
                        border: `${cW * 0.0035}px solid ${ACCENT.mint}`,
                        opacity: 0.5 - i * 0.1,
                        pointerEvents: "none"
                    }}
                />
            ))}
            <Caption
                cW={cW}
                eyebrow="Read"
                eyebrowColour={ACCENT.mint}
                headline={
                    <>
                        Tap a card.
                        <br />
                        <span style={{color: ACCENT.mint}}>Keep</span> the recipe.
                    </>
                }
            />
            <Phone
                src={img(shot("read"))}
                alt="Scanning a card"
                style={{
                    position: "absolute",
                    bottom: 0,
                    width: "84%",
                    left: "50%",
                    transform: "translateX(-50%) translateY(8%)"
                }}
            />
        </div>
    )
};

/**
 * 5 - Privacy. The contrast slide: inverted, no device, all type.
 *
 * The headline is the app's own ticker line. It is the loudest thing XBRW++
 * says about itself, and a listing that buries "no account" under a screenshot
 * of a settings screen is throwing away the clearest reason to choose it.
 */
const slidePrivacy: SlideDef = {
    id: "privacy",
    component: ({cW, cH}) => (
        <div style={{...frame, background: C.brand}}>
            <DotScreen cW={cW} colour="rgba(0,0,0,0.22)" size={0.016} />
            <Glow cW={cW} colour="rgba(255,255,255,0.55)" x="50%" y="2%" size={1.4} opacity={0.3} />
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: cW * 0.06,
                    zIndex: 5
                }}>
                <img
                    src={img("/app-icon.png")}
                    alt=""
                    style={{
                        width: cW * 0.19,
                        height: cW * 0.19,
                        borderRadius: cW * 0.042,
                        marginBottom: cW * 0.09,
                        boxShadow: `0 ${cW * 0.015}px ${cW * 0.05}px rgba(0,0,0,0.35)`
                    }}
                    draggable={false}
                />
                <div
                    style={{
                        fontFamily: "var(--font-doto)",
                        fontWeight: 800,
                        fontSize: cW * 0.112,
                        lineHeight: 1.12,
                        color: C.ink,
                        textAlign: "center",
                        // Doto is a wide face: let a line that no longer fits
                        // overflow visibly rather than silently rewrap into a
                        // ragged "NO / ACCOUNT." that reads as a fourth line.
                        whiteSpace: "nowrap",
                        textTransform: "uppercase"
                    }}>
                    No cloud.
                    <br />
                    No account.
                    <br />
                    No thanks.
                </div>
                <div
                    style={{
                        marginTop: cH * 0.045,
                        fontFamily: "var(--font-mono)",
                        fontSize: cW * 0.034,
                        lineHeight: 1.5,
                        color: "rgba(0,0,0,0.72)",
                        textAlign: "center",
                        maxWidth: cW * 0.76
                    }}>
                    Your recipes stay on your phone. No sync, no analytics, no sign-up.
                </div>
            </div>
        </div>
    )
};

const SLIDES: SlideDef[] = [slideHero, slideImport, slideStages, slideRead, slidePrivacy];

/* -------------------------------------------------------------- promo image */

/**
 * Landscape banner for Discord recruitment. Not a store asset -- Apple never
 * sees this -- so it carries the repo URL and the "testers wanted" framing that
 * would be out of place on a listing.
 */
const promoSlide: SlideDef = {
    id: "promo",
    component: ({cW, cH}) => {
        const fan: {name: Shot; left: string; scale: number; rotate: number; z: number; opacity: number}[] = [
            {name: "stages", left: "63%", scale: 0.84, rotate: -9, z: 1, opacity: 0.7},
            {name: "read", left: "87%", scale: 0.84, rotate: 9, z: 1, opacity: 0.7},
            {name: "home", left: "75%", scale: 1, rotate: 0, z: 2, opacity: 1}
        ];
        const base = cH * 0.88 * MK_RATIO;
        return (
            <div style={frame}>
                <Glow cW={cW} colour={C.brand} x="73%" y="55%" size={0.9} opacity={0.4} />
                <Glow cW={cW} colour={ACCENT.sky} x="18%" y="92%" size={0.6} opacity={0.16} />
                <DotScreen cW={cW} colour="rgba(255,255,255,0.09)" size={0.008} />
                <div
                    style={{
                        position: "absolute",
                        top: "50%",
                        left: cW * 0.055,
                        width: cW * 0.5,
                        marginTop: -cH * 0.29,
                        zIndex: 5
                    }}>
                    <div style={{display: "flex", alignItems: "center", gap: cW * 0.018, marginBottom: cW * 0.03}}>
                        <img
                            src={img("/app-icon.png")}
                            alt=""
                            style={{width: cW * 0.062, height: cW * 0.062, borderRadius: cW * 0.014}}
                            draggable={false}
                        />
                        <div
                            style={{
                                fontFamily: "var(--font-doto)",
                                fontWeight: 800,
                                fontSize: cW * 0.042,
                                color: C.text,
                                letterSpacing: cW * 0.002
                            }}>
                            XBRW++
                        </div>
                    </div>
                    <div
                        style={{
                            fontFamily: "var(--font-inter)",
                            fontWeight: 800,
                            fontSize: cW * 0.044,
                            lineHeight: 1.05,
                            letterSpacing: `-${cW * 0.0018}px`,
                            color: C.text
                        }}>
                        Rewrite the card that
                        <br />
                        came with <span style={{color: C.brand}}>your</span> coffee.
                    </div>
                    <div
                        style={{
                            marginTop: cW * 0.026,
                            fontFamily: "var(--font-mono)",
                            fontSize: cW * 0.021,
                            lineHeight: 1.55,
                            color: C.dim,
                            maxWidth: cW * 0.46
                        }}>
                        Read, edit and write xBloom recipe cards from your phone. No account, no
                        cloud, no analytics.
                    </div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: cW * 0.016,
                            marginTop: cW * 0.03
                        }}>
                        <span
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: cW * 0.018,
                                color: C.ink,
                                background: C.brand,
                                borderRadius: cW * 0.05,
                                padding: `${cW * 0.011}px ${cW * 0.024}px`,
                                fontWeight: 700,
                                whiteSpace: "nowrap"
                            }}>
                            TESTERS WANTED
                        </span>
                        <span
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: cW * 0.018,
                                color: C.dim,
                                whiteSpace: "nowrap"
                            }}>
                            github.com/hessius/XBRecipeWriterPlus
                        </span>
                    </div>
                </div>
                {fan.map((f) => (
                    <Phone
                        key={f.name}
                        src={img(shot(f.name))}
                        alt=""
                        style={{
                            position: "absolute",
                            top: cH * 0.5,
                            left: f.left,
                            width: base * f.scale,
                            zIndex: f.z,
                            opacity: f.opacity,
                            transform: `translate(-50%, -46%) rotate(${f.rotate}deg)`
                        }}
                    />
                ))}
            </div>
        );
    }
};

/* ------------------------------------------------------------------ preview */

function ScreenshotPreview({cW, cH, children}: {cW: number; cH: number; children: React.ReactNode}) {
    const boxRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(0.1);

    useLayoutEffect(() => {
        const box = boxRef.current;
        if (!box) return;
        const fit = () => setScale(box.clientWidth / cW);
        fit();
        const ro = new ResizeObserver(fit);
        ro.observe(box);
        return () => ro.disconnect();
    }, [cW]);

    return (
        <div ref={boxRef} style={{width: "100%", aspectRatio: `${cW}/${cH}`, overflow: "hidden"}}>
            <div style={{width: cW, height: cH, transform: `scale(${scale})`, transformOrigin: "top left"}}>
                {children}
            </div>
        </div>
    );
}

/* --------------------------------------------------------------------- page */

type Target = "iphone" | "promo";

export default function ScreenshotsPage() {
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [target, setTarget] = useState<Target>("iphone");
    const [sizeIdx, setSizeIdx] = useState(0);
    const [exporting, setExporting] = useState<string | null>(null);
    /**
     * Headless capture mode. `?only=<id>&w=&h=` renders a single slide at exact
     * canvas size with no toolbar, so Playwright can size a viewport to match
     * and screenshot the page directly. That path never touches
     * `html-to-image`, so it cannot inherit its cloning quirks.
     */
    const [only, setOnly] = useState<{id: string; w: number; h: number} | null>(null);
    const exportRefs = useRef<(HTMLDivElement | null)[]>([]);

    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        const id = q.get("only");
        if (id) {
            setOnly({id, w: Number(q.get("w")), h: Number(q.get("h"))});
        }
        preloadAllImages()
            .then(() => setReady(true))
            .catch((e: Error) => setError(e.message));
    }, []);

    const isPromo = target === "promo";
    const cW = isPromo ? PROMO_W : W;
    const cH = isPromo ? PROMO_H : H;
    const sizes: readonly {label: string; w: number; h: number}[] = isPromo ? PROMO_SIZES : IPHONE_SIZES;
    const slides = isPromo ? [promoSlide] : SLIDES;

    const captureSlide = useCallback(async (el: HTMLElement, w: number, h: number) => {
        el.style.left = "0px";
        el.style.zIndex = "-1";
        const opts = {width: w, height: h, pixelRatio: 1, cacheBust: true};
        // The first pass is a warm-up: it forces fonts and any not-yet-decoded
        // image through the cloning path. Only the second reliably comes back
        // fully painted.
        await toPng(el, opts);
        const dataUrl = await toPng(el, opts);
        el.style.left = "-9999px";
        el.style.zIndex = "";
        return dataUrl;
    }, []);

    const exportAll = useCallback(async () => {
        const size = sizes[sizeIdx];
        for (let i = 0; i < slides.length; i++) {
            setExporting(`${i + 1}/${slides.length}`);
            const el = exportRefs.current[i];
            if (!el) continue;
            const dataUrl = await captureSlide(el, size.w, size.h);
            const a = document.createElement("a");
            a.href = dataUrl;
            a.download = `${String(i + 1).padStart(2, "0")}-${slides[i].id}-en-${size.w}x${size.h}.png`;
            a.click();
            await new Promise((r) => setTimeout(r, 300));
        }
        setExporting(null);
    }, [captureSlide, sizeIdx, sizes, slides]);

    if (error) {
        return (
            <p style={{padding: 32, fontFamily: "monospace", color: "#b91c1c", lineHeight: 1.6}}>
                Could not load an image: {error}
                <br />
                Drop the device captures into <code>public/screenshots/en/</code> as{" "}
                {SHOTS.map((s) => `${s}.png`).join(", ")}.
            </p>
        );
    }
    if (!ready) return <p style={{padding: 32, fontFamily: "monospace"}}>Loading images...</p>;

    if (only) {
        const found = [...SLIDES, promoSlide].find((s) => s.id === only.id);
        if (!found) return <p style={{padding: 32, fontFamily: "monospace"}}>No slide named {only.id}</p>;
        return (
            <div id="shot" style={{width: only.w, height: only.h, overflow: "hidden"}}>
                {found.component({cW: only.w, cH: only.h})}
            </div>
        );
    }

    return (
        <div style={{minHeight: "100vh", background: "#f3f4f6", position: "relative", overflowX: "hidden"}}>
            <div
                style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 50,
                    background: "white",
                    borderBottom: "1px solid #e5e7eb",
                    display: "flex",
                    alignItems: "center"
                }}>
                <div
                    style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 16px",
                        overflowX: "auto",
                        minWidth: 0
                    }}>
                    <span style={{fontWeight: 700, fontSize: 14, whiteSpace: "nowrap"}}>
                        XBRW++ store screenshots
                    </span>
                    <div style={{display: "flex", gap: 4, background: "#f3f4f6", borderRadius: 8, padding: 4}}>
                        {(["iphone", "promo"] as Target[]).map((t) => (
                            <button
                                key={t}
                                onClick={() => {
                                    setTarget(t);
                                    setSizeIdx(0);
                                }}
                                style={{
                                    padding: "4px 14px",
                                    borderRadius: 6,
                                    border: "none",
                                    cursor: "pointer",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    whiteSpace: "nowrap",
                                    background: target === t ? "white" : "transparent",
                                    color: target === t ? "#2563eb" : "#6b7280"
                                }}>
                                {t === "iphone" ? "iPhone" : "Discord promo"}
                            </button>
                        ))}
                    </div>
                    <select
                        value={sizeIdx}
                        onChange={(e) => setSizeIdx(Number(e.target.value))}
                        style={{fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 10px"}}>
                        {sizes.map((s, i) => (
                            <option key={s.label} value={i}>
                                {s.label} - {s.w}x{s.h}
                            </option>
                        ))}
                    </select>
                </div>
                <div style={{flexShrink: 0, padding: "10px 16px", borderLeft: "1px solid #e5e7eb"}}>
                    <button
                        onClick={exportAll}
                        disabled={!!exporting}
                        style={{
                            padding: "7px 20px",
                            background: exporting ? "#93c5fd" : "#2563eb",
                            color: "white",
                            border: "none",
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: exporting ? "default" : "pointer",
                            whiteSpace: "nowrap"
                        }}>
                        {exporting ? `Exporting... ${exporting}` : "Export all"}
                    </button>
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: isPromo ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))",
                    gap: 20,
                    padding: 20,
                    maxWidth: isPromo ? 1180 : undefined
                }}>
                {slides.map((s, i) => (
                    <div
                        key={s.id}
                        style={{
                            background: "white",
                            borderRadius: 12,
                            overflow: "hidden",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.12)"
                        }}>
                        <ScreenshotPreview cW={cW} cH={cH}>
                            {s.component({cW, cH})}
                        </ScreenshotPreview>
                        <div style={{padding: "8px 12px", fontSize: 12, color: "#6b7280", fontFamily: "monospace"}}>
                            {String(i + 1).padStart(2, "0")} · {s.id}
                        </div>
                    </div>
                ))}
            </div>

            {/* Offscreen, at true resolution. Zero-sized `overflow: hidden`
                wrapper so these cannot create a scrollbar or steal a click. */}
            <div style={{position: "absolute", top: 0, left: 0, width: 0, height: 0, overflow: "hidden"}}>
                {slides.map((s, i) => (
                    <div
                        key={s.id}
                        ref={(el) => {
                            exportRefs.current[i] = el;
                        }}
                        style={{position: "absolute", left: -9999, top: 0, width: cW, height: cH}}>
                        {s.component({cW, cH})}
                    </div>
                ))}
            </div>
        </div>
    );
}
