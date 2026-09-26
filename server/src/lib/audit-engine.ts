import { fetchPublicText } from "./safe-fetch.js";
export interface AuditPillarScore {
  score: number; // 0..100
  status: "good" | "needs_improvement" | "poor" | "not_measured";
  summary: string;
  details: string[];
}

export interface AuditFinding {
  area: "Conversion" | "Mobile" | "Performance" | "Trust" | "SEO" | "UX" | "Technical" | "Security";
  title: string;
  technicalCause: string;
  businessImpact: string;
  solution: string;
  severity: "high" | "medium" | "low";
}

export interface AuditReport {
  overallScore: number;
  qualificationScore: number;
  isIcp: boolean;
  icpReason: string;
  isParkedOrDead?: boolean;
  siteStatus?: "active" | "parked" | "dead";
  parkedProvider?: string;
  techStack: string[];
  pillars: {
    performance: AuditPillarScore;
    mobile: AuditPillarScore;
    ux: AuditPillarScore;
    conversion: AuditPillarScore;
    seo: AuditPillarScore;
    technical: AuditPillarScore;
    security: AuditPillarScore;
  };
  findings: AuditFinding[];
  positiveObservation: string;
  priorityRecommendation: string;
  priorityBenefit: string;
  generatedEmail: {
    subject: string;
    bodyText: string;
    bodyHtml: string;
  };
  auditedAt: string;
}

const ICP_CATEGORIES = [
  "restaurant",
  "professional services",
  "technology",
  "software",
  "saas",
  "ecommerce",
  "real estate",
  "healthcare",
  "dental",
  "law",
  "legal",
  "consulting",
  "agency",
  "marketing",
  "medical",
  "financial",
  "home services",
];

function statusFromScore(score: number): "good" | "needs_improvement" | "poor" {
  if (score >= 80) return "good";
  if (score >= 50) return "needs_improvement";
  return "poor";
}

export interface SiteStatusResult {
  isParkedOrDead: boolean;
  siteStatus: "active" | "parked" | "dead";
  parkedProvider?: string;
  reason?: string;
  html: string;
  headers: Record<string, string>;
  isLive: boolean;
}

/**
 * Inspects a website to determine whether it has an active, working website
 * or resolves to a parked holding page, domain lander, or dead/broken server.
 */
export async function inspectWebsiteStatus(url: string, _domain: string): Promise<SiteStatusResult> {
  let html = "";
  let headers: Record<string, string> = {};
  let finalUrl = url;

  try {
    const res = await fetchPublicText(url);
    finalUrl = res.url;
    if (res.status !== 200) throw new Error("Website could not be inspected: HTTP " + res.status);
    html = res.text;

    // Check for client-side redirects to /lander or parking pages
    if (
      html.includes('location.href="/lander"') ||
      html.includes("location.href='/lander'") ||
      html.includes('location.replace("/lander")') ||
      html.includes("location.replace('/lander')") ||
      (html.length < 500 && html.includes("/lander"))
    ) {
      try {
        const landerUrl = new URL("/lander", finalUrl).href;
        const landerRes = await fetchPublicText(landerUrl);
        if(landerRes.status===200) { html=landerRes.text; finalUrl=landerRes.url; }

      } catch {
        // preserve existing html
      }
    }
  } catch (err) {
    throw new Error('Website inspection unavailable; no audit conclusions can be drawn', { cause: err });
  }

  // Detect parked registrar pages or domain-for-sale landers
  const lowerHtml = html.toLowerCase();
  let isParked = false;
  let provider = "Registrar Holding Page";

  if (
    lowerHtml.includes("godaddy.com/lander") ||
    lowerHtml.includes("courtesy of godaddy") ||
    lowerHtml.includes("window.lander_system") ||
    lowerHtml.includes('ap:"parking"') ||
    lowerHtml.includes("is parked free, courtesy of")
  ) {
    isParked = true;
    provider = "GoDaddy";
  } else if (
    lowerHtml.includes("namecheap.com") &&
    (lowerHtml.includes("parked-content") || lowerHtml.includes("registered at namecheap") || lowerHtml.includes("domain is parked"))
  ) {
    isParked = true;
    provider = "Namecheap";
  } else if (lowerHtml.includes("sedoparking.com") || lowerHtml.includes("sedo domain parking")) {
    isParked = true;
    provider = "Sedo";
  } else if (lowerHtml.includes("dan.com") || lowerHtml.includes("dan.com/buy-domain")) {
    isParked = true;
    provider = "Dan.com";
  } else if (lowerHtml.includes("hugedomains.com")) {
    isParked = true;
    provider = "HugeDomains";
  } else if (lowerHtml.includes("afternic.com")) {
    isParked = true;
    provider = "Afternic";
  } else if (
    lowerHtml.includes("buy this domain") ||
    lowerHtml.includes("this domain is parked") ||
    lowerHtml.includes("domain is for sale") ||
    lowerHtml.includes("domain name is available for sale") ||
    lowerHtml.includes("inquire about this domain") ||
    lowerHtml.includes("domain has expired") ||
    lowerHtml.includes("cgi-sys/defaultwebpage.cgi") ||
    lowerHtml.includes("default web site page")
  ) {
    isParked = true;
    provider = "Parked Domain";
  }

  if (isParked) {
    return {
      isParkedOrDead: true,
      siteStatus: "parked",
      parkedProvider: provider,
      reason: `Domain is parked on ${provider} (no active website)`,
      html,
      headers,
      isLive: true,
    };
  }

  return {
    isParkedOrDead: false,
    siteStatus: "active",
    html,
    headers,
    isLive: true,
  };
}

