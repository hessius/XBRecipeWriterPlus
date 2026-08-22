import NFC from "./NFC";
import Pour from "./Pour";
import uuid from 'react-native-uuid';

export const CUP_TYPE = {
    XPOD:  0x00,
    OTHER: 0x01,
    OMNI:  0x02, // no overflow protection
    TEA:   0x03  // high bits may contain the default number of cups to brew
}

// This byte value for the grind size disables the grinder
export const GRINDER_OFF: number = 41;
// Grind size is stored on the NFC card with offset (grind_size_value - 40)
export const GRIND_SIZE_OFFSET = 40;
/** The XID occupies card bytes 32-38 inclusive. */
export const XID_LENGTH = 7;

/**
 * xBloom XIDs look like `<VENDOR>[T]<NUM>`: a three-letter vendor code, an optional
 * `T` for tea, then two or three digits. An empty XID is allowed — the machine
 * brews fine without one, it just means the app cannot look the recipe up online.
 */
export function isValidXID(xid: string): boolean {
    const trimmed = xid.trim();
    if (trimmed.length === 0) {
        return true;
    }
    return trimmed.length <= XID_LENGTH && /^[A-Za-z]{3}T?[0-9]{2,3}$/.test(trimmed);
}
export const DEFAULT_GRIND_SIZE = 50;

const POLY_TABLE = [
    0x00, 0x5E, 0xBC, 0xE2, 0x61, 0x3F, 0xDD, 0x83,
    0xC2, 0x9C, 0x7E, 0x20, 0xA3, 0xFD, 0x1F, 0x41,
    0x9D, 0xC3, 0x21, 0x7F, 0xFC, 0xA2, 0x40, 0x1E,
    0x5F, 0x01, 0xE3, 0xBD, 0x3E, 0x60, 0x82, 0xDC,
    0x23, 0x7D, 0x9F, 0xC1, 0x42, 0x1C, 0xFE, 0xA0,
    0xE1, 0xBF, 0x5D, 0x03, 0x80, 0xDE, 0x3C, 0x62,
    0xBE, 0xE0, 0x02, 0x5C, 0xDF, 0x81, 0x63, 0x3D,
    0x7C, 0x22, 0xC0, 0x9E, 0x1D, 0x43, 0xA1, 0xFF,
    0x46, 0x18, 0xFA, 0xA4, 0x27, 0x79, 0x9B, 0xC5,
    0x84, 0xDA, 0x38, 0x66, 0xE5, 0xBB, 0x59, 0x07,
    0xDB, 0x85, 0x67, 0x39, 0xBA, 0xE4, 0x06, 0x58,
    0x19, 0x47, 0xA5, 0xFB, 0x78, 0x26, 0xC4, 0x9A,
    0x65, 0x3B, 0xD9, 0x87, 0x04, 0x5A, 0xB8, 0xE6,
    0xA7, 0xF9, 0x1B, 0x45, 0xC6, 0x98, 0x7A, 0x24,
    0xF8, 0xA6, 0x44, 0x1A, 0x99, 0xC7, 0x25, 0x7B,
    0x3A, 0x64, 0x86, 0xD8, 0x5B, 0x05, 0xE7, 0xB9,
    0x8C, 0xD2, 0x30, 0x6E, 0xED, 0xB3, 0x51, 0x0F,
    0x4E, 0x10, 0xF2, 0xAC, 0x2F, 0x71, 0x93, 0xCD,
    0x11, 0x4F, 0xAD, 0xF3, 0x70, 0x2E, 0xCC, 0x92,
    0xD3, 0x8D, 0x6F, 0x31, 0xB2, 0xEC, 0x0E, 0x50,
    0xAF, 0xF1, 0x13, 0x4D, 0xCE, 0x90, 0x72, 0x2C,
    0x6D, 0x33, 0xD1, 0x8F, 0x0C, 0x52, 0xB0, 0xEE,
    0x32, 0x6C, 0x8E, 0xD0, 0x53, 0x0D, 0xEF, 0xB1,
    0xF0, 0xAE, 0x4C, 0x12, 0x91, 0xCF, 0x2D, 0x73,
    0xCA, 0x94, 0x76, 0x28, 0xAB, 0xF5, 0x17, 0x49,
    0x08, 0x56, 0xB4, 0xEA, 0x69, 0x37, 0xD5, 0x8B,
    0x57, 0x09, 0xEB, 0xB5, 0x36, 0x68, 0x8A, 0xD4,
    0x95, 0xCB, 0x29, 0x77, 0xF4, 0xAA, 0x48, 0x16,
    0xE9, 0xB7, 0x55, 0x0B, 0x88, 0xD6, 0x34, 0x6A,
    0x2B, 0x75, 0x97, 0xC9, 0x4A, 0x14, 0xF6, 0xA8,
    0x74, 0x2A, 0xC8, 0x96, 0x15, 0x4B, 0xA9, 0xF7,
    0xB6, 0xE8, 0x0A, 0x54, 0xD7, 0x89, 0x6B, 0x35
];


