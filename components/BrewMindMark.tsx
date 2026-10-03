import React from "react";
import Svg, {Circle, Path} from "react-native-svg";

import {palette} from "@/constants/colors";

/**
 * BrewMind's own mark, redrawn from the SVG they serve at
 * `brewmind.coffee/icon.svg`, so the door that opens their page is recognisable
 * as theirs before it opens.
 *
 * Inlined as a component rather than bundled as a file because there is no SVG
 * transformer in this build and `metro.config.js` was deliberately removed in
 * the SDK 57 upgrade. One circle and one path is a cheap thing to carry.
 *
 * The two tones are inverted from the original, which is a black disc carrying
 * a white glyph. That is a mark drawn for a white page; on `raised` the disc
 * would all but vanish. Inverting a monochrome mark for a dark ground is the
 * ordinary way to use one, and the shape, which is the part that identifies
 * them, is untouched. Both tones come from the palette like every other colour
 * in the app, so a retune takes this with it.
 */
export default function BrewMindMark({size = 22}: {size?: number}) {
    return (
        <Svg width={size} height={size} viewBox="0 0 57.97 57.97"
             accessibilityElementsHidden
             importantForAccessibility="no-hide-descendants">
            <Circle cx="28.98" cy="28.98" r="28.98" fill={palette.text}/>
            <Path fill={palette.surface}
                  d="M29.95,50.75c10.35-.48,19.14-8.33,20.59-18.59.47-3.33.19-6.57-.73-9.53l-7.41,3.03c.66,2.04.83,4.11.53,6.22-.31,2.1-1.33,4.14-3.06,6.12-1.63,1.86-3.54,3.13-5.75,3.81-2.2.69-4.47.73-6.8.12-.02,0-.03,0-.05-.01-2.44-.65-3.27-3.72-1.6-5.61,6.47-7.33,12.93-14.66,19.4-21.99-.2-.22-.41-.43-.61-.64-.03-.03-.06-.06-.09-.09-.21-.21-.43-.42-.66-.64,0,0-.03-.03-.09-.08-.04-.04-.09-.08-.16-.14-.2-.17-.39-.34-.6-.52-.03-.02-.06-.04-.09-.07-.2-.16-.4-.32-.61-.47-.13-.11-.27-.2-.4-.3-.21-.15-.42-.3-.63-.43-.16-.11-.33-.21-.49-.32-.25-.16-.51-.31-.76-.45-.63-.36-1.24-.67-1.83-.94-.15-.07-.29-.13-.43-.19-.24-.1-.46-.2-.68-.29-.05-.01-.09-.03-.13-.05-.39-.15-.74-.28-1.06-.39-.21-.07-.4-.14-.57-.19-.07-.02-.13-.04-.19-.06-.13-.04-.25-.08-.38-.11-.06-.02-.12-.03-.18-.05-.03-.01-.05-.02-.07-.02-.02-.01-.03-.01-.03-.01-.16-.04-.31-.08-.47-.11-.15-.04-.3-.07-.45-.1-.63-.13-1.21-.21-1.75-.28-.71-.08-1.34-.12-1.88-.15-.07,0-.15,0-.22-.01-11.57-.45-21.46,8.25-22.3,19.8-.08,1.15-.1,2.12-.05,3.09.01.32.04.64.07.95.03.33.07.66.12.98-.01.01,0,.03,0,.05.03.2.06.41.1.61.02.18.06.35.09.52.06.27.12.54.18.81,0,.02.01.04.01.05.06.23.12.46.18.69.04.15.08.29.13.44.06.23.14.46.21.69.02.05.03.09.05.14.1.29.21.58.32.87.12.3.24.6.38.9.09.21.19.43.29.64.13.27.27.54.41.8.23.43.47.85.74,1.26.14.24.3.48.46.72.48.71,1,1.4,1.57,2.04.34.39.68.76,1.04,1.12.25.25.5.49.76.72h.01c.17.16.37.34.6.53.12.1.25.2.38.31.69.54,1.59,1.19,2.69,1.83.38.22.78.44,1.21.66.78.39,1.64.77,2.57,1.1.26.09.52.19.79.27.05.02.11.03.16.05.55.17,1.13.32,1.73.45.04.01.08.02.12.02.01.01.03.01.04.01.21.04.48.09.79.14.13.02.26.05.41.07.03,0,.06.01.08.01.29.04.58.07.86.1,1.04.1,2.08.14,3.17.09ZM19.7,32.33c-1.14,1.3-3.29,1.06-4.01-.52,0-.01,0-.02-.01-.03-1-2.2-1.34-4.39-1.02-6.55.32-2.16,1.24-4.11,2.77-5.85,1.55-1.78,3.36-2.95,5.43-3.52.89-.24,1.78-.37,2.68-.38.59,0,1.93.04,3.53.58.14.05.27.1.4.15,1.58.61,2.06,2.6.95,3.88-3.57,4.08-7.14,8.16-10.72,12.24Z"/>
        </Svg>
    );
}
