(()=>{var a={};a.id=14850,a.ids=[14850,31183,97756],a.modules={78335:()=>{},83505:a=>{"use strict";a.exports=import("prettier/standalone")},157075:a=>{"use strict";a.exports=require("node:stream")},166946:(a,b,c)=>{"use strict";Object.defineProperty(b,"I",{enumerable:!0,get:function(){return g}});let d=c(930898),e=c(342471),f=c(447912);async function g(a,b,c,g){if((0,d.isNodeNextResponse)(b)){var h;b.statusCode=c.status,b.statusMessage=c.statusText;let d=["set-cookie","www-authenticate","proxy-authenticate","vary"];null==(h=c.headers)||h.forEach((a,c)=>{if("x-middleware-set-cookie"!==c.toLowerCase())if("set-cookie"===c.toLowerCase())for(let d of(0,f.splitCookiesString)(a))b.appendHeader(c,d);else{let e=void 0!==b.getHeader(c);(d.includes(c.toLowerCase())||!e)&&b.appendHeader(c,a)}});let{originalResponse:i}=b;c.body&&"HEAD"!==a.method?await (0,e.pipeToNodeResponse)(c.body,i,g):i.end()}}},197756:(a,b,c)=>{"use strict";c.r(b),c.d(b,{EMAIL_CONFIG:()=>f,clearTenantEmailConfigCache:()=>h,getTenantEmailConfig:()=>i,resend:()=>e});var d=c(620549);if(!process.env.RESEND_API_KEY)throw Error("RESEND_API_KEY no est\xe1 configurada en variables de entorno");let e=new d.u(process.env.RESEND_API_KEY),f={from:process.env.EMAIL_FROM||"OPAI <opai@gard.cl>",replyTo:process.env.EMAIL_REPLY_TO||"comercial@gard.cl",companyName:"Gard Security"},g=new Map;function h(a){g.delete(a)}async function i(a){let b=g.get(a);if(b&&Date.now()-b.ts<3e5)return b.config;try{let{getTenantCompanyConfig:b}=await c.e(1870).then(c.bind(c,301870)),d=await b(a),e={from:d.emailFrom,replyTo:d.emailReplyTo};return g.set(a,{config:e,ts:Date.now()}),e}catch{return{from:f.from,replyTo:f.replyTo}}}},200261:a=>{"use strict";a.exports=require("next/dist/shared/lib/router/utils/app-paths")},296487:()=>{},328354:a=>{"use strict";a.exports=require("util")},333873:a=>{"use strict";a.exports=require("path")},441204:a=>{"use strict";a.exports=require("string_decoder")},455511:a=>{"use strict";a.exports=require("crypto")},504573:a=>{"use strict";a.exports=require("node:buffer")},529294:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-async-storage.external.js")},584297:a=>{"use strict";a.exports=require("async_hooks")},663033:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},702502:a=>{"use strict";a.exports=import("prettier/plugins/html")},710846:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},743191:(a,b,c)=>{"use strict";c.d(b,{_:()=>e,l:()=>f});var d=c(197756);async function e(a){if(!a.guardiaEmail)return;let b="entrada"===a.tipo?"Entrada":"Salida",c=a.timestamp.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit",second:"2-digit",timeZone:"America/Santiago"}),e=a.timestamp.toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"America/Santiago"}),f=a.geoValidada?`Ubicaci\xf3n validada (${a.geoDistanciaM}m)`:null!=a.geoDistanciaM?`Fuera de rango (${a.geoDistanciaM}m)`:"Sin geolocalizaci\xf3n",g=`Comprobante de ${b} — ${a.installationName} — ${c}`,h=`
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 48px; height: 48px; background: #2563eb; border-radius: 50%; line-height: 48px; text-align: center;">
          <span style="color: white; font-size: 20px;">${"entrada"===a.tipo?"→":"←"}</span>
        </div>
        <h2 style="margin: 12px 0 4px; color: #0f172a; font-size: 18px;">${b} Registrada</h2>
        <p style="color: #64748b; font-size: 13px; margin: 0;">Comprobante de marcaci\xf3n de asistencia</p>
      </div>

      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 120px;">Guardia</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${a.guardiaName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">RUT</td>
            <td style="padding: 6px 0; color: #0f172a;">${a.guardiaRut}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Instalaci\xf3n</td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${a.installationName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Tipo</td>
            <td style="padding: 6px 0; color: ${"entrada"===a.tipo?"#059669":"#ea580c"}; font-weight: 600;">${b}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Hora</td>
            <td style="padding: 6px 0; color: #0f172a; font-size: 16px; font-weight: 700;">${c}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Fecha</td>
            <td style="padding: 6px 0; color: #0f172a; text-transform: capitalize;">${e}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Ubicaci\xf3n</td>
            <td style="padding: 6px 0; color: ${a.geoValidada?"#059669":"#dc2626"};">${f}</td>
          </tr>
        </table>
      </div>

      <div style="background: #f1f5f9; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
        <p style="color: #64748b; font-size: 10px; margin: 0 0 4px;">Hash de integridad (SHA-256)</p>
        <p style="color: #475569; font-size: 10px; font-family: monospace; word-break: break-all; margin: 0;">${a.hashIntegridad}</p>
      </div>

      <div style="text-align: center; padding-top: 16px; border-top: 1px solid #e2e8f0;">
        <p style="color: #94a3b8; font-size: 10px; margin: 0;">
          ${d.EMAIL_CONFIG.companyName} — Registro conforme a Res. Exenta N\xb038, DT Chile
        </p>
        <p style="color: #94a3b8; font-size: 10px; margin: 4px 0 0;">
          Sello de tiempo: ${a.timestamp.toISOString()}
        </p>
      </div>
    </div>
  `;await d.resend.emails.send({from:d.EMAIL_CONFIG.from,to:a.guardiaEmail,subject:g,html:h})}async function f(a){if(!a.guardiaEmail)return;let b="entrada"===a.tipo?"Entrada Laboral":"Salida Laboral",c=`Aviso Marca Manual — ${a.installationName} — ${a.fechaMarca}`,e=`
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 48px; height: 48px; background: #f59e0b; border-radius: 50%; line-height: 48px; text-align: center;">
          <span style="color: white; font-size: 20px;">✋</span>
        </div>
        <h2 style="margin: 12px 0 4px; color: #0f172a; font-size: 18px;">Aviso Marca Manual</h2>
        <p style="color: #64748b; font-size: 13px; margin: 0;">Registro de asistencia ajustado manualmente</p>
      </div>

      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
        <p style="color: #92400e; font-size: 12px; margin: 0; line-height: 1.5;">
          Estimado/a <strong>${a.guardiaName}</strong>, RUT ${a.guardiaRut}:
        </p>
        <p style="color: #92400e; font-size: 12px; margin: 8px 0 0; line-height: 1.5;">
          Con fecha <strong>${new Date().toLocaleDateString("es-CL")}</strong>, se realiza un ajuste de tipo
          <strong>${a.tipoAjuste}</strong> de la no marcaci\xf3n original de tipo <strong>${b}</strong>.
        </p>
        <p style="color: #92400e; font-size: 12px; margin: 8px 0 0; line-height: 1.5;">
          Quedando como nuevo registro la marca de tipo <strong>${b}</strong>
          con fecha <strong>${a.fechaMarca}</strong> y hora <strong>${a.horaMarca}</strong>${a.motivo?` por motivo: ${a.motivo}`:""}.
        </p>
      </div>

      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; width: 140px; vertical-align: top;">Nombre</td>
            <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${a.guardiaName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; vertical-align: top;">RUN</td>
            <td style="padding: 8px 0; color: #0f172a;">${a.guardiaRut}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; vertical-align: top;">Marca</td>
            <td style="padding: 8px 0; color: ${"entrada"===a.tipo?"#059669":"#ea580c"}; font-weight: 600;">${b}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; vertical-align: top;">Fecha</td>
            <td style="padding: 8px 0; color: #0f172a; font-weight: 600;">${a.fechaMarca}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; vertical-align: top;">Hora</td>
            <td style="padding: 8px 0; color: #0f172a; font-size: 15px; font-weight: 700;">${a.horaMarca}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; vertical-align: top;">Tipo Ajuste</td>
            <td style="padding: 8px 0; color: #0f172a;">${a.tipoAjuste}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; vertical-align: top;">Registrado por</td>
            <td style="padding: 8px 0; color: #0f172a;">${a.registradoPor}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; vertical-align: top;">Empresa</td>
            <td style="padding: 8px 0; color: #0f172a;">${a.empresaName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; vertical-align: top;">RUT Empresa</td>
            <td style="padding: 8px 0; color: #0f172a;">${a.empresaRut}</td>
          </tr>
        </table>
      </div>

      <div style="background: #f1f5f9; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
        <p style="color: #64748b; font-size: 10px; margin: 0 0 4px;">Hash de integridad (SHA-256)</p>
        <p style="color: #475569; font-size: 10px; font-family: monospace; word-break: break-all; margin: 0;">${a.hashIntegridad}</p>
      </div>

      <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
        <p style="color: #78350f; font-size: 11px; margin: 0; line-height: 1.5;">
          <strong>Nota:</strong> "${a.clausulaLegal}"
        </p>
      </div>

      <div style="text-align: center; padding-top: 16px; border-top: 1px solid #e2e8f0;">
        <p style="color: #94a3b8; font-size: 10px; margin: 0;">
          ${d.EMAIL_CONFIG.companyName} — Registro conforme a Res. Exenta N\xb038, DT Chile
        </p>
        <p style="color: #94a3b8; font-size: 10px; margin: 4px 0 0;">
          Sello de tiempo: ${new Date().toISOString()}
        </p>
      </div>
    </div>
  `;await d.resend.emails.send({from:d.EMAIL_CONFIG.from,to:a.guardiaEmail,subject:c,html:e})}},744870:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},896330:a=>{"use strict";a.exports=require("@prisma/client")},903295:a=>{"use strict";a.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},927910:a=>{"use strict";a.exports=require("stream")},931183:(a,b,c)=>{"use strict";c.d(b,{prisma:()=>h});var d=c(896330);let e=globalThis.prisma??new d.PrismaClient({log:["error"]}),f=null;async function g(){f||(f=e.$executeRawUnsafe("ALTER TABLE crm.deals ADD COLUMN IF NOT EXISTS active_quotation_id uuid").then(()=>void 0).catch(a=>{console.error("Could not ensure crm.deals.active_quotation_id column:",a)})),await f}let h=e.$extends({query:{crmDeal:{$allOperations:async({args:a,query:b})=>(await g(),b(a))}}})},977598:a=>{"use strict";a.exports=require("node:crypto")},979428:a=>{"use strict";a.exports=require("buffer")},986060:(a,b,c)=>{"use strict";c.r(b),c.d(b,{handler:()=>E,patchFetch:()=>D,routeModule:()=>z,serverHooks:()=>C,workAsyncStorage:()=>A,workUnitAsyncStorage:()=>B});var d={};c.r(d),c.d(d,{GET:()=>y,dynamic:()=>x});var e=c(996559),f=c(348088),g=c(237719),h=c(826191),i=c(781289),j=c(200261),k=c(592603),l=c(239893),m=c(414823),n=c(347220),o=c(166946),p=c(447912),q=c(99786),r=c(146143),s=c(986439),t=c(543365),u=c(232190),v=c(931183),w=c(743191);let x="force-dynamic";async function y(){try{let a=new Date,b=await v.prisma.setting.findMany({where:{category:"pending_email",key:{startsWith:"pending_marcacion_email:"}}});if(0===b.length)return u.NextResponse.json({success:!0,data:{processed:0,message:"No hay emails pendientes"}});let c=0,d=0,e=0;for(let f of b)try{let b=JSON.parse(f.value??"{}");if(new Date(b.sendAfter)>a){d++;continue}if(b.asistenciaId&&b.marcacionGuardiaId&&b.installationId){let a=new Date(b.fechaMarca);a.setHours(0,0,0,0);let c=new Date(a);if(c.setDate(c.getDate()+1),!await v.prisma.opsMarcacion.findFirst({where:{guardiaId:b.marcacionGuardiaId,installationId:b.installationId,metodoId:"manual",timestamp:{gte:a,lt:c}}})){await v.prisma.setting.delete({where:{id:f.id}}),console.log(`[CRON] Email pendiente ${f.id} cancelado (marcaci\xf3n eliminada)`),d++;continue}}await (0,w.l)({guardiaName:b.guardiaName,guardiaEmail:b.guardiaEmail,guardiaRut:b.guardiaRut,installationName:b.installationName,empresaName:b.empresaName,empresaRut:b.empresaRut,tipo:b.tipo,fechaMarca:b.fechaMarca,horaMarca:b.horaMarca,tipoAjuste:b.tipoAjuste,hashIntegridad:b.hashIntegridad,registradoPor:b.registradoPor,clausulaLegal:b.clausulaLegal}),await v.prisma.setting.delete({where:{id:f.id}}),c++,console.log(`[CRON] Email de marca manual enviado a ${b.guardiaEmail}`)}catch(a){e++,console.error(`[CRON] Error procesando email pendiente ${f.id}:`,a)}return u.NextResponse.json({success:!0,data:{total:b.length,sent:c,skipped:d,errors:e}})}catch(a){return console.error("[CRON] Error en marcacion-emails:",a),u.NextResponse.json({success:!1,error:"Error procesando emails pendientes"},{status:500})}}let z=new e.AppRouteRouteModule({definition:{kind:f.RouteKind.APP_ROUTE,page:"/api/cron/marcacion-emails/route",pathname:"/api/cron/marcacion-emails",filename:"route",bundlePath:"app/api/cron/marcacion-emails/route"},distDir:".next",projectDir:"",resolvedPagePath:"/Users/caco/Desktop/Cursor/opai/src/app/api/cron/marcacion-emails/route.ts",nextConfigOutput:"",userland:d}),{workAsyncStorage:A,workUnitAsyncStorage:B,serverHooks:C}=z;function D(){return(0,g.patchFetch)({workAsyncStorage:A,workUnitAsyncStorage:B})}async function E(a,b,c){var d;let e="/api/cron/marcacion-emails/route";"/index"===e&&(e="/");let g=await z.prepare(a,b,{srcPage:e,multiZoneDraftMode:"false"});if(!g)return b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve()),null;let{buildId:u,params:v,nextConfig:w,isDraftMode:x,prerenderManifest:y,routerServerContext:A,isOnDemandRevalidate:B,revalidateOnlyGenerated:C,resolvedPathname:D}=g,E=(0,j.normalizeAppPath)(e),F=!!(y.dynamicRoutes[E]||y.routes[D]);if(F&&!x){let a=!!y.routes[D],b=y.dynamicRoutes[E];if(b&&!1===b.fallback&&!a)throw new s.NoFallbackError}let G=null;!F||z.isDev||x||(G="/index"===(G=D)?"/":G);let H=!0===z.isDev||!F,I=F&&!H,J=a.method||"GET",K=(0,i.getTracer)(),L=K.getActiveScopeSpan(),M={params:v,prerenderManifest:y,renderOpts:{experimental:{dynamicIO:!!w.experimental.dynamicIO,authInterrupts:!!w.experimental.authInterrupts},supportsDynamicResponse:H,incrementalCache:(0,h.getRequestMeta)(a,"incrementalCache"),cacheLifeProfiles:null==(d=w.experimental)?void 0:d.cacheLife,isRevalidate:I,waitUntil:c.waitUntil,onClose:a=>{b.on("close",a)},onAfterTaskError:void 0,onInstrumentationRequestError:(b,c,d)=>z.onRequestError(a,b,d,A)},sharedContext:{buildId:u}},N=new k.NodeNextRequest(a),O=new k.NodeNextResponse(b),P=l.NextRequestAdapter.fromNodeNextRequest(N,(0,l.signalFromNodeResponse)(b));try{let d=async c=>z.handle(P,M).finally(()=>{if(!c)return;c.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let d=K.getRootSpanAttributes();if(!d)return;if(d.get("next.span_type")!==m.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${d.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let e=d.get("next.route");if(e){let a=`${J} ${e}`;c.setAttributes({"next.route":e,"http.route":e,"next.span_name":a}),c.updateName(a)}else c.updateName(`${J} ${a.url}`)}),g=async g=>{var i,j;let k=async({previousCacheEntry:f})=>{try{if(!(0,h.getRequestMeta)(a,"minimalMode")&&B&&C&&!f)return b.statusCode=404,b.setHeader("x-nextjs-cache","REVALIDATED"),b.end("This page could not be found"),null;let e=await d(g);a.fetchMetrics=M.renderOpts.fetchMetrics;let i=M.renderOpts.pendingWaitUntil;i&&c.waitUntil&&(c.waitUntil(i),i=void 0);let j=M.renderOpts.collectedTags;if(!F)return await (0,o.I)(N,O,e,M.renderOpts.pendingWaitUntil),null;{let a=await e.blob(),b=(0,p.toNodeOutgoingHttpHeaders)(e.headers);j&&(b[r.NEXT_CACHE_TAGS_HEADER]=j),!b["content-type"]&&a.type&&(b["content-type"]=a.type);let c=void 0!==M.renderOpts.collectedRevalidate&&!(M.renderOpts.collectedRevalidate>=r.INFINITE_CACHE)&&M.renderOpts.collectedRevalidate,d=void 0===M.renderOpts.collectedExpire||M.renderOpts.collectedExpire>=r.INFINITE_CACHE?void 0:M.renderOpts.collectedExpire;return{value:{kind:t.CachedRouteKind.APP_ROUTE,status:e.status,body:Buffer.from(await a.arrayBuffer()),headers:b},cacheControl:{revalidate:c,expire:d}}}}catch(b){throw(null==f?void 0:f.isStale)&&await z.onRequestError(a,b,{routerKind:"App Router",routePath:e,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:I,isOnDemandRevalidate:B})},A),b}},l=await z.handleResponse({req:a,nextConfig:w,cacheKey:G,routeKind:f.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:y,isRoutePPREnabled:!1,isOnDemandRevalidate:B,revalidateOnlyGenerated:C,responseGenerator:k,waitUntil:c.waitUntil});if(!F)return null;if((null==l||null==(i=l.value)?void 0:i.kind)!==t.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==l||null==(j=l.value)?void 0:j.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});(0,h.getRequestMeta)(a,"minimalMode")||b.setHeader("x-nextjs-cache",B?"REVALIDATED":l.isMiss?"MISS":l.isStale?"STALE":"HIT"),x&&b.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let m=(0,p.fromNodeOutgoingHttpHeaders)(l.value.headers);return(0,h.getRequestMeta)(a,"minimalMode")&&F||m.delete(r.NEXT_CACHE_TAGS_HEADER),!l.cacheControl||b.getHeader("Cache-Control")||m.get("Cache-Control")||m.set("Cache-Control",(0,q.getCacheControlHeader)(l.cacheControl)),await (0,o.I)(N,O,new Response(l.value.body,{headers:m,status:l.value.status||200})),null};L?await g(L):await K.withPropagatedContext(a.headers,()=>K.trace(m.BaseServerSpan.handleRequest,{spanName:`${J} ${a.url}`,kind:i.SpanKind.SERVER,attributes:{"http.method":J,"http.target":a.url}},g))}catch(b){if(L||b instanceof s.NoFallbackError||await z.onRequestError(a,b,{routerKind:"App Router",routePath:E,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:I,isOnDemandRevalidate:B})}),F)throw b;return await (0,o.I)(N,O,new Response(null,{status:500})),null}}},986439:a=>{"use strict";a.exports=require("next/dist/shared/lib/no-fallback-error.external")},996559:(a,b,c)=>{"use strict";a.exports=c(744870)}};var b=require("../../../../webpack-runtime.js");b.C(a);var c=b.X(0,[24985,32190,20549],()=>b(b.s=986060));module.exports=c})();