import {router} from "expo-router";
import React, {useState} from "react";
import {ScrollView} from "react-native";
import {Button, Input, Text, YStack, type ColorTokens} from "tamagui";

import CloudImportRow from "@/components/CloudImportRow";
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

const ERRORS: Record<CloudErrorKind, string> = {
    credentials: "Email or password not accepted.",
    unauthorised: "That sign-in has expired. Please sign in again.",
    network: "Could not reach xBloom. Check your connection.",
    server: "xBloom could not answer that just now.",
};

export default function ImportCloudScreen() {
    const database = new RecipeDatabase();
    const cloud = useCloudImport({
        localRecipes: () => database.retrieveAllRecipes() ?? [],
        saveRecipes: (recipes) => database.insertRecipes(recipes),
        replaceRecipe: (uuid, recipe) => database.updateRecipe(uuid, recipe),
    });

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const selected = cloud.plan?.entries.filter((e) => e.selected) ?? [];

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
                                This is not an official xBloom feature. Signing in
                                sends your email and password directly to xBloom,
                                never to us or to anyone else. Only a revocable
                                token is kept on this phone — your password is
                                never stored.
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
                                disabled={cloud.status === "signingIn"}
                                backgroundColor={palette.raised}
                                color={palette.text}
                                onPress={() => cloud.submitSignIn(email, password)}>
                                {cloud.status === "signingIn" ? "Signing in…" : "Sign in"}
                            </Button>
                        </>
                    )}

                    {(cloud.status === "listing" || cloud.status === "restoring") && (
                        <Text color={palette.dim}>Reading your recipes…</Text>
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
                                    {cloud.plan.unreadable} recipes could not be read
                                    and were left out.
                                </Text>
                            )}

                            {cloud.plan.entries.length > 0 && (
                                <Button
                                    accessibilityLabel={
                                        `Import ${selected.length} recipe` +
                                        (selected.length === 1 ? "" : "s")
                                    }
                                    disabled={selected.length === 0}
                                    backgroundColor={palette.raised}
                                    color={palette.text}
                                    onPress={() => cloud.confirm()}>
                                    {`Import ${selected.length} recipe` +
                                        (selected.length === 1 ? "" : "s")}
                                </Button>
                            )}
                        </>
                    )}

                    {cloud.status === "importing" && (
                        <Text color={palette.dim}>Importing…</Text>
                    )}

                    {cloud.status === "done" && (
                        <>
                            <Text color={palette.text}>
                                {`Imported ${cloud.imported} recipe` +
                                    (cloud.imported === 1 ? "" : "s") + "."}
                            </Text>
                            <Button onPress={() => router.back()}>Done</Button>
                        </>
                    )}

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
                            onPress={() => cloud.forgetAccount()}>
                            Sign out
                        </Button>
                    )}
                </YStack>
            </ScrollView>
        </YStack>
    );
}
