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

const SHOTS = [
    "home",
    "stages",
    "read",
    "hero",
    "recipe",
    "brew",
    "history",
    "historylist",
    "compare",
    "hub",
    "shelves"
] as const;
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

/**
 * 1 - Hero. The one slide most people will ever see.
 *
 * Three phones rather than one, because the app is no longer one thing. The
 * order left to right is the arc of the whole product -- read a card, rewrite
 * it, brew it.
 *
 * The headline used to be "Rewrite the card that came with your coffee", which
 * promised the cards alone and was true when the cards were all there was. It
 * is now the smallest thing in here, and a first slide that sells it is selling
 * the 1.x app. This line is the store subtitle word for word, so the two
 * loudest pieces of type on the product page say one thing rather than two.
 */
const HERO_FAN: {name: Shot; alt: string; left: string; scale: number; rotate: number; z: number; opacity: number}[] = [
    {name: "home", alt: "Recipe library", left: "21%", scale: 0.88, rotate: -9, z: 1, opacity: 0.62},
    {name: "brew", alt: "A brew in progress", left: "79%", scale: 0.88, rotate: 9, z: 1, opacity: 0.62},
    {name: "hero", alt: "Recipe editor", left: "50%", scale: 1, rotate: 0, z: 2, opacity: 1}
];

const slideHero: SlideDef = {
    id: "hero",
    component: ({cW, cH}) => {
        const base = cW * 0.72;
        return (
            <div style={frame}>
                <Glow cW={cW} colour={C.brand} x="50%" y="72%" size={1.6} opacity={0.42} />
                <Glow cW={cW} colour={ACCENT.blossom} x="12%" y="18%" size={0.8} opacity={0.14} />
                <DotScreen cW={cW} colour="rgba(255,255,255,0.10)" />
                <Caption
                    cW={cW}
                    eyebrow="XBRW++"
                    headline={
                        <>
                            Your xBloom,
                            <br />
                            <span style={{color: C.brand}}>unleashed</span>.
                        </>
                    }
                />
                {HERO_FAN.map((f) => (
                    <Phone
                        key={f.name}
                        src={img(shot(f.name))}
                        alt={f.alt}
                        style={{
                            position: "absolute",
                            top: cH * 0.62,
                            left: f.left,
                            width: base * f.scale,
                            zIndex: f.z,
                            opacity: f.opacity,
                            transform: `translate(-50%, -42%) rotate(${f.rotate}deg)`
                        }}
                    />
                ))}
            </div>
        );
    }
};

/**
 * 6 - Library. What the app becomes once you have used it for a month.
 *
 * The wall of tinted cards behind the phone is the point of the slide: the
 * library outgrows the cards it started from, and a single centred phone on an
 * empty ground would have said only "here is a list screen". The tints are the
 * six cup-type accents, so the texture is the app's own vocabulary rather than
 * decoration invented for a listing.
 */