/** Where a recipe came from. Drives the placeholder name. */
export type RecipeSource = "read" | "import" | "duplicate" | "manual";

class Recipe {
    public uuid: string = "";
    public title: string = "";
    public xid: string = "";
    public shareId: string = "";
    public key: string = ""
    public ratio: number = -1;
    public dosage: number = 15;
    public grindSize: number = -1;
    public grindRPM: number = 120;
    public grinder: boolean = true;
    public pours: Pour[] = [];
    public checksum: number = -1;
    public cupType: number = CUP_TYPE.XPOD;
    public defaultCups: number = 0;
    public backup: number[] = [];
    public offline_backup: number[] = [];
    public uid: number[] = [];
    /** The name the user chose. Empty until they rename something. */
    public name: string = "";
    /**
     * The name xBloom publishes for this recipe's XID, cached.
     *
     * Not hand-edited. Once the sync and display work lands, a sync will
     * refresh this while the local `name` wins the display, so refreshing can
     * no longer discard what the user typed.
     */
    public xbloomName: string = "";
    /** Epoch ms. `0` means unknown — a record saved before the field existed. */
    public createdAt: number = 0;
    public source: RecipeSource = "manual";
    /**
     * Index into the accent half for this recipe's beverage. Absent on records
     * saved before the field existed, which fall back to the uuid hash in
     * `library/accent.ts`.
     */
    public accentIndex?: number;

    constructor(data?: number[], json?: string, hasSignature: boolean = true) {
        this.uuid = (uuid.v4() as string);
        this.key = this.uuid;
        this.createdAt = Date.now();

        if (data) {
            if (hasSignature) {
                this.parseData(data);
            } else {
                this.parseData(new Array(32).fill(0).concat(data));
            }
            return;
        }
        if (json) {
            let jsonRecipe = JSON.parse(json);
            this.grindRPM = jsonRecipe.grindRPM ?? 120;
            this.grindSize = jsonRecipe.grindSize;
            this.cupType = jsonRecipe.cupType ?? CUP_TYPE.XPOD;
            this.defaultCups = jsonRecipe.defaultCups ?? jsonRecipe.pours.length ?? 3;
            // fix incorrectly saved cup types from the first app version with Tea support
            if (this.cupType === 0x23 || this.cupType === 0x13) {
                this.defaultCups = ((this.cupType & 0xF0) >> 4) + 1;
                this.cupType = 0x03; // 0x03 is for Tea
            } else if (this.cupType === 0x04) {
                this.cupType = 0x01; // 0x01 is for Other
            }
            if (this.cupType !== CUP_TYPE.TEA) {
                this.defaultCups = 0; // only used for Tea
            }
            this.grinder = jsonRecipe.grinder ?? true;
            this.backup = jsonRecipe.backup ?? [];
            this.offline_backup = jsonRecipe.offline_backup ?? [];
            this.uid = jsonRecipe.uid ?? [];

            if (jsonRecipe.uuid) {
                this.uuid = jsonRecipe.uuid;
            } else {
                this.uuid = (uuid.v4() as string);
            }
            this.key = this.uuid;
            for (let i = 0; i < jsonRecipe.pours.length; i++) {
                let pour = typeof (jsonRecipe.pours[i]) == 'string' ? JSON.parse(jsonRecipe.pours[i]) : jsonRecipe.pours[i];
                let p = new Pour(
                    (pour.pourNumber),
                    pour.volume,
                    pour.temperature,
                    pour.flowRate,
                    pour.agitation,
                    pour.pourPattern,
                    pour.pauseTime);
                this.pours.push(p);
            }
            this.ratio = jsonRecipe.ratio;
            this.title = jsonRecipe.title;
            // Lazy migration, beside the cup-type fixes above. A record written
            // before these fields existed takes its old `title` as the local
            // name: it was editable, so it is the user's, and there is no way to
            // tell a synced title from a typed one after the fact.
            this.name = jsonRecipe.name ?? jsonRecipe.title ?? "";
            this.xbloomName = jsonRecipe.xbloomName ?? "";
            // Not `?? Date.now()`. Backfilling with the read time would give
            // every legacy record a date that changes on every launch until it
            // is next saved.
            this.createdAt = jsonRecipe.createdAt ?? 0;
            this.source = jsonRecipe.source ?? "manual";
            this.accentIndex = jsonRecipe.accentIndex;
            this.xid = jsonRecipe.xid;
            if (jsonRecipe.dosage) {
                this.dosage = jsonRecipe.dosage;
            }
            this.checksum = jsonRecipe.checksum;
            this.shareId = jsonRecipe.shareId ?? "";
        }

    }

