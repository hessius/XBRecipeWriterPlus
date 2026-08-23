import ValidatedInput from "@/components/ValidatedInput";

import Recipe, {CUP_TYPE, isValidXID, XID_LENGTH} from "@/library/Recipe";
import {AntDesign} from "@expo/vector-icons";
import {useLocalSearchParams, useNavigation} from "expo-router";
import React, {useCallback, useEffect, useRef, useState} from "react";
import {ActivityIndicator, Pressable, useWindowDimensions} from "react-native";
import {Button, getTokens, H6, ScrollView, Text, XStack, YStack} from "tamagui";
import {MyButtonGroup} from "@/components/MyButtonGroup";
import LabeledInput from "@/components/LabeledInput";
import TotalVolumeComponent from "@/components/TotalVolumeComponent";
import TooltipComponent from "@/components/TooltipComponent";
import NfcOverlay from "@/components/NfcOverlay";
import Svg, {Path} from "react-native-svg";
import Pour, {POUR_PATTERN} from "@/library/Pour";
import {palette} from '@/constants/colors';
import IconButton from "@/components/IconButton";
import RestoreDialog, {RestoreOption} from "@/components/RestoreDialog";
import {useCardWriter} from "@/hooks/useCardWriter";
import {RECIPE_LABELS, useRecipeEditor} from "@/hooks/useRecipeEditor";