function CardWall({cW, cH}: {cW: number; cH: number}) {
    const tints = Object.values(ACCENT);
    const cardW = cW * 0.105;
    const cardH = cardW * 1.5;
    const gap = cW * 0.028;
    const cols = Math.ceil((cW * 1.5) / (cardW + gap));
    const rows = Math.ceil((cH * 1.2) / (cardH + gap));
    return (
        <div
            style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: cW * 1.5,
                height: cH * 1.2,
                transform: "translate(-50%, -50%) rotate(-8deg)",
                pointerEvents: "none"
            }}>
            {Array.from({length: rows}).map((_, r) => (
                <div key={r} style={{display: "flex", gap, marginBottom: gap, marginLeft: r % 2 ? cardW * 0.5 : 0}}>
                    {Array.from({length: cols}).map((_, c) => (
                        <div
                            key={c}
                            style={{
                                width: cardW,
                                height: cardH,
                                flexShrink: 0,
                                borderRadius: cW * 0.014,
                                background: tints[(r * cols + c) % tints.length],
                                opacity: 0.14
                            }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

const slideLibrary: SlideDef = {
    id: "library",
    component: ({cW, cH}) => (
        <div style={frame}>
            <CardWall cW={cW} cH={cH} />
            <Glow cW={cW} colour={ACCENT.lilac} x="50%" y="80%" size={1.5} opacity={0.3} />
            <Glow cW={cW} colour={C.base} x="50%" y="8%" size={1.8} opacity={0.75} />
            {/* Sinks the wall behind the phone: without it the tiles and the
                recipe rows inside the capture compete at the same scale. */}
            <Glow cW={cW} colour={C.base} x="50%" y="66%" size={1.7} opacity={0.85} />
            <DotScreen cW={cW} colour="rgba(255,255,255,0.09)" />
            <Caption
                cW={cW}
                eyebrow="Your library"
                eyebrowColour={ACCENT.lilac}
                scale={0.88}
                headline={
                    <>
                        Cards you read.
                        <br />
                        Links you found.
                        <br />
                        Recipes <span style={{color: ACCENT.lilac}}>you wrote</span>.
                    </>
                }
            />
            <Phone
                src={img(shot("home"))}
                alt="Recipe library"
                style={{
                    position: "absolute",
                    bottom: 0,
                    width: "82%",
                    left: "50%",
                    transform: "translateX(-50%) translateY(10%)"
                }}
            />
        </div>
    )
};

/**
 * 2 - Brew. The feature that turned a card writer into an app you open daily.
 *
 * The rising dotted trace behind the phone is the brew graph pulled out of the
 * screen and drawn at slide scale, so the idea survives being seen at thumbnail
 * size where the real chart inside the phone is four pixels tall. The phone is
 * tilted and pushed off centre because the two slides either side of it are
 * upright and centred.
 */
function TraceMotif({
    cW,
    cH,
    colour,
    opacity = 1
}: {
    cW: number;
    cH: number;
    colour: string;
    opacity?: number;
}) {
    const pts: [number, number][] = [
        [-0.04, 0.9],
        [0.16, 0.72],
        [0.3, 0.7],
        [0.48, 0.48],
        [0.62, 0.46],
        [0.8, 0.22],
        [1.04, 0.16]
    ];
    const path = pts.map(([x, y], i) => `${i ? "L" : "M"}${x * cW} ${y * cH}`).join(" ");
    return (
        <svg
            width={cW}
            height={cH}
            style={{position: "absolute", inset: 0, opacity, pointerEvents: "none"}}
            aria-hidden="true">
            <path
                d={path}
                fill="none"
                stroke={colour}
                strokeWidth={cW * 0.006}
                strokeLinecap="round"
                strokeDasharray={`${cW * 0.001} ${cW * 0.026}`}
                opacity={0.55}
            />
            {pts.slice(1, -1).map(([x, y]) => (
                <circle key={`${x}`} cx={x * cW} cy={y * cH} r={cW * 0.011} fill={colour} opacity={0.75} />
            ))}
        </svg>
    );
}

const slideBrew: SlideDef = {
    id: "brew",
    component: ({cW, cH}) => (
        <div style={frame}>
            <Glow cW={cW} colour={C.brand} x="62%" y="58%" size={1.7} opacity={0.4} />
            <DotScreen cW={cW} colour="rgba(255,255,255,0.09)" />
            <div style={{position: "absolute", left: 0, top: cH * 0.19, width: cW, height: cH * 0.4}}>
                <TraceMotif cW={cW} cH={cH * 0.4} colour={C.brand} />
            </div>
            <Caption
                cW={cW}
                eyebrow="Bluetooth"
                headline={
                    <>
                        Watch the pour
                        <br />
                        <span style={{color: C.brand}}>happen</span>.
                    </>
                }
            />
            <Phone
                src={img(shot("brew"))}
                alt="A brew in progress"
                style={{
                    position: "absolute",
                    bottom: 0,
                    width: "74%",
                    left: "48%",
                    transform: "translateX(-50%) translateY(13%) rotate(-4deg)"
                }}
            />
        </div>
    )
};

/**
 * 3 - Beyond the card. The slide that argues the app is worth having.
 *
 * Three chips rather than prose, because the claim is only convincing when it
 * is specific: a card byte holds a whole number, has nowhere to put bypass, and
 * runs out of room for stages. Each chip is a thing the card format genuinely
 * cannot represent and the Bluetooth path genuinely can, so the slide is a list
 * of facts rather than an adjective.
 *
 * The chips sit over a capture that proves them from the inside: the recipe on
 * screen is named "No Stage Fright" and reads STAGES 17, RATIO 15.5, with the
 * app's own warning that a card holds whole ratios only. A chip drawn over a
 * screenshot that contradicts it is the one failure this set has already made
 * once, so the capture is chosen to carry the argument rather than sit near it.
 *
 * The headline names the official app, which nothing else in the listing does.
 * One part of that is measured rather than assumed: every one of the 3,012
 * live recipes in xBloom's own community catalogue stops at nine pours, and
 * only two reach even that, so the stage count genuinely clears both bars.
 * The other two chips do not, and are not meant to -- they are examples of
 * what a card cannot hold, which is the first half of the headline. Bypass in
 * particular is a field in xBloom's own share-link format
 * (`isEnableBypassWater`, see library/shareLink.ts) and a half ratio brews
 * there too, so neither is evidence against the official app. Read as a list
 * of comparisons the row would overclaim; read as the recipe on screen, which
 * is what the capture underneath makes it, it does not. That reading is the
 * owner's call and is recorded in docs/store-listing.md.
 */
const BEYOND_CHIPS = ["1:15.5", "Bypass", "17 stages"];

const slideBeyond: SlideDef = {
    id: "beyond",
    component: ({cW, cH}) => (
        <div style={frame}>
            <Glow cW={cW} colour={ACCENT.blossom} x="50%" y="32%" size={1.3} opacity={0.3} />
            <Glow cW={cW} colour={C.brand} x="12%" y="86%" size={1.0} opacity={0.24} />
            <DotScreen cW={cW} colour="rgba(255,255,255,0.09)" />
            <Caption
                cW={cW}
                eyebrow="Bluetooth"
                eyebrowColour={ACCENT.blossom}
                scale={0.78}
                headline={
                    <>
                        Brew what neither a card
                        <br />
                        <span style={{color: ACCENT.blossom}}>
                            nor the official app can
                        </span>
                        .
                    </>
                }
            />
            <div
                style={{
                    position: "absolute",
                    top: cH * 0.272,
                    left: 0,
                    width: cW,
                    display: "flex",
                    justifyContent: "center",
                    gap: cW * 0.03,
                    zIndex: 5
                }}>
                {BEYOND_CHIPS.map((chip) => (
                    <div
                        key={chip}
                        style={{
                            fontFamily: "var(--font-doto)",
                            fontWeight: 800,
                            fontSize: cW * 0.044,
                            lineHeight: 1,
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                            color: ACCENT.blossom,
                            border: `${cW * 0.0035}px solid ${ACCENT.blossom}`,
                            borderRadius: cW * 0.028,
                            padding: `${cW * 0.019}px ${cW * 0.032}px ${cW * 0.014}px`,
                            background: "rgba(0,0,0,0.4)"
                        }}>
                        {chip}
                    </div>
                ))}
            </div>
            <Phone
                src={img(shot("recipe"))}
                alt="Recipe editor"
                style={{
                    position: "absolute",
                    bottom: 0,
                    width: "76%",
                    left: "50%",
                    transform: "translateX(-50%) translateY(12%)"
                }}
            />
        </div>
    )
};

/**
 * 4 - Compare. Two traces, because one trace is just slide 2 again.
 *
 * The second trace is drawn shorter and dimmer rather than in a mirrored
 * position, so the pair reads as "the same brew, done differently" instead of
 * two unrelated graphs sharing a canvas. That is the whole proposition of the
 * compare screen, and it has to survive at thumbnail size.
 */
const slideDial: SlideDef = {
    id: "dial",
    component: ({cW, cH}) => (
        <div style={frame}>
            <Glow cW={cW} colour={ACCENT.sky} x="68%" y="34%" size={1.4} opacity={0.3} />
            <Glow cW={cW} colour={ACCENT.peach} x="10%" y="20%" size={0.9} opacity={0.16} />
            <DotScreen cW={cW} colour="rgba(255,255,255,0.09)" />
            <div style={{position: "absolute", left: 0, top: cH * 0.185, width: cW, height: cH * 0.36}}>
                <TraceMotif cW={cW} cH={cH * 0.36} colour={ACCENT.sky} />
            </div>
            <div
                style={{
                    position: "absolute",
                    left: 0,
                    top: cH * 0.185,
                    width: cW,
                    height: cH * 0.36,
                    // Only the top 60% of this box clears the phone, so the two
                    // traces have to diverge *there*. Scaling vertically either
                    // buries the second one behind the phone or stacks it a few
                    // pixels off the first, which reads as a drop shadow. A
                    // horizontal lag separates them in the visible band and
                    // happens to mean something: the same climb, later.
                    transform: `translateX(${cW * 0.13}px) scaleY(0.9)`,
                    transformOrigin: "top"
                }}>
                <TraceMotif cW={cW} cH={cH * 0.36} colour={ACCENT.peach} opacity={0.8} />
            </div>
            <Caption
                cW={cW}
                eyebrow="Compare"
                eyebrowColour={ACCENT.sky}
                scale={0.88}
                headline={
                    <>
                        Why was that one
                        <br />
                        <span style={{color: ACCENT.sky}}>better</span>?
                    </>
                }
            />
            <Phone
                src={img(shot("compare"))}
                alt="Two brews compared"
                style={{
                    position: "absolute",
                    bottom: 0,
                    width: "74%",
                    left: "50%",
                    transform: "translateX(-50%) translateY(12%) rotate(3deg)"
                }}
            />
        </div>
    )
};

/**
 * 8 - Community catalogue. Somebody else has already done the work.
 *
 * Columns of bars rather than the card wall used on the library slide: that
 * wall says "a lot of cards", and this needs to say "a very long list". Reusing
 * it would have made the two slides read as the same idea twice, which is the
 * one thing a listing cannot afford when it has ten slides to fill.
 */
function CatalogueColumns({cW, cH, colour}: {cW: number; cH: number; colour: string}) {
    const cols = 5;
    const rows = 30;
    const barH = cH * 0.0125;
    const gap = cH * 0.0115;
    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                justifyContent: "center",
                gap: cW * 0.028,
                transform: "rotate(-6deg) scale(1.3)",
                pointerEvents: "none"
            }}>
            {Array.from({length: cols}).map((_, c) => (
                <div
                    key={c}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap,
                        marginTop: c % 2 ? cH * 0.035 : 0
                    }}>
                    {Array.from({length: rows}).map((_, r) => (
                        <div
                            key={r}
                            style={{
                                // Varied widths, because a column of identical
                                // bars is a loading skeleton and a column of
                                // ragged ones is a list of names.
                                width: cW * (0.1 + ((r * 5 + c * 3) % 7) * 0.013),
                                height: barH,
                                borderRadius: barH / 2,
                                background: colour,
                                opacity: 0.06 + ((r * 7 + c * 3) % 5) * 0.022
                            }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

const slideHub: SlideDef = {
    id: "hub",
    component: ({cW, cH}) => (
        <div style={frame}>
            <Glow cW={cW} colour={ACCENT.mint} x="50%" y="66%" size={1.5} opacity={0.3} />
            <CatalogueColumns cW={cW} cH={cH} colour={ACCENT.mint} />
            <DotScreen cW={cW} colour="rgba(255,255,255,0.09)" />
            <Caption
                cW={cW}
                eyebrow="Community"
                eyebrowColour={ACCENT.mint}
                scale={0.88}
                headline={
                    <>
                        Someone already
                        <br />
                        <span style={{color: ACCENT.mint}}>dialled it in</span>.
                    </>
                }
            />
            <Phone
                src={img(shot("hub"))}
                alt="The community catalogue"
                style={{
                    position: "absolute",
                    bottom: 0,
                    width: "74%",
                    left: "50%",
                    transform: "translateX(-50%) translateY(12%) rotate(-3deg)"
                }}
            />
        </div>
    )
};

/** 9 - Editor. Two phones layered, to say "there is a lot in here". */
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

/** 10 - Read. Contactless arcs behind the phone, echoing the scan overlay. */
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
                    // Scaled up and anchored high so iOS's own scan sheet, which
                    // owns the bottom 47% of that capture, falls off the canvas.
                    // The app deliberately stages its bloom in the strip above
                    // that sheet, so this shows the whole of what XBRW++ draws
                    // without cropping the image or faking a screen that the
                    // platform never actually renders.
                    top: cH * 0.4,
                    width: "128%",
                    left: "50%",
                    transform: "translateX(-50%)"
                }}
            />
        </div>
    )
};

/**
 * 5 - History. The quiet feature that keeps people in the app.
 *
 * Five ghosts of slide 2's trace, stacked and fading backwards. Rewriting the
 * live graph as an archive says "every brew" in one glance, where the screen
 * itself -- a list of rows -- is unreadable at thumbnail size. An earlier pass
 * drew flat bars instead and they read as a loading skeleton, which is the one
 * thing a store listing must never look like.
 */
function GhostTraces({cW, cH, colour}: {cW: number; cH: number; colour: string}) {
    const layers = [0.5, 0.36, 0.25, 0.16, 0.09];
    return (
        <div style={{position: "absolute", left: 0, top: cH * 0.2, width: cW, height: cH * 0.34}}>
            {layers.map((opacity, i) => (
                <div
                    key={opacity}
                    style={{
                        position: "absolute",
                        inset: 0,
                        transform: `translateY(${i * cH * 0.035}px) scaleY(${1 - i * 0.06})`
                    }}>
                    <TraceMotif cW={cW} cH={cH * 0.34} colour={colour} opacity={opacity} />
                </div>
            ))}
        </div>
    );
}

const slideHistory: SlideDef = {
    id: "history",
    component: ({cW, cH}) => (
        <div style={frame}>
            <Glow cW={cW} colour={ACCENT.oolong} x="24%" y="62%" size={1.4} opacity={0.26} />
            <DotScreen cW={cW} colour="rgba(255,255,255,0.09)" />
            <GhostTraces cW={cW} cH={cH} colour={ACCENT.oolong} />
            <Caption
                cW={cW}
                eyebrow="History"
                eyebrowColour={ACCENT.oolong}
                headline={
                    <>
                        Every brew,
                        <br />
                        <span style={{color: ACCENT.oolong}}>kept</span>.
                    </>
                }
            />
            {/* The list behind the record, because "every brew" is a claim the
                list makes and the record cannot: one record is one brew. It sits
                back and dim so the pair still reads as a single idea, and the
                record keeps the foreground because it is the one worth looking
                at on a 400 pixel thumbnail. */}
            <Phone
                src={img(shot("historylist"))}
                alt="Brew history"
                style={{
                    position: "absolute",
                    bottom: 0,
                    width: "58%",
                    left: "-6%",
                    transform: "translateY(-2%) rotate(-7deg)",
                    opacity: 0.5
                }}
            />
            <Phone
                src={img(shot("history"))}
                alt="A past brew"
                style={{
                    position: "absolute",
                    bottom: 0,
                    width: "72%",
                    right: "-4%",
                    transform: "translateY(11%) rotate(3deg)"
                }}
            />
        </div>
    )
};

/**
 * 7 - Shelves. The other half of the library, and the reason it has two slides.
 *
 * The privacy slide used to sit here. It said "No cloud. No account." and
 * credited the app's About ticker, and both halves went stale in 2.0: the
 * ticker lines are crack-intro nonsense that never said it, and the app now has
 * a community catalogue, an optional xBloom sign-in and a share service, so "no
 * cloud" is untrue. Rather than restate a weaker version of the claim, the slot
 * went to the thing a buyer can actually see the value of.
 *
 * The motif is a grid of shelf marks, not the card wall from the slide before:
 * the pair has to read as two views of one library, and repeating the wall
 * would make it read as two libraries.
 */
function MarkGrid({cW, cH}: {cW: number; cH: number}) {
    const tints = [ACCENT.mint, ACCENT.lilac, ACCENT.peach, ACCENT.sky, ACCENT.blossom, ACCENT.oolong];
    const cols = 5;
    const rows = 7;
    const size = cW * 0.135;
    const gap = cW * 0.045;
    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap,
                transform: "rotate(-5deg) scale(1.25)",
                pointerEvents: "none"
            }}>
            {Array.from({length: rows}).map((_, r) => (
                <div key={r} style={{display: "flex", gap}}>
                    {Array.from({length: cols}).map((_, c) => {
                        const i = r * cols + c;
                        return (
                            <div
                                key={c}
                                style={{
                                    width: size,
                                    height: size,
                                    borderRadius: size * 0.26,
                                    background: tints[i % tints.length],
                                    opacity: 0.1 + ((i * 3) % 4) * 0.035
                                }}
                            />
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

const slideShelves: SlideDef = {
    id: "shelves",
    component: ({cW, cH}) => (
        <div style={frame}>
            <MarkGrid cW={cW} cH={cH} />
            <Glow cW={cW} colour={ACCENT.mint} x="50%" y="76%" size={1.5} opacity={0.26} />
            <Glow cW={cW} colour={C.base} x="50%" y="8%" size={1.8} opacity={0.78} />
            <Glow cW={cW} colour={C.base} x="50%" y="66%" size={1.7} opacity={0.85} />
            <DotScreen cW={cW} colour="rgba(255,255,255,0.09)" />
            <Caption
                cW={cW}
                eyebrow="Shelves"
                eyebrowColour={ACCENT.mint}
                scale={0.9}
                headline={
                    <>
                        It sorts itself
                        <br />
                        <span style={{color: ACCENT.mint}}>as you brew</span>.
                    </>
                }
            />
            <Phone
                src={img(shot("shelves"))}
                alt="Library shelves"
                style={{
                    position: "absolute",
                    bottom: 0,
                    width: "82%",
                    left: "50%",
                    transform: "translateX(-50%) translateY(10%)"
                }}
            />
        </div>
    )
};

const SLIDES: SlideDef[] = [
    slideHero,
    slideBrew,
    slideBeyond,
    slideDial,
    slideHistory,
    slideLibrary,
    slideShelves,
    slideHub,
    slideStages,
    slideRead
];

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
            {name: "brew", left: "87%", scale: 0.84, rotate: 9, z: 1, opacity: 0.7},
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
                            flexDirection: "column",
                            alignItems: "flex-start",
                            gap: cW * 0.012,
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
