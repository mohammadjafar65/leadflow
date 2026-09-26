import crypto from "node:crypto";
export function verifyWebhookSignature(body, signature, secret) {
    if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature))
        return false;
    return crypto.timingSafeEqual(crypto.createHmac('sha256', secret).update(body).digest(), Buffer.from(signature.slice(7), 'hex'));
}
export function matchesAutomation(rule, event) {
    if (rule.ig_user_id !== event.accountId || event.recipientId === event.accountId)
        return false;
    const trigger = event.kind === 'comment' ? 'comment_to_dm' : event.kind === 'message' ? 'keyword_dm' : 'story_reply';
    if (rule.trigger_type !== trigger || rule.target_media_id && rule.target_media_id !== event.mediaId)
        return false;
    return !rule.keywords?.length || rule.keywords.some(k => event.text.toLocaleLowerCase().includes(k.toLocaleLowerCase()));
}
export function parseEvents(payload) {
    if (payload.object !== 'instagram' && payload.object !== 'page')
        return [];
    const result = [];
    for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
            const v = change.value;
            if (change.field === 'comments' && v.id && v.from?.id && typeof v.text === 'string')
                result.push({ accountId: entry.id, sourceId: v.id, kind: 'comment', recipientId: v.from.id, username: v.from.username, mediaId: v.media?.id, text: v.text });
        }
        for (const item of entry.messaging ?? []) {
            const m = item.message;
            if (m?.mid && !m.is_echo && item.sender?.id && typeof m.text === 'string')
                result.push({ accountId: entry.id, sourceId: m.mid, kind: m.reply_to?.story ? 'story_reply' : 'message', recipientId: item.sender.id, mediaId: m.reply_to?.story?.id, text: m.text });
        }
    }
    return result;
}
//# sourceMappingURL=policy.js.map