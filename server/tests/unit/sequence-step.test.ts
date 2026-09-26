import { it, expect } from 'vitest';
import { parseStepConfig, nextStep } from '../../src/lib/sequences/advance.js';
it('rejects invalid delay and looping branch destinations',()=>{
 expect(()=>parseStepConfig('delay',{delay_hours:-1},1)).toThrow();
 expect(()=>parseStepConfig('condition',{condition:'replied',on_true:1,on_false:3},1)).toThrow();
 expect(()=>parseStepConfig('send_email',{template_id:'foreign-or-invalid'},1)).toThrow();
});
it('advances a bounded branch based on observed events',()=>{
 expect(nextStep(2,{condition:'replied',on_true:4,on_false:3},true)).toBe(4);
 expect(nextStep(2,{condition:'replied',on_true:4,on_false:3},false)).toBe(3);
});