    public addPour(pourNumber: number, copyFromPrevious: boolean = true) {
        let newPour: Pour;

        if (copyFromPrevious && this.pours.length > 0) {
            // Get the previous pour to copy from
            const previousPour = this.pours[pourNumber >= 0 ? pourNumber : this.pours.length - 1];

            // Create new pour with copied parameters
            newPour = new Pour(
                pourNumber + 2,
                previousPour.volume,
                previousPour.temperature,
                previousPour.flowRate,
                previousPour.agitation,
                previousPour.pourPattern,
                previousPour.pauseTime
            );
        } else {
            // Use default values
            newPour = new Pour(pourNumber + 2, 1, 39, 30, 0, 0, 0);
        }

        this.pours.splice(pourNumber + 1, 0, newPour);
        for (let i = 0; i < this.pours.length; i++) {
            this.pours[i].pourNumber = i + 1;
        }
    }

    public generateNewUUID() {
        this.uuid = (uuid.v4() as string);
        this.key = this.uuid;
    }

    /**
     * The name to show for this recipe.
     *
     * A chain rather than a single field, because both names and the XID are
     * optional: a card carries no name at all, only the XID, and a card with no
     * XID carries nothing. This lives here so no screen reimplements it.
     */
    public displayName(): string {
        if (this.name.trim().length > 0) {
            return this.name;
        }
        if (this.xbloomName.trim().length > 0) {
            return this.xbloomName;
        }
        if (this.xid.trim().length > 0) {
            return this.xid;
        }
        return this.placeholderName();
    }

    /**
     * Whether any real name was found, as opposed to the placeholder.
     *
     * The UI renders the placeholder muted, so that a generated label is never
     * mistaken for a name the user chose.
     */
    public hasName(): boolean {
        return this.name.trim().length > 0 ||
               this.xbloomName.trim().length > 0 ||
               this.xid.trim().length > 0;
    }

    /**
     * Provenance and date, for a recipe with no name from any source.
     *
     * Not derived from the brew parameters: the recipe card already shows dose,
     * ratio and grind beside the name, so "18 g · 1:16" would only repeat
     * itself. Provenance and date are the one thing that distinguishes four
     * nameless cards read in a row.
     */
    private placeholderName(): string {
        const verb: Record<RecipeSource, string> = {
            read:      "Read",
            import:    "Imported",
            duplicate: "Copy",
            manual:    "Untitled"
        };

        if (this.source === "manual" || this.source === "duplicate" || this.createdAt === 0) {
            return verb[this.source];
        }

        const date = new Date(this.createdAt).toLocaleDateString(undefined, {
            day:   "numeric",
            month: "short"
        });
        return `${verb[this.source]} ${date}`;
    }

    public deletePour(pourNumber: number) {
        this.pours.splice(pourNumber, 1);
        for (let i = 0; i < this.pours.length; i++) {
            this.pours[i].pourNumber = i + 1;
        }
    }

    public getTotalVolume(): number {
        return this.dosage * this.ratio
    }

    public getPourTotalVolume(): number {
        let totalVolume = 0;
        for (let pour of this.pours) {
            if (pour.volume > 0) {
                totalVolume += pour.getVolume();
            }
        }
        return totalVolume;
    }

    public isPourVolumeValid(): boolean {
        return this.getPourTotalVolume() === this.getTotalVolume();
    }

    public isTea(): boolean {
        return this.cupType === CUP_TYPE.TEA;
    }

    public getCupTypeName(): string {
        return Recipe.getCupTypeText(this.cupType);
    }

