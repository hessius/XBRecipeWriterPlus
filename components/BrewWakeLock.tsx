import {useKeepAwake} from "expo-keep-awake";

const ACTIVE_BREW_TAG = "active-brew";

export default function BrewWakeLock() {
    useKeepAwake(ACTIVE_BREW_TAG);
    return null;
}
