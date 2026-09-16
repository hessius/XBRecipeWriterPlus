import {router} from "expo-router";
import React, {useState} from "react";
import {ScrollView} from "react-native";
import {Button, Input, Text, YStack, type ColorTokens} from "tamagui";

import CloudImportRow from "@/components/CloudImportRow";
import {notify} from "@/components/XbrwToast";
import ScreenHeader from "@/components/ScreenHeader";
import {palette} from "@/constants/colors";
import {useCloudImport} from "@/hooks/useCloudImport";

import RecipeDatabase from "@/library/RecipeDatabase";
import type {CloudErrorKind} from "@/library/cloud/transport";

/**
 * Sign in to xBloom and bring your own recipes across.
 *
 * A full screen rather than a sheet: this is a form, a list that can be long,
 * and a decision per row. A sheet would put all three behind a keyboard.
 *
 * The screen is layout. Every judgement it appears to make was made in
 * `buildImportPlan` and is tested there without a renderer.
 */

/** "1 recipe", "3 recipes". Said often enough here to be worth naming once. */
function recipes(count: number): string {
    return `${count} recipe${count === 1 ? "" : "s"}`;
}

const ERRORS: Record<CloudErrorKind, string> = {
    credentials: "Email or password not accepted.",
    unauthorised: "That sign-in has expired. Please sign in again.",
    network: "Could not reach xBloom. Check your connection.",
    server: "xBloom could not answer that just now.",
};

