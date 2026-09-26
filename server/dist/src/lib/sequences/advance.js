import { z } from 'zod';
export function parseStepConfig(kind, config, order) {
    if (kind === 'delay')
        return z.object({ delay_hours: z.number().finite().min(0).max(8760) }).parse(config);
    if (kind === 'send_email')
        return z.object({ template_id: z.string().uuid() }).parse(config);
    if (kind === 'condition' || kind === 'branch')
        return z.object({ condition: z.enum(['opened', 'replied', 'clicked']), on_true: z.number().int().gt(order), on_false: z.number().int().gt(order) }).parse(config);
    throw new Error('Unsupported sequence step');
}
export function nextStep(order, config, matched) { return Number(matched ? config.on_true ?? order + 1 : config.on_false ?? order + 1); }
//# sourceMappingURL=advance.js.map