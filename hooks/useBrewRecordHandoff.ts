import {useRef, useState} from "react";

import {useBrewHandoff} from "@/hooks/useBrewHandoff";
import type {BrewExportSource} from "@/hooks/useBrewExport";
import {handoffCoffee} from "@/library/brew/handoff/backfill";
import type Recipe from "@/library/Recipe";

type RecordJudgement = {
    rating: number;
    note: string;
    rate: (rating: number) => void;
    annotate: (note: string) => void;
};

/**
 * The record screen's Beanconqueror send moment.
 *
 * The opened brew remains a mount snapshot for trace/export work, so this hook
 * keeps the verdict and sent timestamp that can change during this visit and
 * overlays them on the handoff source at press time.
 */
export function useBrewRecordHandoff(
    opened: BrewExportSource | null,
    recipe: Recipe | null,
    judgement: RecordJudgement
) {
    const verdictRef = useRef({
        rating: opened?.record.rating ?? 0,
        note:   opened?.record.note ?? ""
    });
    const [sentAt, setSentAt] = useState(() => opened?.record.sentAt ?? 0);
    const [noteDraft, setNoteDraft] = useState(() => opened?.record.note ?? "");
    const [namingBean, setNamingBean] = useState(false);
    const [ratingBeforeSend, setRatingBeforeSend] = useState(false);

    const {send: sendHandoff, busy} = useBrewHandoff(() => opened === null
        ? null
        : {
            ...opened,
            record: {
                ...opened.record,
                rating: verdictRef.current.rating,
                note: verdictRef.current.note,
                sentAt
            }
        });

    function rateBrew(rating: number): void {
        verdictRef.current = {...verdictRef.current, rating};
        judgement.rate(rating);
    }

    function annotateBrew(note: string): void {
        verdictRef.current = {...verdictRef.current, note};
        judgement.annotate(note);
    }

    function commitNoteDraft(): void {
        if (noteDraft !== verdictRef.current.note) {
            annotateBrew(noteDraft);
        }
    }

    async function sendNow(beanName?: string): Promise<void> {
        const nextSentAt = await sendHandoff(beanName);
        if (nextSentAt !== null) setSentAt(nextSentAt);
    }

    function continueSend(): void {
        if (opened === null) return;
        commitNoteDraft();
        setRatingBeforeSend(false);
        if (handoffCoffee(opened.record, recipe) === undefined) {
            setNamingBean(true);
            return;
        }
        void sendNow();
    }

    function requestSend(): void {
        if (opened === null) return;
        if (judgement.rating === 0) {
            setNoteDraft(judgement.note);
            setRatingBeforeSend(true);
            return;
        }
        if (handoffCoffee(opened.record, recipe) === undefined) {
            setNamingBean(true);
            return;
        }
        void sendNow();
    }

    return {
        busy,
        sentAt,
        namingBean,
        setNamingBean,
        ratingBeforeSend,
        setRatingBeforeSend,
        setNoteDraft,
        rateBrew,
        annotateBrew,
        sendNow,
        continueSend,
        requestSend
    };
}

export default useBrewRecordHandoff;
