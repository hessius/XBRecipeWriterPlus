import {useKeepAwake} from "expo-keep-awake";

export default function BrewWakeLock() {
    useKeepAwake();
    return null;
}