    public static getCupTypeText(cupType: number): string {
        switch (cupType) {
            case CUP_TYPE.XPOD:
                return "xPod";
            case CUP_TYPE.OMNI:
                return "Omni";
            case CUP_TYPE.TEA:
                return "Tea";
            case CUP_TYPE.OTHER:
                return "Other";
            default:
                return "Unknown";
        }
    }

    // Function to calculate CRC-8/MAXIM-DOW
    private calculateCRC(array: number[]): number {
        const crcTable = POLY_TABLE//this.createCrcTable();
        let crc = 0x00; // Initial value for CRC-8/MAXIM-DOW

        array.forEach((byte) => {
            crc = crcTable[(crc ^ byte) & 0xff];
        });

        return crc ^ 0x00; // Final XOR value (reflected output)
    }

    public async writeCard(nfc: NFC, progressCallBack: (progress: number, id?: string) => Promise<string | undefined>) {
        console.log("Writing Card");
        try {
            await nfc.init();
            await nfc.open();
            let hash = await nfc.readHash();
            console.log("Read Hash:" + Recipe.convertNumberArrayToHex(hash!));

            if (hash) {
                let data = this.getData(hash);
                console.log(Recipe.convertNumberArrayToHex(data));
                await nfc.writeCard(data, progressCallBack);
            }
        } catch (e) {
            if (!nfc.getIsClosed()) { //make sure NFC reading wasn't closed by user --really just an android problem
                throw new Error("Error writing card: " + e);
            }
        } finally {
            await nfc.close();
        }
    }


    public async readCard(nfc: NFC, progressCallBack: (progress: number, id?: string) => Promise<string | undefined>): Promise<boolean> {
        console.log('Read Card')
        try {
            await nfc.init();
            await nfc.open();
            await progressCallBack(20)
            let uid = await nfc.getUID();
            let data = await nfc.readCard(progressCallBack);
            await progressCallBack(90)
            // Report completion before closing: on iOS the progress text is
            // written into the system NFC sheet, which is gone once we close.
            await progressCallBack(100)
            await nfc.close();
            if (data) {
                console.log(Recipe.convertNumberArrayToHex(data));
                this.uid = uid ?? [];
                this.backup = data;
                this.parseData(data);
                console.log(this.toString());
                return true;
            } else {
                throw new Error("No data read from card");
            }
        } catch (e) {
            if (!nfc.getIsClosed()) {
                throw new Error("Error reading card: " + e);
            }
        } finally {
            await nfc.close();
        }
        return false;
    }

    public getData(prefix: number[] | null = null, withSignature: boolean = false): number[] {
        let data: number[] = [];

        if (prefix && prefix.length > 0) {
            data = data.concat(prefix);
        } else {
            data = data.concat(this.backup.length >= 32 ? this.backup.slice(0, 32) : new Array(32).fill(0));
        }
        console.log("Prefix:" + Recipe.convertNumberArrayToHex(data));

        data = data.concat(this.convertXIDToData(this.xid));

        if (this.isTea()) {
            // Reconstruct the byte again from the number of cups and cup type for Tea recipes only.
            // Always use the number of cups = number of pours in case the user has modified the recipe.
            // It's not clear why the card stores the number of cups separately, so I removed the cup
            // configuration to simplify the UI and code.
            // If we find out how it's supposed to work, we can change this code back to use `defaultCups`.
            data.push(((this.pours.length - 1) << 4) | this.cupType);
        } else {
            data.push(this.cupType);
        }

        data.push(this.pours.length << 3);
        let pourNumber = 0;
        for (let pour of this.pours) {
            pourNumber++;
            data.push(pour.getVolume());
            data.push(pour.getTemperature());
            data.push(pour.getPourPattern());
            data.push(pour.getAgitation());

            let pauseTime = pour.getPauseTime();

            let waitSeconds = 0;
            let waitMinutes = 0;

            if (pauseTime > 255) {
                if (pauseTime > 360) pauseTime = 360;
                // Split into whole minutes and remaining seconds
                waitMinutes = Math.floor(pauseTime / 60);
                waitSeconds = pauseTime % 60;
            } else {
                waitSeconds = pauseTime;
            }

            if (waitSeconds === 0) {
                data.push(0x00);
            } else {
                data.push(256 + (0 - waitSeconds));
            }

            const wait_minutes_byte = (waitMinutes << 5);
            if (pourNumber === 1) {
                data.push(wait_minutes_byte | this.dosage);   // 5th byte of the first pour stores the dose and optional minutes of pause
                data.push(this.grindRPM); // 6th byte of the first pour stores the RPM
            } else {
                data.push(wait_minutes_byte); // optional minutes of pause
                data.push(0x00);
            }

            data.push(pour.getFlowRate());
        }

        if (this.isTea()) {
            // tea cards use the default grind size
            data.push(DEFAULT_GRIND_SIZE - GRIND_SIZE_OFFSET);
        } else {
            if (this.grinder) {
                data.push(this.grindSize - GRIND_SIZE_OFFSET);
            } else {
                data.push(GRINDER_OFF); // setting grind size to 41 (0x29) disables the grinder
            }
        }

        data.push(this.ratio);
        let checkSum = this.calculateCRC(data);
        console.log("CheckSum:" + Recipe.convertNumberArrayToHex(data));
        console.log("CheckSum:" + checkSum + ":" + this.checksum);
        data.push(checkSum);

        if (withSignature) {
            return data;
        } else {
            data.splice(0, 32);
        }
        return data
    }