/**
 * Evaluates whether a prospect is an ideal fit for an MZI Studio website audit.
 */
export function evaluateProspectQualification(params: {
  category?: string;
  rating?: number;
  reviewCount?: number;
  hasWebsite: boolean;
  domain?: string;
}): { qualificationScore: number; isIcp: boolean; reason: string } {
  if (!params.hasWebsite) {
    return {
      qualificationScore: 10,
      isIcp: false,
      reason: "No website exists to audit.",
    };
  }

  let score = 50;
  const reasons: string[] = [];

  const catLower = (params.category ?? "").toLowerCase();
  const isMatch = ICP_CATEGORIES.some((c) => catLower.includes(c));
  if (isMatch) {
    score += 25;
    reasons.push("High-value commercial sector with active digital acquisition");
  } else {
    reasons.push("General commercial category");
  }

  if (params.reviewCount && params.reviewCount > 15) {
    score += 15;
    reasons.push("Established business with demonstrated customer volume");
  }

  if (params.rating && params.rating >= 4.0) {
    score += 10;
    reasons.push("Strong reputation indicates investment in service quality");
  }

  return {
    qualificationScore: Math.min(100, score),
    isIcp: score >= 60,
    reason: reasons.join("; "),
  };
}

/**
 * Runs the 8-point website audit and generates the 3-5 high-impact findings
 * and customized MZI Studio outreach email.
 */
export async function runWebsiteAudit(params: {
 leadId: string; companyName: string; websiteUrl: string; category?: string; rating?: number; reviewCount?: number; contactName?: string;
}): Promise<AuditReport> {
 const url = /^https?:\/\//i.test(params.websiteUrl) ? params.websiteUrl : 'https://' + params.websiteUrl;
 const site = await inspectWebsiteStatus(url, new URL(url).hostname);
 const html=site.html;
 const checks = [
  {name:'Page title',pass:/<title[^>]*>[^<]+<\/title>/i.test(html)},
  {name:'Primary heading',pass:/<h1[\s>]/i.test(html)},
  {name:'Meta description',pass:/<meta[^>]*name=["']description["']/i.test(html)},
 ];
 const viewport=/<meta[^>]*name=["']viewport["']/i.test(html);
 const pillar=(score:number,summary:string,details:string[]):AuditPillarScore=>({score,status:statusFromScore(score),summary,details});
 const unmeasured=():AuditPillarScore=>({score:0,status:'not_measured',summary:'Not measured by this HTML inspection',details:['Requires a separate browser or performance measurement.']});
 const findings:AuditFinding[]=checks.filter(c=>!c.pass).map(c=>({area:'SEO',title:c.name+' not found in fetched HTML',technicalCause:'The fetched page did not contain this HTML element.',businessImpact:'Review this element for page structure and search presentation.',solution:'Check the rendered page and add the element if it is missing.',severity:'low'}));
 if(site.siteStatus==='parked') findings.push({area:'Technical',title:'Possible domain parking page',technicalCause:'Fetched HTML matched a parking-page signature: '+site.parkedProvider,businessImpact:'Visitors may be reaching a placeholder page.',solution:'Review the linked website and its hosting configuration.',severity:'medium'});
 const seo=Math.round(checks.filter(c=>c.pass).length/checks.length*100);
 const qual=evaluateProspectQualification({...params,hasWebsite:true});
 const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 const bodyText='Hi '+(params.contactName?.split(' ')[0]||'there')+',\n\nI checked the homepage HTML for '+params.companyName+'. '+(findings.length?findings.map(f=>f.title).join('; '):'The title, primary heading and description were present.')+'\n\nThis is a limited HTML check; performance, layout and conversion have not been measured. Would a more detailed review be useful?';
 return {
  overallScore:seo,qualificationScore:qual.qualificationScore,isIcp:qual.isIcp,icpReason:qual.reason,
  siteStatus:site.siteStatus,isParkedOrDead:site.isParkedOrDead,parkedProvider:site.parkedProvider,
  techStack:html.includes('wp-content/')?['WordPress signature']:[],
  pillars:{performance:unmeasured(),ux:unmeasured(),conversion:unmeasured(),technical:unmeasured(),security:unmeasured(),
   mobile:pillar(viewport?100:0,'Viewport metadata check only',[viewport?'Viewport meta tag found':'Viewport meta tag not found']),
   seo:pillar(seo,'HTML metadata coverage; not a search ranking assessment',checks.map(c=>c.name+': '+(c.pass?'found':'not found')))},
  findings,positiveObservation:checks.filter(c=>c.pass).map(c=>c.name+' found').join('; ')||'No positive metadata observations',
  priorityRecommendation:findings[0]?.solution||'Review the rendered website before drawing further conclusions.',
  priorityBenefit:'Verify website quality with measured evidence',
  generatedEmail:{subject:'Homepage observations for '+params.companyName,bodyText,bodyHtml:'<p>'+escape(bodyText).replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>')+'</p>'},
  auditedAt:new Date().toISOString()
 };
}