export default function ImportCloudScreen() {
    // One store for the screen's lifetime. Every `new RecipeDatabase()` opens
    // SQLite and replays the table setup, and this screen re-renders on every
    // keystroke into the email and password fields. `useRecipeLibrary` guards
    // the same way, for the same reason.
    const [database] = useState(() => new RecipeDatabase());
    const cloud = useCloudImport({
        localRecipes: () => database.retrieveAllRecipes() ?? [],
        saveRecipes: (recipes) => database.insertRecipes(recipes),
        replaceRecipe: (uuid, recipe) => database.updateRecipe(uuid, recipe),
    });

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const selected = cloud.plan?.entries.filter((e) => e.selected) ?? [];

    /**
     * Take the password, then let go of it.
     *
     * The caveat above promises the password is used for the request and not
     * stored. React state is storage: left in place it lived as long as the
     * screen did, sitting in a rendered component for the rest of the session,
     * which is not what the caveat says and not what the rest of this feature
     * does. Cleared before the await rather than after, so a sign-in that
     * fails, hangs or is walked away from does not leave it behind either.
     *
     * `secret` is copied out first not because `setPassword` would blank the
     * argument -- it would not, `password` here is this render's value and the
     * two lines are interchangeable -- but so that they stay interchangeable.
     * Read in the other order this looks like a use-after-clear, which invites
     * a reordering that would then be load-bearing.
     *
     * The field emptying on submit is also the honest reading of what happened
     * to it, and a failed sign-in asks for the password again, which is what
     * every sign-in form does.
     */
    function submit() {
        const secret = password;
        setPassword("");
        void cloud.submitSignIn(email, secret);
    }

    /**
     * The same reasoning as the Settings sign-out, and the same words.
     *
     * `signOut` propagates a locked keychain deliberately: someone believing
     * they signed out of an account they had not is the one failure here with
     * a privacy cost. So the failure has to be said out loud, and the screen
     * has to keep showing a connected account, because that is still true.
     * Unhandled, it was an unhandled rejection and no warning at all.
     */
    async function signOutOfCloud() {
        try {
            await cloud.forgetAccount();
        } catch {
            notify({
                tone:    "error",
                message: "Could not sign out. The account is still connected."
            });
        }
    }

    /**
     * Import, say what happened, and leave.
     *
     * The toast rather than a screen the user has to dismiss: the library is
     * where the recipes now are, and the spec asks the existing toast to
     * report the outcome. `confirm` hands back its result instead of the
     * screen reading it out of state, which after the await would be the
     * count captured at the last render.
     */
    async function finish() {
        const outcome = await cloud.confirm();
        if (!outcome) return;
        notify(outcome.failed
            ? {
                tone: "error",
                message: outcome.imported === 0
                    ? "Could not import your recipes."
                    // The ones that landed are real and the user keeps them,
                    // so the message says what it got, not only what it lost.
                    : `Imported ${recipes(outcome.imported)}, then something went wrong.`,
            }
            : {tone: "success", message: `Imported ${recipes(outcome.imported)}.`});
        router.back();
    }

    return (
        <YStack flex={1} backgroundColor={palette.base}>
            <ScreenHeader title="xBloom account" onBack={() => router.back()}/>

            <ScrollView>
                <YStack gap="$4" paddingHorizontal="$4" paddingBottom="$6">
                    {cloud.error && (
                        <Text color={palette.danger} fontSize={14}>
                            {ERRORS[cloud.error as CloudErrorKind]}
                        </Text>
                    )}

                    {(cloud.status === "signedOut" || cloud.status === "signingIn") && (
                        <>
                            {/* Before the fields, not after. A caveat placed
                                under a submit button has already been walked
                                past by everyone who was going to walk past it. */}
                            <Text color={palette.dim} fontSize={13}>
                                This is not an official xBloom feature. It signs in
                                the way the xBloom app does, using endpoints xBloom
                                has never published. There is some risk to your
                                account in using it. They could change or withdraw
                                those endpoints at any time, and have not
                                sanctioned this use.
                            </Text>

                            {/* A second node, not a blank line inside the first:
                                a blank line in one Text collapses, and the
                                reassurance would run straight on from the risk. */}
                            <Text color={palette.dim} fontSize={13}>
                                Your email and password go directly to xBloom, never
                                to us or to anyone else. This phone keeps your email
                                address and a revocable token, in the device
                                keychain. Your password is never stored.
                            </Text>

                            <Input
                                accessibilityLabel="Email"
                                placeholder="Email"
                                placeholderTextColor={palette.dim as ColorTokens}
                                autoCapitalize="none"
                                keyboardType="email-address"
                                value={email}
                                onChangeText={setEmail}/>
                            <Input
                                accessibilityLabel="Password"
                                placeholder="Password"
                                placeholderTextColor={palette.dim as ColorTokens}
                                autoCapitalize="none"
                                secureTextEntry
                                value={password}
                                onChangeText={setPassword}/>

                            <Button
                                accessibilityLabel="Sign in"
                                // Tamagui's Button does not mirror `disabled`
                                // into accessibilityState, so a disabled button
                                // would announce itself as available. Said here.
                                accessibilityState={{disabled: cloud.status === "signingIn"}}
                                disabled={cloud.status === "signingIn"}
                                backgroundColor={palette.raised}
                                color={palette.text}
                                onPress={() => submit()}>
                                {cloud.status === "signingIn" ? "Signing in…" : "Sign in"}
                            </Button>
                        </>
                    )}

                    {(cloud.status === "listing" || cloud.status === "restoring") && (
                        <Text color={palette.dim}>Reading your recipes…</Text>
                    )}

                    {cloud.status === "choosing" && !cloud.plan && (
                        // Signed in, but the listing did not arrive. The error
                        // above says why; without this there is nothing to
                        // press and `refresh` is unreachable from the screen.
                        <Button
                            accessibilityLabel="Try again"
                            backgroundColor={palette.raised}
                            color={palette.text}
                            onPress={() => cloud.refresh()}>
                            Try again
                        </Button>
                    )}

                    {cloud.status === "choosing" && cloud.plan && (
                        <>
                            {cloud.plan.entries.length === 0 && (
                                <Text color={palette.dim}>
                                    No recipes to import. This lists the recipes you
                                    created in xBloom, not ones you have opened from
                                    a link.
                                </Text>
                            )}

                            {cloud.plan.entries.map((entry) => (
                                <CloudImportRow
                                    key={entry.cloudId}
                                    entry={entry}
                                    onToggle={cloud.toggle}/>
                            ))}

                            {cloud.plan.unreadable > 0 && (
                                // Said out loud. A recipe quietly missing from a
                                // list is the one failure the user cannot notice.
                                <Text color={palette.dim} fontSize={13}>
                                    {`${recipes(cloud.plan.unreadable)} could not be read and ` +
                                        (cloud.plan.unreadable === 1 ? "was" : "were") +
                                        " left out."}
                                </Text>
                            )}

                            {cloud.plan.duplicated > 0 && (
                                // Counted for the same reason as unreadable:
                                // the list is shorter than the account and the
                                // user should be told why, not left to wonder.
                                <Text color={palette.dim} fontSize={13}>
                                    {`${recipes(cloud.plan.duplicated)} appeared twice in your ` +
                                        "account and " +
                                        (cloud.plan.duplicated === 1 ? "was" : "were") +
                                        " listed once."}
                                </Text>
                            )}

                            {cloud.plan.entries.length > 0 && (
                                <Button
                                    accessibilityLabel={`Import ${recipes(selected.length)}`}
                                    accessibilityState={{disabled: selected.length === 0}}
                                    disabled={selected.length === 0}
                                    backgroundColor={palette.raised}
                                    color={palette.text}
                                    onPress={finish}>
                                    {`Import ${recipes(selected.length)}`}
                                </Button>
                            )}
                        </>
                    )}

                    {cloud.status === "importing" && (
                        <Text color={palette.dim}>Importing…</Text>
                    )}

                    {/* `done` draws nothing on purpose. `finish` reports the
                        outcome in a toast and closes the screen, so a state
                        here would be a screen the user never reaches and a
                        second Done button beside the one that already left. */}

                    {cloud.session && (
                        // `Session.email` exists so the user can see which
                        // account is connected; without it "Sign out" asks them
                        // to revoke something they cannot identify.
                        <Text color={palette.dim} fontSize={13}>
                            {`Signed in as ${cloud.session.email}`}
                        </Text>
                    )}

                    {cloud.session && (
                        <Button
                            accessibilityLabel="Sign out"
                            chromeless
                            color={palette.danger}
                            onPress={() => {
                                void signOutOfCloud();
                            }}>
                            Sign out
                        </Button>
                    )}
                </YStack>
            </ScrollView>
        </YStack>
    );
}
