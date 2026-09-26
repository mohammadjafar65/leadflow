import { lazy, Suspense, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import { useAuth } from "@/App";
import { ArrowUpRight, Search, LayoutDashboard, Users, Send, GitBranch, Instagram, Settings, LogOut, Menu, X, Moon, Sun, Sprout } from "lucide-react";
import { cn } from "@/lib/utils";
const Overview=lazy(()=>import('@/features/overview/overview-page').then(m=>({default:m.OverviewPage})));
const Pipeline=lazy(()=>import('@/features/pipeline/pipeline-page').then(m=>({default:m.PipelinePage})));
const Discovery=lazy(()=>import('@/features/discovery/discovery-page').then(m=>({default:m.DiscoveryPage})));
const Outreach=lazy(()=>import('@/features/outreach-engine/outreach-page').then(m=>({default:m.OutreachPage})));
const Sequences=lazy(()=>import('@/features/sequences/sequences-page').then(m=>({default:m.SequencesPage})));
const InstagramPage=lazy(()=>import('@/features/instagram/instagram-page').then(m=>({default:m.InstagramPage})));
const SettingsPage=lazy(()=>import('@/features/settings/settings-page').then(m=>({default:m.SettingsPage})));
const links=[{to:'/overview',label:'Overview',icon:LayoutDashboard},{to:'/discovery',label:'Discover',icon:Search},{to:'/',label:'Lead pipeline',icon:Users},{to:'/outreach',label:'Outreach',icon:Send},{to:'/sequences',label:'Sequences',icon:GitBranch},{to:'/instagram',label:'Instagram',icon:Instagram}];
export function AppShell(){
 const {user,logout}=useAuth();const {resolvedTheme,setTheme}=useTheme();const [open,setOpen]=useState(false);const location=useLocation();
 const label=links.find(l=>l.to===location.pathname)?.label??'Settings';
 return <div className="flex h-dvh overflow-hidden bg-background">
  {open&&<button className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={()=>setOpen(false)} aria-label="Close navigation"/>}
  <aside className={cn('workspace-sidebar fixed inset-y-0 left-0 z-40 flex w-60 flex-col transition-transform lg:static lg:translate-x-0',open?'translate-x-0':'-translate-x-full')}>
   <div className="flex items-center justify-between px-6 py-8"><NavLink to="/overview" className="flex items-center gap-2.5 text-xl font-semibold tracking-tight"><Sprout className="h-7 w-7 text-lime-300"/>leadflow<span className="text-lime-300">.</span></NavLink><button className="lg:hidden" onClick={()=>setOpen(false)} aria-label="Close navigation"><X size={20}/></button></div>
   <div className="mx-4 mb-8 rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-[10px] uppercase tracking-[.18em] text-white/45">Your workspace</p><p className="mt-1 truncate text-sm">{user?.orgName}</p></div>
   <nav aria-label="Main navigation" className="flex-1 space-y-1 px-3"><p className="px-3 pb-3 text-[10px] tracking-[.2em] text-white/35">WORKSPACE</p>{links.map(({to,label,icon:Icon})=><NavLink key={to} end to={to} onClick={()=>setOpen(false)} className={({isActive})=>cn('flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors',isActive?'bg-[#d5edb5] text-[#173c30]':'text-white/65 hover:bg-white/5 hover:text-white')}><Icon size={17}/>{label}</NavLink>)}</nav>
   <div className="mx-4 mb-5 rounded-xl border border-white/10 p-4"><p className="text-sm text-white/90">Better data. Better conversations.</p><p className="mt-2 text-xs leading-relaxed text-white/45">Build your pipeline from observed business information.</p><NavLink to="/discovery" className="mt-3 flex items-center gap-2 text-xs text-lime-200">Find your next lead <ArrowUpRight size={14}/></NavLink></div>
   <div className="border-t border-white/10 p-3"><NavLink to="/settings" onClick={()=>setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/65 hover:bg-white/5"><Settings size={17}/>Settings</NavLink><div className="mt-2 flex items-center gap-3 px-3 py-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs">{user?.email?.[0].toUpperCase()}</span><span className="min-w-0 flex-1 truncate text-xs text-white/65">{user?.email}</span><button onClick={()=>void logout()} aria-label="Sign out" className="text-white/60 hover:text-white"><LogOut size={15}/></button></div></div>
  </aside>
  <div className="flex min-w-0 flex-1 flex-col"><header className="flex h-16 shrink-0 items-center justify-between border-b bg-card/70 px-5 lg:px-9"><div className="flex items-center gap-3"><button className="lg:hidden" onClick={()=>setOpen(true)} aria-label="Open navigation" aria-expanded={open}><Menu size={20}/></button><span className="text-xs text-muted-foreground">Workspace <span className="mx-3 opacity-40">/</span><span className="text-foreground">{label}</span></span></div><div className="flex items-center gap-4"><span className="hidden text-xs text-muted-foreground sm:inline">A little more intentional.</span><button aria-label="Toggle color theme" onClick={()=>setTheme(resolvedTheme==='dark'?'light':'dark')} className="rounded-full border p-2">{resolvedTheme==='dark'?<Sun size={15}/>:<Moon size={15}/>}</button></div></header>
   <main id="main-content" className="min-h-0 flex-1 overflow-auto"><Suspense fallback={<div role="status" className="p-10 text-sm text-muted-foreground">Loading workspace…</div>}><Routes><Route path="/overview" element={<Overview/>}/><Route path="/" element={<Pipeline/>}/><Route path="/discovery" element={<Discovery/>}/><Route path="/outreach" element={<Outreach/>}/><Route path="/sequences" element={<Sequences/>}/><Route path="/instagram" element={<InstagramPage/>}/><Route path="/settings" element={<SettingsPage/>}/><Route path="*" element={<Navigate to="/overview" replace/>}/></Routes></Suspense></main>
  </div>
 </div>;
}
