import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { currentAuth, requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../lib/http.js";
export const settingsRouter=Router();settingsRouter.use(requireAuth);
settingsRouter.get('/settings',asyncHandler(async(_req,res)=>{
 const auth=currentAuth(res); const {rows}=await pool.query('select u.display_name,u.email,u.role,u.preferences,o.name as organization_name from users u join organizations o on o.id=u.organization_id where u.id=$1 and u.organization_id=$2',[auth.sub,auth.org]);res.json(rows[0]);
}));
settingsRouter.patch('/settings/profile',asyncHandler(async(req,res)=>{
 const auth=currentAuth(res);const body=z.object({displayName:z.string().trim().min(1).max(120)}).parse(req.body);
 await pool.query('update users set display_name=$1 where id=$2 and organization_id=$3',[body.displayName,auth.sub,auth.org]);res.json({displayName:body.displayName});
}));
settingsRouter.patch('/settings/organization',requireRole('owner','admin'),asyncHandler(async(req,res)=>{
 const auth=currentAuth(res);const body=z.object({name:z.string().trim().min(1).max(120)}).parse(req.body);
 await pool.query('update organizations set name=$1 where id=$2',[body.name,auth.org]);res.json({name:body.name});
}));
settingsRouter.get('/overview',asyncHandler(async(_req,res)=>{
 const auth=currentAuth(res);
 const {rows}=await pool.query(`select count(*)::int as total,count(*) filter(where stage='qualified')::int as qualified,count(*) filter(where stage='closed')::int as closed,count(*) filter(where website is not null)::int as with_website from leads where organization_id=$1 and merged_into is null`,[auth.org]);
 const jobs=await pool.query('select id,kind,status,created_at,error from jobs where organization_id=$1 order by created_at desc limit 6',[auth.org]);
 const instagram=await pool.query("select count(*) filter(where status='sent')::int as sent,count(*) filter(where status in ('failed','unknown'))::int as needs_attention from ig_automation_events where organization_id=$1",[auth.org]);
 res.json({leads:rows[0],jobs:jobs.rows,instagram:instagram.rows[0]});
}));