    public autoFixPourVolumes() {
        if (this.isTea()) { // set all pours to 90 ml for tea
            for (let pour of this.pours) {
                pour.volume = 90;
            }
            this.fixRatio();
            return;
        }
        if (this.pours.length === 1) { //if just 1 pour set to total volume
            this.pours[0].volume = this.getTotalVolume();
        } else if (this.pours.length > 1 && this.getPourTotalVolume() === 0) {
            //this is where pours have been added, but not volume has been set
            //set the bloom to double dosage, and disribute rest evenly
            this.pours[0].volume = this.dosage * 2;
            for (let i = 1; i < this.pours.length; i++) {
                this.pours[i].volume = Math.round((this.getTotalVolume() - this.pours[0].volume) / (this.pours.length - 1));
            }
            //tack on/remove any extra thst occurs because of rounding to last pour
            if (this.getTotalVolume() - this.getPourTotalVolume() !== 0) {
                let diff = this.getTotalVolume() - this.getPourTotalVolume();
                this.pours[this.pours.length - 1].volume += diff;
            }
        } else if (this.pours.length > 1 && this.getPourTotalVolume() !== 0) {
            //this is auto adjusts each pour by scale factor
            //then to the extent due to rounding it doesn't add up to total, it adjusts intelligently
            let pourTotal = this.getPourTotalVolume();
            let totalVolume = this.getTotalVolume();
            // Calculate the scaling factor
            const scalingFactor = totalVolume / pourTotal;

            let pourVolumeMap = [];
            for (let i = 0; i < this.pours.length; i++) {
                pourVolumeMap.push({
                    pourIndex:           i,
                    origVolume:          this.pours[i].volume,
                    scaledVolume:        this.pours[i].volume * scalingFactor,
                    roundedScaledVolume: Math.round(this.pours[i].volume * scalingFactor)
                });
            }

            // Calculate the difference caused by rounding
            const scaledTotal = pourVolumeMap.reduce((sum, pour) => sum + pour.roundedScaledVolume, 0);
            const difference = totalVolume - scaledTotal;

            if (difference !== 0) {
                // Get the fractional differences from the rounded values
                const adjustments = pourVolumeMap.map((value, index) => ({
                    index,
                    diff: value.roundedScaledVolume - value.scaledVolume
                }));

                // Sort adjustments by how far they are from the rounded value
                adjustments.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

                // Incrementally adjust to correct the difference
                let remainingDifference = difference;
                for (let i = 0; remainingDifference !== 0; i++) {
                    const targetIndex = adjustments[i % adjustments.length].index;
                    pourVolumeMap[targetIndex].roundedScaledVolume += Math.sign(remainingDifference);
                    remainingDifference -= Math.sign(remainingDifference);
                }
            }
            // Update the pour volumes
            for (let i = 0; i < pourVolumeMap.length; i++) {
                this.pours[pourVolumeMap[i].pourIndex].volume = pourVolumeMap[i].roundedScaledVolume;
            }
        }
    }

    public static convertNumberArrayToHex(array: number[]): string {
        let hexOutput = ''
        for (let i = 0; i < array.length; i++) {
            let hex = array[i].toString(16);
            if (hex.length === 1) {
                hex = '0' + hex;
            }
            hexOutput += "" + hex;
        }
        return hexOutput;
    }

    private convertDataToXID(data: number[]): string {
        let index = data.length - 1
        while (index >= 0) {
            if (data[index] !== 0) {
                break;
            }
            index--;
        }
        return String.fromCharCode(...data.slice(0, index + 1)).trim()
    }