export default function EditRecipe() {
    const {recipeJSON, saveEnabled} = useLocalSearchParams();
    // disable scrolling when using sliders
    const scrollViewRefs = useRef<Map<string, ScrollView>>(new Map());
    const handleSlidingChange = useCallback((sliding: boolean) => {
        scrollViewRefs.current.forEach(scrollView => {
            scrollView.setNativeProps({scrollEnabled: !sliding});
        });
    }, []);
    const setScrollViewRef = useCallback((key: string) => (ref: ScrollView | null) => {
        if (ref) {
            scrollViewRefs.current.set(key, ref);
        } else {
            scrollViewRefs.current.delete(key);
        }
    }, []);

    const ON_OFF_BUTTON_CONFIG = {
        buttons:      [1, 0],
        getLabelText: (id: number) => id === 1 ? "On" : "Off"
    };

    const navigation = useNavigation();
    const {width} = useWindowDimensions();

    const {
        recipe, getRecipe, enableSave, inputError, setInputError, isLoadingTitle,
        balance, revertSources,
        bumpKey, handleReloadTitlePress, addPour, deletePour, autoAdjustPourVolumes,
        saveRecipe, editInputComplete, setVolumeError
    } = useRecipeEditor({
        recipeJSON:           recipeJSON as string | undefined,
        initiallySaveEnabled: saveEnabled === "true",
        onSaved:              () => navigation.goBack()
    });

    // The revert sheet's open state now belongs to the screen, not the hook.
    // Task 14 replaces this screen and dialog wholesale; this is the smallest
    // bridge that keeps the old one compiling against the new hook shape.
    const [showRestoreDialog, setShowRestoreDialog] = useState(false);
    const restoreOptions: RestoreOption[] = revertSources
        .filter((s) => s.available)
        .map((s) => ({id: s.id, label: s.label, action: s.action}));

    function restoreRecipe() {
        setShowRestoreDialog(true);
    }

    const {writeCard, onNFCDialogClose, showNfcOverlay, writeProgress} = useCardWriter(setVolumeError);


    function writeCardIcon() {
        return (
            <Svg width="40" height="35" viewBox="0 0 24 24" fill="none">
                <Path
                    d="M2,8.5h12.5M6,16.5h2M10.5,16.5h4M22,14.03v2.08c0,3.51-.89,4.39-4.44,4.39H6.44c-3.55,0-4.44-.88-4.44-4.39V7.89c0-3.51.89-4.39,4.44-4.39h8.06M20,9.5V3.5M20,3.5l-2,2M20,3.5l2,2"
                    stroke={palette.text} stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
            </Svg>
        )
    }

    useEffect(() => {
        navigation.setOptions({
            title:       'Edit Recipe',
            headerShown: true,
            headerRight: () => <IconButton onPress={() => writeCard(recipe)} title="" icon={writeCardIcon()}/>
        })
    }, [navigation, recipe]);


    return (
        <>
            {recipe ?
                <YStack maxWidth="100%" flex={1}>
                    <XStack flex={1}>
                        <ScrollView showsVerticalScrollIndicator={false} margin="$2" nestedScrollEnabled={true}
                                    ref={setScrollViewRef('vertical')}>
                            <YStack maxWidth="100%">
                                <XStack alignItems="center">
                                    <LabeledInput setErrorFunction={setInputError} maxLength={100}
                                                  initialValue={getRecipe()!.name}
                                                  label={RECIPE_LABELS.TITLE}
                                                  onValidEditFunction={editInputComplete}
                                                  validateInput={(data) => {
                                                      return data.length > 0;
                                                  }}
                                                  errorMessage="You must have a title"
                                                  key={`title-${isLoadingTitle}`}
                                                  disabled={isLoadingTitle}
                                    />
                                    <XStack paddingLeft={"$4"} paddingRight={"$3"}>
                                        {/* The refresh only ever queries by XID, so without one the
                                            button is inert — disable it rather than let it silently
                                            do nothing. */}
                                        <Pressable onPress={handleReloadTitlePress}
                                                   disabled={isLoadingTitle || !getRecipe()?.xid?.trim()}
                                                   accessibilityLabel="Refresh the name from xBloom">
                                            {isLoadingTitle ? (
                                                <ActivityIndicator size={30} color={palette.muted}/>
                                            ) : (
                                                <AntDesign name="sync" size={30} color={palette.muted}/>
                                            )}
                                        </Pressable>
                                    </XStack>
                                </XStack>
                                <XStack>
                                    <LabeledInput setErrorFunction={setInputError} maxLength={XID_LENGTH}
                                                  initialValue={getRecipe()!.xid} label={RECIPE_LABELS.XID}
                                                  onValidEditFunction={editInputComplete}
                                                  validateInput={isValidXID}
                                                  errorMessage="Use a 3-letter vendor code, an optional T for tea, then 2-3 digits (e.g. CGL12, CGLT123). Leave empty for no online lookup."/>
                                    <XStack flex={1} paddingLeft={"$2"}>
                                        <TooltipComponent
                                            content="Recipe ID used by the app to find recipes online. Format: <VENDOR>[T]<NUM> (3-char vendor code, optional T for tea, 2-3 digit number). The card does not store the recipe name, only this ID, so a card written without an XID will read back with an empty name. Remove or change to prevent wrong recipe display in app (machine will still work)."/>
                                    </XStack>
                                </XStack>
                                <ValidatedInput setErrorFunction={setInputError} initialValue={getRecipe()!.dosage}
                                                minimumValue={1} maximumValue={getRecipe()!.isTea() ? 10 : 31} step={1}
                                                label={RECIPE_LABELS.DOSE}
                                                maxLength={2} inputMode="numeric"
                                                onValidEditFunction={editInputComplete}
                                                onIsSlidingChange={handleSlidingChange}
                                />
                                <ValidatedInput setErrorFunction={setInputError} initialValue={getRecipe()!.ratio}
                                                minimumValue={5} maximumValue={100} step={1} label={RECIPE_LABELS.RATIO}
                                                maxLength={3}
                                                inputMode="numeric" onValidEditFunction={editInputComplete}
                                                onIsSlidingChange={handleSlidingChange}
                                />
                                {(getRecipe()!.grinder && !getRecipe()!.isTea()) && (
                                    <>
                                        <ValidatedInput setErrorFunction={setInputError}
                                                        initialValue={getRecipe()!.grindSize}
                                                        minimumValue={40} maximumValue={80} step={1}
                                                        label={RECIPE_LABELS.GRIND_SIZE}
                                                        maxLength={2} inputMode="numeric"
                                                        onValidEditFunction={editInputComplete}
                                                        onIsSlidingChange={handleSlidingChange}
                                        />
                                        <ValidatedInput setErrorFunction={setInputError}
                                                        initialValue={getRecipe()!.grindRPM}
                                                        minimumValue={60} maximumValue={120} step={10}
                                                        label={RECIPE_LABELS.GRIND_RPM}
                                                        maxLength={3} inputMode="numeric"
                                                        onValidEditFunction={editInputComplete}
                                                        onIsSlidingChange={handleSlidingChange}
                                        />
                                    </>
                                )}
                                {!getRecipe()!.isTea() && (
                                    <>
                                        <XStack>
                                            <MyButtonGroup initialValue={"" + getRecipe()!.cupType}
                                                           label={RECIPE_LABELS.CUP}
                                                           size="$4" minWidth={"$5"}
                                                           orientation="horizontal"
                                                           onToggle={(val) => editInputComplete(RECIPE_LABELS.CUP, val)}
                                                           buttons={[CUP_TYPE.XPOD, CUP_TYPE.OMNI, CUP_TYPE.OTHER]}
                                                           getLabelText={Recipe.getCupTypeText}
                                            />
                                            <TooltipComponent
                                                content={"Omni type disables overflow protection. Other type is used for third-party brewers."}/>
                                        </XStack>
                                        <XStack>
                                            <MyButtonGroup initialValue={getRecipe()!.grinder ? "1" : "0"}
                                                           label={RECIPE_LABELS.GRINDER} size="$4" minWidth={"$5"}
                                                           orientation="horizontal"
                                                           onToggle={(val) => editInputComplete(RECIPE_LABELS.GRINDER, val)}
                                                           buttons={ON_OFF_BUTTON_CONFIG.buttons}
                                                           getLabelText={ON_OFF_BUTTON_CONFIG.getLabelText}
                                            />
                                            <TooltipComponent
                                                content={"Disabling grinder is experimental. It sets grind size to 81 (instead of 80 max). However, machine will not accept the card with the grinder disabled. As a workaround, you can load any other recipe with the grinder enabled first, either via a shortcut button, another card or an app. Once any other recipe is already loaded, the card with disabled grinder will work and you'll see '--' for the grind size. At the moment there is no better way to disable grinder from the recipe card."}/>
                                        </XStack>
                                    </>
                                )}
                                <XStack alignItems="center" flexWrap="wrap">
                                    <XStack paddingRight="$4">
                                        <TotalVolumeComponent recipe={getRecipe()!} />
                                        <TooltipComponent
                                            content={"This field shows the total volume of all pours versus the total volume based on your dosage and ratio (sum of all pour volumes / dose × ratio). The numbers need to match for a valid recipe that the machine will accept. Adjust pour volumes, ratio, and dose as needed.\n\nTea recipes show 90ml per pour, but the actual volume in the cup will be 120ml per pour since the machine automatically adds ~30ml to trigger the siphon. If the siphon triggers prematurely due to wet leaf expansion, reduce the volume of the latter steeps."}/>
                                    </XStack>
                                    <Button borderWidth={2} flex={1}
                                            pressStyle={{backgroundColor: palette.dim, borderColor: palette.muted}}
                                            borderColor={palette.muted} paddingHorizontal="$3" paddingVertical="$2"
                                            marginHorizontal="$2" marginVertical="$2" backgroundColor={palette.text}
                                            disabledStyle={{opacity: 0.5}}
                                            fontWeight={700} fontSize="$5" color={palette.base} minWidth="100"
                                            onPress={() => autoAdjustPourVolumes()}
                                            disabled={balance.balanced}
                                    >
                                        Auto
                                    </Button>
                                </XStack>

                                <ScrollView showsHorizontalScrollIndicator={false} centerContent={true} horizontal
                                            pagingEnabled={true} nestedScrollEnabled={true} removeClippedSubviews={true}
                                            ref={setScrollViewRef('horizontal')}
                                >
                                    {getRecipe() ? getRecipe()!.pours.map((pour, index) => (
                                        <YStack width={width - getTokens().size["$2"].val} key={index} borderWidth={2}
                                                borderColor={palette.muted} marginInline="$2" borderRadius={10}>
                                            <YStack padding="$2">
                                                <XStack justifyContent="space-between">
                                                    <H6 fontSize={20}
                                                        fontWeight={700}>Pour {pour.getPourNumber()} of {getRecipe()?.pours.length}</H6>
                                                    <XStack paddingRight="$2">
                                                        <XStack paddingRight="$2">
                                                            <IconButton onPress={() => deletePour(index)} title=""
                                                                        icon={<AntDesign name="close-square" size={24}
                                                                                         color={palette.danger}/>}></IconButton>
                                                        </XStack>
                                                        <IconButton onPress={() => addPour(index)} title=""
                                                                    icon={<AntDesign name="plus-square" size={24}
                                                                                     color={palette.success}/>}></IconButton>
                                                    </XStack>
                                                </XStack>
                                                <ValidatedInput setErrorFunction={setInputError}
                                                                initialValue={pour.getVolume()} minimumValue={1}
                                                                maximumValue={getRecipe()!.isTea() ? 90 : 240} step={1}
                                                                pourNumber={index} label={RECIPE_LABELS.VOLUME}
                                                                maxLength={3}
                                                                inputMode="numeric" style={{maxWidth: 100}}
                                                                onValidEditFunction={editInputComplete}
                                                                onIsSlidingChange={handleSlidingChange}
                                                />

                                                <ValidatedInput setErrorFunction={setInputError}
                                                                initialValue={pour.getTemperature()} minimumValue={39}
                                                                maximumValue={99} step={1} pourNumber={index}
                                                                label={RECIPE_LABELS.TEMPERATURE} maxLength={2}
                                                                inputMode="numeric"
                                                                onValidEditFunction={editInputComplete}
                                                                onIsSlidingChange={handleSlidingChange}
                                                />

                                                <ValidatedInput setErrorFunction={setInputError}
                                                                initialValue={pour.getFlowRate()} minimumValue={30}
                                                                maximumValue={35} step={1} floatingPoint
                                                                pourNumber={index} label={RECIPE_LABELS.FLOW_RATE}
                                                                maxLength={4}
                                                                inputMode="decimal"
                                                                onValidEditFunction={editInputComplete}
                                                                onIsSlidingChange={handleSlidingChange}
                                                />

                                                <ValidatedInput setErrorFunction={setInputError}
                                                                initialValue={pour.getPauseTime()} minimumValue={0}
                                                                maximumValue={getRecipe()!.isTea() ? 360 : 59} step={1}
                                                                pourNumber={index} label={RECIPE_LABELS.PAUSING}
                                                                maxLength={3}
                                                                inputMode="numeric"
                                                                onValidEditFunction={editInputComplete}
                                                                onIsSlidingChange={handleSlidingChange}
                                                />

                                                <MyButtonGroup initialValue={"" + pour.getPourPattern()} minWidth={"$6"}
                                                               label="Pattern" size="$4" orientation="horizontal"
                                                               onToggle={(val) => editInputComplete(RECIPE_LABELS.PATTERN, val, index)}
                                                               buttons={Object.values(POUR_PATTERN)}
                                                               getLabelText={Pour.getPourPatternText}
                                                />
                                                {!getRecipe()!.isTea() && (
                                                    <>
                                                        <MyButtonGroup
                                                            initialValue={pour.getAgitationBefore() ? "1" : "0"}
                                                            label={RECIPE_LABELS.AGITATION_BEFORE} size="$4"
                                                            minWidth={"$11"}
                                                            orientation="horizontal"
                                                            onToggle={(val) => editInputComplete(RECIPE_LABELS.AGITATION_BEFORE, val, index)}
                                                            buttons={ON_OFF_BUTTON_CONFIG.buttons}
                                                            getLabelText={ON_OFF_BUTTON_CONFIG.getLabelText}

                                                        />
                                                        <MyButtonGroup
                                                            initialValue={pour.getAgitationAfter() ? "1" : "0"}
                                                            label={RECIPE_LABELS.AGITATION_AFTER} size="$4"
                                                            minWidth={"$11"}
                                                            orientation="horizontal"
                                                            onToggle={(val) => editInputComplete(RECIPE_LABELS.AGITATION_AFTER, val, index)}
                                                            buttons={ON_OFF_BUTTON_CONFIG.buttons}
                                                            getLabelText={ON_OFF_BUTTON_CONFIG.getLabelText}
                                                        />
                                                    </>
                                                )}
                                            </YStack>
                                        </YStack>
                                    )) : ""}
                                </ScrollView>
                            </YStack>
                        </ScrollView>
                    </XStack>
                    {!balance.balanced && (
                        <Text accessibilityRole="alert" fontSize={13} color={palette.danger}
                              paddingHorizontal="$3" paddingBottom="$2">
                            Your individual pour volumes must add up to the total volume.
                        </Text>
                    )}
                    <XStack paddingVertical="$2" justifyContent="center" alignContent="center" alignItems="center"
                            backgroundColor="$backgroundFocus">
                        <Button marginHorizontal={"$2"} onPress={() => restoreRecipe()} width={150} fontSize={16}
                                fontWeight={700}
                                color={palette.base} backgroundColor={palette.text}>Restore</Button>
                        <Button marginHorizontal={"$4"} onPress={() => saveRecipe()} width={150} fontSize={16}
                                fontWeight={700}
                                disabled={inputError || !enableSave} color={palette.base}
                                backgroundColor={inputError || !enableSave ? palette.muted : palette.text}>Save</Button>
                    </XStack>
                    <NfcOverlay visible={showNfcOverlay} mode="write"
                                progress={writeProgress}
                                onCancel={onNFCDialogClose}/>
                    <RestoreDialog
                        open={showRestoreDialog}
                        onOpenChange={setShowRestoreDialog}
                        options={restoreOptions}
                        onRestored={bumpKey}
                    />
                </YStack>
                : ""}
        </>
    )
}
