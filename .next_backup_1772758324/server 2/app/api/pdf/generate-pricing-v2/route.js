(()=>{var a={};a.id=34772,a.ids=[34772],a.modules={24360:(a,b,c)=>{"use strict";c.a(a,async(a,d)=>{try{c.r(b),c.d(b,{POST:()=>j,dynamic:()=>k,maxDuration:()=>l});var e=c(232190),f=c(626915),g=c(34442),h=c(510974),i=a([f,g]);[f,g]=i.then?(await i)():i;let k="force-dynamic",l=60;async function j(a){let b;try{let c=await a.json(),{clientName:d,quoteNumber:i,pricing:j}=c;if(!j)return e.NextResponse.json({error:"Faltan datos de pricing"},{status:400});let k=function(a){let{clientName:b,quoteNumber:c,quoteDate:d,pricing:e,contactEmail:f,contactPhone:g,companyName:i,website:j}=a,k=function(a="GARD",b="SECURITY"){return`data:image/svg+xml;base64,${Buffer.from(`<svg width="180" height="60" viewBox="0 0 180 60" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(0, 5)">
    <path d="M15 8 L25 3 L35 8 L35 20 C35 28 25 35 25 35 C25 35 15 28 15 20 Z" fill="white" opacity="0.95"/>
    <path d="M20 13 L24 17 L30 11" stroke="#5dc1b9" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <text x="50" y="33" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="900" fill="white" letter-spacing="1.2">${a}</text>
  <text x="50" y="47" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="400" fill="white" letter-spacing="4.5" opacity="0.9">${b}</text>
</svg>`).toString("base64")}`}(),l=a=>(0,h.vv)(a,e.currency,{ufSuffix:!0}),m=e.items.map(a=>`
    <tr class="border-b border-gray-100">
      <td class="py-3 px-4 text-sm text-gray-700 leading-relaxed">${a.description}</td>
      <td class="py-3 px-4 text-center text-sm text-gray-600">${a.quantity}</td>
      <td class="py-3 px-4 text-right text-sm text-gray-600">${l(a.unit_price)}</td>
      <td class="py-3 px-4 text-right text-sm font-bold text-gray-900">${l(a.subtotal)}</td>
    </tr>
  `).join(""),n=`
    ${e.payment_terms?`<div style="font-size: 10px; color: #334155; margin-bottom: 6px; line-height: 1.4;">• <strong>Forma de pago:</strong> ${e.payment_terms}</div>`:""}
    ${e.adjustment_terms?`<div style="font-size: 10px; color: #334155; margin-bottom: 6px; line-height: 1.4;">• <strong>Reajuste:</strong> ${e.adjustment_terms}</div>`:""}
    ${e.notes?e.notes.map(a=>`<div style="font-size: 10px; color: #334155; margin-bottom: 6px; line-height: 1.4;">• ${a}</div>`).join(""):""}
  `;return`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Propuesta Econ\xf3mica - ${b}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    @page {
      margin: 0;
      size: A4;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background: white;
      color: #1e293b;
      line-height: 1.4;
    }
    
    .page {
      width: 210mm;
      padding: 0;
      margin: 0 auto;
      background: white;
      position: relative;
    }
    
    .header {
      background: linear-gradient(135deg, #5dc1b9 0%, #4a9d96 100%);
      padding: 20px 40px 18px 40px;
      margin-bottom: 0;
    }
    
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    
    .logo-container {
      display: flex;
      align-items: center;
    }
    
    .logo {
      width: 100px;
      height: auto;
    }
    
    .title {
      font-size: 22px;
      font-weight: 700;
      color: white;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
    }
    
    .client-info {
      color: rgba(255, 255, 255, 0.95);
      font-size: 10px;
      margin-bottom: 2px;
      font-weight: 400;
      line-height: 1.5;
    }
    
    .client-info strong {
      font-weight: 600;
      margin-right: 3px;
    }
    
    .content {
      padding: 30px 40px;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      page-break-inside: auto;
    }
    
    thead {
      display: table-header-group;
    }
    
    thead tr {
      background: #f8fafc;
      border-bottom: 2px solid #5dc1b9;
    }
    
    th {
      padding: 10px 12px;
      text-align: left;
      font-size: 9px;
      font-weight: 700;
      color: #1e293b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    th:nth-child(2) {
      text-align: center;
    }
    
    th:nth-child(3),
    th:nth-child(4) {
      text-align: right;
    }
    
    tbody tr {
      page-break-inside: avoid;
      border-bottom: 1px solid #f1f5f9;
    }
    
    td {
      padding: 10px 12px;
      font-size: 11px;
      color: #334155;
      line-height: 1.4;
    }
    
    .total-box {
      background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
      border: 2px solid #5dc1b9;
      border-radius: 8px;
      padding: 16px 20px;
      margin: 20px 0 8px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      page-break-inside: avoid;
    }
    
    .total-label {
      font-size: 16px;
      font-weight: 700;
      color: #1e293b;
      letter-spacing: 0.3px;
    }
    
    .total-amount {
      font-size: 28px;
      font-weight: 700;
      color: #0d9488;
      letter-spacing: -0.5px;
    }
    
    .note {
      font-size: 8px;
      color: #64748b;
      font-style: italic;
      margin-bottom: 18px;
      padding-left: 2px;
    }
    
    .conditions {
      background: #f9fafb;
      border-left: 3px solid #5dc1b9;
      border-radius: 6px;
      padding: 18px 22px;
      margin-bottom: 30px;
      page-break-inside: avoid;
    }
    
    .conditions-title {
      font-size: 12px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 10px;
    }
    
    .footer {
      padding: 18px 40px 25px 40px;
      margin-top: 30px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #64748b;
      page-break-inside: avoid;
    }
    
    .footer-left,
    .footer-right {
      line-height: 1.6;
    }
    
    .footer-right {
      text-align: right;
    }
    
    @media print {
      .page {
        margin: 0;
        padding: 0;
      }
      
      .header {
        page-break-after: avoid;
      }
      
      .content {
        page-break-before: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div class="header-top">
        <div class="logo-container">
          <img src="${k}" alt="${i||"Gard Security"}" class="logo" />
        </div>
        <div class="page-number"></div>
      </div>
      
      <h1 class="title">PROPUESTA ECON\xd3MICA</h1>
      
      <div class="client-info"><strong>Para:</strong> ${b}</div>
      <div class="client-info"><strong>Cotizaci\xf3n:</strong> ${c}</div>
      <div class="client-info"><strong>Fecha:</strong> ${d}</div>
    </div>
    
    <!-- Content -->
    <div class="content">
      <table>
        <thead>
          <tr>
            <th style="width: 50%;">DESCRIPCI\xd3N</th>
            <th style="width: 12%;">CANT.</th>
            <th style="width: 19%;">P. UNIT.</th>
            <th style="width: 19%;">SUBTOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${m}
        </tbody>
      </table>
      
      <!-- Total -->
      <div class="total-box">
        <div class="total-label">TOTAL NETO MENSUAL</div>
        <div class="total-amount">${l(e.subtotal)}</div>
      </div>
      
      <div class="note">Valores netos. IVA se factura seg\xfan ley.</div>
      
      <!-- Condiciones -->
      ${e.payment_terms||e.adjustment_terms||e.notes?`
        <div class="conditions">
          <div class="conditions-title">Condiciones Comerciales</div>
          ${n}
        </div>
      `:""}
    </div>
    
    <!-- Footer -->
    <div class="footer">
      <div class="footer-left">
        <div>${f||""}</div>
        <div>${g||""}</div>
      </div>
      <div class="footer-right">
        <div>${i||""}</div>
        <div>${j||""}</div>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim()}(c),l=await g.default.executablePath();b=await f.chromium.launch({executablePath:l,headless:!0,args:g.default.args});let m=await b.newContext(),n=await m.newPage();await n.setContent(k,{waitUntil:"networkidle"});let o=await n.pdf({format:"A4",printBackground:!0,margin:{top:"0mm",right:"0mm",bottom:"0mm",left:"0mm"},preferCSSPageSize:!0});await b.close();let p=`Propuesta_${d?.replace(/\s+/g,"_")||"Cliente"}_${i||"COT"}.pdf`,q=new Uint8Array(o);return new e.NextResponse(q,{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${p}"`}})}catch(a){return console.error("Error generando PDF:",a),b&&await b.close(),e.NextResponse.json({error:"Error generando PDF",details:a.message},{status:500})}}d()}catch(a){d(a)}})},34442:a=>{"use strict";a.exports=import("@sparticuz/chromium")},78335:()=>{},166946:(a,b,c)=>{"use strict";Object.defineProperty(b,"I",{enumerable:!0,get:function(){return g}});let d=c(930898),e=c(342471),f=c(447912);async function g(a,b,c,g){if((0,d.isNodeNextResponse)(b)){var h;b.statusCode=c.status,b.statusMessage=c.statusText;let d=["set-cookie","www-authenticate","proxy-authenticate","vary"];null==(h=c.headers)||h.forEach((a,c)=>{if("x-middleware-set-cookie"!==c.toLowerCase())if("set-cookie"===c.toLowerCase())for(let d of(0,f.splitCookiesString)(a))b.appendHeader(c,d);else{let e=void 0!==b.getHeader(c);(d.includes(c.toLowerCase())||!e)&&b.appendHeader(c,a)}});let{originalResponse:i}=b;c.body&&"HEAD"!==a.method?await (0,e.pipeToNodeResponse)(c.body,i,g):i.end()}}},200261:a=>{"use strict";a.exports=require("next/dist/shared/lib/router/utils/app-paths")},296487:()=>{},505624:(a,b,c)=>{"use strict";c.a(a,async(a,d)=>{try{c.r(b),c.d(b,{handler:()=>x,patchFetch:()=>w,routeModule:()=>y,serverHooks:()=>B,workAsyncStorage:()=>z,workUnitAsyncStorage:()=>A});var e=c(996559),f=c(348088),g=c(237719),h=c(826191),i=c(781289),j=c(200261),k=c(592603),l=c(239893),m=c(414823),n=c(347220),o=c(166946),p=c(447912),q=c(99786),r=c(146143),s=c(986439),t=c(543365),u=c(24360),v=a([u]);u=(v.then?(await v)():v)[0];let y=new e.AppRouteRouteModule({definition:{kind:f.RouteKind.APP_ROUTE,page:"/api/pdf/generate-pricing-v2/route",pathname:"/api/pdf/generate-pricing-v2",filename:"route",bundlePath:"app/api/pdf/generate-pricing-v2/route"},distDir:".next",projectDir:"",resolvedPagePath:"/Users/caco/Desktop/Cursor/opai/src/app/api/pdf/generate-pricing-v2/route.ts",nextConfigOutput:"",userland:u}),{workAsyncStorage:z,workUnitAsyncStorage:A,serverHooks:B}=y;function w(){return(0,g.patchFetch)({workAsyncStorage:z,workUnitAsyncStorage:A})}async function x(a,b,c){var d;let e="/api/pdf/generate-pricing-v2/route";"/index"===e&&(e="/");let g=await y.prepare(a,b,{srcPage:e,multiZoneDraftMode:"false"});if(!g)return b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve()),null;let{buildId:u,params:v,nextConfig:w,isDraftMode:x,prerenderManifest:z,routerServerContext:A,isOnDemandRevalidate:B,revalidateOnlyGenerated:C,resolvedPathname:D}=g,E=(0,j.normalizeAppPath)(e),F=!!(z.dynamicRoutes[E]||z.routes[D]);if(F&&!x){let a=!!z.routes[D],b=z.dynamicRoutes[E];if(b&&!1===b.fallback&&!a)throw new s.NoFallbackError}let G=null;!F||y.isDev||x||(G=D,G="/index"===G?"/":G);let H=!0===y.isDev||!F,I=F&&!H,J=a.method||"GET",K=(0,i.getTracer)(),L=K.getActiveScopeSpan(),M={params:v,prerenderManifest:z,renderOpts:{experimental:{dynamicIO:!!w.experimental.dynamicIO,authInterrupts:!!w.experimental.authInterrupts},supportsDynamicResponse:H,incrementalCache:(0,h.getRequestMeta)(a,"incrementalCache"),cacheLifeProfiles:null==(d=w.experimental)?void 0:d.cacheLife,isRevalidate:I,waitUntil:c.waitUntil,onClose:a=>{b.on("close",a)},onAfterTaskError:void 0,onInstrumentationRequestError:(b,c,d)=>y.onRequestError(a,b,d,A)},sharedContext:{buildId:u}},N=new k.NodeNextRequest(a),O=new k.NodeNextResponse(b),P=l.NextRequestAdapter.fromNodeNextRequest(N,(0,l.signalFromNodeResponse)(b));try{let d=async c=>y.handle(P,M).finally(()=>{if(!c)return;c.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let d=K.getRootSpanAttributes();if(!d)return;if(d.get("next.span_type")!==m.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${d.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let e=d.get("next.route");if(e){let a=`${J} ${e}`;c.setAttributes({"next.route":e,"http.route":e,"next.span_name":a}),c.updateName(a)}else c.updateName(`${J} ${a.url}`)}),g=async g=>{var i,j;let k=async({previousCacheEntry:f})=>{try{if(!(0,h.getRequestMeta)(a,"minimalMode")&&B&&C&&!f)return b.statusCode=404,b.setHeader("x-nextjs-cache","REVALIDATED"),b.end("This page could not be found"),null;let e=await d(g);a.fetchMetrics=M.renderOpts.fetchMetrics;let i=M.renderOpts.pendingWaitUntil;i&&c.waitUntil&&(c.waitUntil(i),i=void 0);let j=M.renderOpts.collectedTags;if(!F)return await (0,o.I)(N,O,e,M.renderOpts.pendingWaitUntil),null;{let a=await e.blob(),b=(0,p.toNodeOutgoingHttpHeaders)(e.headers);j&&(b[r.NEXT_CACHE_TAGS_HEADER]=j),!b["content-type"]&&a.type&&(b["content-type"]=a.type);let c=void 0!==M.renderOpts.collectedRevalidate&&!(M.renderOpts.collectedRevalidate>=r.INFINITE_CACHE)&&M.renderOpts.collectedRevalidate,d=void 0===M.renderOpts.collectedExpire||M.renderOpts.collectedExpire>=r.INFINITE_CACHE?void 0:M.renderOpts.collectedExpire;return{value:{kind:t.CachedRouteKind.APP_ROUTE,status:e.status,body:Buffer.from(await a.arrayBuffer()),headers:b},cacheControl:{revalidate:c,expire:d}}}}catch(b){throw(null==f?void 0:f.isStale)&&await y.onRequestError(a,b,{routerKind:"App Router",routePath:e,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:I,isOnDemandRevalidate:B})},A),b}},l=await y.handleResponse({req:a,nextConfig:w,cacheKey:G,routeKind:f.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:z,isRoutePPREnabled:!1,isOnDemandRevalidate:B,revalidateOnlyGenerated:C,responseGenerator:k,waitUntil:c.waitUntil});if(!F)return null;if((null==l||null==(i=l.value)?void 0:i.kind)!==t.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==l||null==(j=l.value)?void 0:j.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});(0,h.getRequestMeta)(a,"minimalMode")||b.setHeader("x-nextjs-cache",B?"REVALIDATED":l.isMiss?"MISS":l.isStale?"STALE":"HIT"),x&&b.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let m=(0,p.fromNodeOutgoingHttpHeaders)(l.value.headers);return(0,h.getRequestMeta)(a,"minimalMode")&&F||m.delete(r.NEXT_CACHE_TAGS_HEADER),!l.cacheControl||b.getHeader("Cache-Control")||m.get("Cache-Control")||m.set("Cache-Control",(0,q.getCacheControlHeader)(l.cacheControl)),await (0,o.I)(N,O,new Response(l.value.body,{headers:m,status:l.value.status||200})),null};L?await g(L):await K.withPropagatedContext(a.headers,()=>K.trace(m.BaseServerSpan.handleRequest,{spanName:`${J} ${a.url}`,kind:i.SpanKind.SERVER,attributes:{"http.method":J,"http.target":a.url}},g))}catch(b){if(L||b instanceof s.NoFallbackError||await y.onRequestError(a,b,{routerKind:"App Router",routePath:E,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:I,isOnDemandRevalidate:B})}),F)throw b;return await (0,o.I)(N,O,new Response(null,{status:500})),null}}d()}catch(a){d(a)}})},510974:(a,b,c)=>{"use strict";c.d(b,{Yr:()=>i,cn:()=>f,h2:()=>h,vv:()=>j});var d=c(75986),e=c(808974);function f(...a){return(0,e.QP)((0,d.$)(a))}function g(a){return new Intl.NumberFormat("es-CL",{style:"currency",currency:"CLP",minimumFractionDigits:0,maximumFractionDigits:0}).format(a)}function h(a){let b=new Intl.NumberFormat("es-CL",{minimumFractionDigits:2,maximumFractionDigits:2}).format(a);return`UF ${b}`}function i(a){let b=new Intl.NumberFormat("es-CL",{minimumFractionDigits:2,maximumFractionDigits:2}).format(a);return`${b} UF`}function j(a,b="CLP",c){let d=b.toUpperCase();return"CLF"===d||"UF"===d?c?.ufSuffix?i(a):h(a):"CLP"===d?g(a):"USD"===d?new Intl.NumberFormat("es-CL",{style:"currency",currency:"USD",minimumFractionDigits:0,maximumFractionDigits:0}).format(a):g(a)}},529294:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-async-storage.external.js")},626915:a=>{"use strict";a.exports=import("playwright-core")},663033:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},710846:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},744870:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},903295:a=>{"use strict";a.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},986439:a=>{"use strict";a.exports=require("next/dist/shared/lib/no-fallback-error.external")},996559:(a,b,c)=>{"use strict";a.exports=c(744870)}};var b=require("../../../../webpack-runtime.js");b.C(a);var c=b.X(0,[24985,32190,64017],()=>b(b.s=505624));module.exports=c})();