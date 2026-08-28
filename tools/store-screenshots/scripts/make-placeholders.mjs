/**
 * Writes stand-in screenshots so the layouts can be built and checked before
 * the real device captures exist.
 *
 * These are deliberately crude: a tinted field, a light status-bar strip at the
 * top and a magenta foot at the bottom, plus N pips naming the slot. That is
 * enough to prove framing -- if the strip or the foot is clipped inside a
 * mockup, the fit is wrong -- without pretending to be the app. Anything
 * prettier would risk being mistaken for a finished slide.
 *
 * Written with zlib and a Buffer rather than a canvas library because a PNG
 * encoder for flat colour is about thirty lines and not worth a dependency in
 * a throwaway script.
 */
import {createHash} from "node:crypto";
import {deflateSync} from "node:zlib";
import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../public/screenshots/en");

/** iPhone 16/17 Pro, the device these captures will come from. */
const W = 1206;
const H = 2622;

const SLOTS = [
    {name: "home", tint: [0x1a, 0x0f, 0x14]},
    {name: "import", tint: [0x12, 0x16, 0x1c]},
    {name: "stages", tint: [0x1c, 0x18, 0x0f]},
    {name: "read", tint: [0x0f, 0x1a, 0x16]},
    {name: "hero", tint: [0x1a, 0x12, 0x1c]},
    {name: "about", tint: [0x14, 0x14, 0x14]}
];

const MAGENTA = [0xff, 0x00, 0x7f];

const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();

function crc32(buf) {
    let c = -1;
    for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return c ^ -1;
}

function chunk(type, body) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed) >>> 0);
    return Buffer.concat([len, typed, crc]);
}

function png(width, height, pixelAt) {
    // One filter byte (0 = none) per scanline, then RGB triples.
    const raw = Buffer.alloc(height * (1 + width * 3));
    let p = 0;
    for (let y = 0; y < height; y++) {
        raw[p++] = 0;
        for (let x = 0; x < width; x++) {
            const [r, g, b] = pixelAt(x, y);
            raw[p++] = r;
            raw[p++] = g;
            raw[p++] = b;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // colour type: truecolour, no alpha
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", deflateSync(raw, {level: 9})),
        chunk("IEND", Buffer.alloc(0))
    ]);
}

mkdirSync(OUT, {recursive: true});

SLOTS.forEach((slot, index) => {
    const pips = index + 1;
    const pipSize = Math.round(W * 0.06);
    const pipGap = Math.round(W * 0.03);
    const pipRowW = pips * pipSize + (pips - 1) * pipGap;
    const pipLeft = Math.round((W - pipRowW) / 2);
    const pipTop = Math.round(H / 2 - pipSize / 2);

    const data = png(W, H, (x, y) => {
        if (y < H * 0.045) return [0xe8, 0xe8, 0xe8]; // status bar strip
        if (y > H * 0.985) return MAGENTA; // foot, so clipping is obvious
        if (y >= pipTop && y < pipTop + pipSize) {
            const dx = x - pipLeft;
            if (dx >= 0 && dx < pipRowW && dx % (pipSize + pipGap) < pipSize) return MAGENTA;
        }
        return slot.tint;
    });

    const file = resolve(OUT, `${slot.name}.png`);
    writeFileSync(file, data);
    console.log(`${slot.name}.png  ${W}x${H}  ${createHash("sha1").update(data).digest("hex").slice(0, 8)}`);
});
