import express, { Router } from "express";
import { env } from "../config/env.js";
import { asyncHandler, ApiError } from "../lib/http.js";
import { parseEvents, verifyWebhookSignature } from "../lib/instagram/policy.js";
import { ingestInstagramEvent } from "../lib/instagram/events.js";
export const instagramWebhookRouter=Router();
instagramWebhookRouter.get('/instagram/webhook',(req,res)=>{
 if(env.META_WEBHOOK_VERIFY_TOKEN && req.query['hub.mode']==='subscribe' && req.query['hub.verify_token']===env.META_WEBHOOK_VERIFY_TOKEN) res.send(req.query['hub.challenge']);
 else res.sendStatus(403);
});
instagramWebhookRouter.post('/instagram/webhook',express.raw({type:'application/json',limit:'256kb'}),asyncHandler(async(req,res)=>{
 if(!Buffer.isBuffer(req.body) || !verifyWebhookSignature(req.body,req.get('x-hub-signature-256'),env.META_APP_SECRET)) throw new ApiError(403,'Invalid webhook signature');
 let body; try {body=JSON.parse(req.body.toString('utf8'));} catch {throw new ApiError(400,'Invalid webhook JSON');}
 if(!body || typeof body!=='object' || !Array.isArray(body.entry)) throw new ApiError(400,'Invalid webhook payload');
 const events=parseEvents(body);
 for(const event of events) await ingestInstagramEvent(event);
 res.status(200).send('EVENT_RECEIVED');
}));