    private convertXIDToData(xid: string): number[] {
        let result: number[] = [];
        // The XID occupies bytes 32-38 inclusive, so seven characters is the hard
        // limit. Eight used to be accepted and emitted as eight bytes, which shifted
        // the cup type, pour count and every pour record one byte along.
        if (xid.length > XID_LENGTH) {
            throw new Error(`XID must be at most ${XID_LENGTH} characters`)
        } else {
            for (let i = 0; i < xid.length; i++) {
                result.push(xid.charCodeAt(i));
            }
            //add padding
            for (let i = xid.length; i < XID_LENGTH; i++) {
                result.push(0);
            }
        }
        return result;
    }


    private parseData(data: number[]) {
        this.xid = this.convertDataToXID(data.slice(32, 39));

        let cup_type_and_default_tea_cups = data[39];
        // high bits may contain the default number of tea cups (0x23 = 2 + 1 = 3 cups and tea cup type = 3)
        this.defaultCups = ((cup_type_and_default_tea_cups & 0xF0) >> 4) + 1;
        // low bits is the cup/pod type
        this.cupType = cup_type_and_default_tea_cups & 0x0F;

        // Tea recipe, use 5g dose by default
        if (this.isTea()) {
            this.dosage = 5;
        }

        let numberOfPours = data[40] >> 3;

        let poursDataLength = numberOfPours * 8;

        this.grindSize = data[41 + poursDataLength] + GRIND_SIZE_OFFSET

        if (this.grindSize === GRIND_SIZE_OFFSET + GRINDER_OFF) {
            this.grinder = false;
        }

        this.ratio = data[42 + poursDataLength]
        this.checksum = data[43 + poursDataLength]


        let index = 41;
        let pourNum = 1;

        while (index < 41 + poursDataLength) {
            let volume = data[index]
            let temp = data[index + 1]
            let pattern = data[index + 2]
            let agitation = data[index + 3]
            let pause = (256 - data[index + 4]) & 0xFF
            let flow = data[index + 7]

            if (this.isTea() && volume > 90) {
                console.log("Fixing tea pour volume to 90ml, was: " + volume + "ml")
                volume = 90;
            }

            const dose_and_wait_minutes = data[index + 5];
            // extract the 3-bit wait time in minutes (bits 5-7)
            const waitMinutes = (dose_and_wait_minutes >> 5) & 0x07; // 0x07 = 0b00000111

            // add an optional minutes component to pause, limit to 360 seconds (used in Tea recipes with long steeps)
            pause += waitMinutes * 60;
            if (pause > 360) pause = 360;

            // first pour contains dose and RPM data
            if (pourNum === 1) {
                // Extract the 5-bit dose value (bits 0-4)
                const dose = dose_and_wait_minutes & 0x1F; // 0x1F = 0b00011111
                const rpm = data[index + 6];

                console.log(`Found dose/RPM data: ${pourNum}: ${Recipe.byteToHex(dose)}=${dose} ${Recipe.byteToHex(rpm)}=${rpm}`);
                this.grindRPM = (rpm >= 60 && rpm <= 120) ? rpm : 120;
                this.dosage = (dose >= 1 && dose <= 31) ? dose : this.isTea() ? 5 : 15;
            }

            let pour = new Pour(pourNum, volume, temp, flow, agitation, pattern, pause);
            this.pours.push(pour);

            index += 8
            pourNum++;
        }

        if (this.isTea()) {
            // adjust the ratio if the volume was fixed
            this.fixRatio();
        }
    }

    public fixRatio() {
        this.ratio = Math.round(this.getPourTotalVolume() / this.dosage);
    }

    public static byteToHex(b: number) {
        return `0x` + b.toString(16).padStart(2, '0');
    }

    public toString(): string {
        return `Recipe: ${this.title}
    UID:    ${Recipe.convertNumberArrayToHex(this.uid ?? "")}
    Backup: ${Recipe.convertNumberArrayToHex(this.backup ?? "")}
    XID: ${this.xid}
    Cup: ${this.cupType}
    Steeps: ${this.defaultCups}
    Dose: ${this.dosage}
    Ratio: 1:${this.ratio}
    Grind Size: ${this.grindSize}
    Grind RPM: ${this.grindRPM}
    Pours: ${this.pours.map(pour => pour.toString()).join(", ")}`
    }
}

export default Recipe;
