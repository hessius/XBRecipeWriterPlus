import React from "react";
import {Pressable} from "react-native";

type Props = {
    title: string;
    onPress: () => void;
    icon: React.ReactElement;
};

/**
 * A bare pressable icon, used for the NFC read/write actions in the
 * navigation bar and the add/remove pour controls.
 */
export default function IconButton({onPress, icon}: Props) {
    return (
        <Pressable onPress={onPress}>
            {icon}
        </Pressable>
    );
}
