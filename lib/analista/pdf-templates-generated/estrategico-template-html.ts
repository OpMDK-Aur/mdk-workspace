// GENERADO AUTOMÁTICAMENTE a partir de la plantilla HTML — no editar a mano.
// Embebido como string para no depender de fs.readFileSync + tracing en runtime.

export const ESTRATEGICO_TEMPLATE_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Informe Estratégico MDK</title>
<style>
  @font-face{font-family:'Monument';src:url({{FONT_MONUMENT_BOLD}}) format('opentype');font-weight:800;font-style:normal;}
  @font-face{font-family:'Monument';src:url({{FONT_MONUMENT_REGULAR}}) format('opentype');font-weight:400;font-style:normal;}
  @font-face{font-family:'Neue';src:url({{FONT_NEUE_REGULAR}}) format('opentype');font-weight:400;font-style:normal;}
  @font-face{font-family:'Neue';src:url({{FONT_NEUE_MEDIUM}}) format('opentype');font-weight:500;font-style:normal;}
  @font-face{font-family:'Neue';src:url({{FONT_NEUE_BOLD}}) format('opentype');font-weight:700;font-style:normal;}

  :root{
    --ink:#141414; --orange:#FF7F00; --fucsia:#FF0049; --peach:#FFBC80; --paper:#F0F0F0; --white:#FFFFFF;
    --grad:linear-gradient(112deg,#FF7F00 0%,#FF0049 100%);
    --mono:'Monument'; --neue:'Neue';
    --t-title:52px; --t-lead:30px; --t-body:25px; --t-eyebrow:24px; --t-small:24px;
    --px:88px; --pt:64px; --pb:52px;
  }
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body{width:1920px;}
  @page{ size: 1920px 1080px; margin: 0; }
  .page{
    position:relative;width:1920px;height:1080px;overflow:hidden;box-sizing:border-box;
    padding:var(--pt) var(--px) var(--pb);display:flex;flex-direction:column;
    page-break-after:always;
  }
  .page:last-child{ page-break-after: auto; }
  .footer{margin-top:14px;display:flex;align-items:center;justify-content:space-between;padding-top:16px;border-top:1px solid rgba(20,20,20,.12);}
  .footer.dark{border-top:1px solid rgba(255,255,255,.14);}
  .footer-left{display:flex;align-items:center;gap:12px;}
  .footer-left img{height:22px;width:auto;}
  .footer-left span{font-family:var(--neue);font-size:24px;color:rgba(20,20,20,.5);}
  .footer.dark .footer-left span{color:rgba(255,255,255,.55);}
  .footer-right{font-family:var(--neue);font-size:24px;color:rgba(20,20,20,.4);}
  .footer.dark .footer-right{color:rgba(255,255,255,.45);}
  .eyebrow-row{display:flex;align-items:center;justify-content:space-between;}
  .eyebrow{display:flex;align-items:center;gap:14px;}
  .eyebrow .dot{width:9px;height:9px;background:var(--orange);border-radius:50%;display:inline-block;}
  .eyebrow span.label{font-family:var(--neue);font-weight:500;font-size:var(--t-eyebrow);letter-spacing:.24em;text-transform:uppercase;color:var(--orange);}
  .page-num{font-family:var(--mono);font-weight:800;font-size:36px;color:rgba(20,20,20,.12);}
  .page-num.dark{color:rgba(255,255,255,.1);}
  h2.section-title{font-family:var(--mono);font-weight:800;font-size:var(--t-title);line-height:1;letter-spacing:-.01em;text-transform:uppercase;margin-top:14px;}
</style>
</head>
<body>

<!-- ============ PORTADA ============ -->
<section class="page" style="background:var(--ink);color:var(--white);">
  <div style="position:absolute;top:0;left:0;width:100%;height:8px;background:var(--grad);"></div>
  <div style="position:absolute;top:-28%;left:-10%;width:48%;height:110%;background:var(--grad);filter:blur(130px);opacity:.4;border-radius:50%;"></div>
  <img src="{{LOGO_BASE64}}" alt="MDK" style="position:absolute;bottom:0;right:-3%;width:40%;height:auto;opacity:.08;">
  <div style="position:relative;display:flex;align-items:center;justify-content:space-between;">
    <span style="font-family:var(--neue);font-weight:500;font-size:var(--t-eyebrow);letter-spacing:.2em;text-transform:uppercase;color:var(--peach);background:rgba(255,0,73,.16);border:1px solid rgba(255,0,73,.4);border-radius:999px;padding:9px 20px;">Plan Estratégico</span>
    <img src="{{LOGO_BASE64}}" alt="MDK" style="height:34px;width:auto;">
  </div>
  <div style="position:relative;display:flex;flex:1;gap:70px;align-items:center;">
    <div style="flex:none;max-width:640px;">
      <h1 style="font-family:var(--mono);font-weight:800;font-size:76px;line-height:.98;letter-spacing:-.01em;text-transform:uppercase;">Informe<br>estratégico</h1>
      <p style="font-family:var(--neue);font-weight:400;font-size:var(--t-lead);color:rgba(255,255,255,.78);margin-top:24px;">Cierre de mes · análisis completo de pauta, funnel y negocio.</p>
    </div>
    <div style="flex:1;border-left:1px solid rgba(255,255,255,.16);padding-left:48px;display:grid;grid-template-columns:1fr 1fr;gap:10px 40px;align-content:center;">
      <span style="grid-column:1 / -1;font-family:var(--neue);font-weight:500;font-size:var(--t-small);letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.5);margin-bottom:6px;">Contenido</span>
      <div style="display:flex;align-items:baseline;gap:14px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;color:var(--orange);min-width:32px;">01</span><span style="font-family:var(--neue);font-size:24px;">Resumen ejecutivo</span></div>
      <div style="display:flex;align-items:baseline;gap:14px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;color:var(--orange);min-width:32px;">07</span><span style="font-family:var(--neue);font-size:24px;">Gestión comercial en CRM</span></div>
      <div style="display:flex;align-items:baseline;gap:14px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;color:var(--orange);min-width:32px;">02</span><span style="font-family:var(--neue);font-size:24px;">¿En qué trabajamos?</span></div>
      <div style="display:flex;align-items:baseline;gap:14px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;color:var(--orange);min-width:32px;">08</span><span style="font-family:var(--neue);font-size:24px;">Impacto económico</span></div>
      <div style="display:flex;align-items:baseline;gap:14px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;color:var(--orange);min-width:32px;">03</span><span style="font-family:var(--neue);font-size:24px;">Testing creativo</span></div>
      <div style="display:flex;align-items:baseline;gap:14px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;color:var(--orange);min-width:32px;">09</span><span style="font-family:var(--neue);font-size:24px;">Benchmark y competencia</span></div>
      <div style="display:flex;align-items:baseline;gap:14px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;color:var(--orange);min-width:32px;">04</span><span style="font-family:var(--neue);font-size:24px;">Performance de campañas</span></div>
      <div style="display:flex;align-items:baseline;gap:14px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;color:var(--orange);min-width:32px;">10</span><span style="font-family:var(--neue);font-size:24px;">Riesgos y alertas</span></div>
      <div style="display:flex;align-items:baseline;gap:14px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;color:var(--orange);min-width:32px;">05</span><span style="font-family:var(--neue);font-size:24px;">Acciones realizadas</span></div>
      <div style="display:flex;align-items:baseline;gap:14px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;color:var(--fucsia);min-width:32px;">11</span><span style="font-family:var(--neue);font-size:24px;">Plan de acción</span></div>
      <div style="display:flex;align-items:baseline;gap:14px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;color:var(--orange);min-width:32px;">06</span><span style="font-family:var(--neue);font-size:24px;">Impacto en el negocio</span></div>
    </div>
  </div>
  <div style="position:relative;display:flex;gap:64px;padding-top:22px;border-top:1px solid rgba(255,255,255,.14);">
    <div style="display:flex;flex-direction:column;gap:6px;"><span style="font-family:var(--neue);font-size:var(--t-small);color:rgba(255,255,255,.5);letter-spacing:.14em;text-transform:uppercase;">Cliente</span><span style="font-family:var(--neue);font-weight:500;font-size:var(--t-body);color:var(--white);">{{clientName}}</span></div>
    <div style="display:flex;flex-direction:column;gap:6px;"><span style="font-family:var(--neue);font-size:var(--t-small);color:rgba(255,255,255,.5);letter-spacing:.14em;text-transform:uppercase;">Período</span><span style="font-family:var(--neue);font-weight:500;font-size:var(--t-body);color:var(--white);">{{periodo}}</span></div>
    <div style="display:flex;flex-direction:column;gap:6px;"><span style="font-family:var(--neue);font-size:var(--t-small);color:rgba(255,255,255,.5);letter-spacing:.14em;text-transform:uppercase;">Ejecutivo</span><span style="font-family:var(--neue);font-weight:500;font-size:var(--t-body);color:var(--white);">{{ejecutivo}}</span></div>
  </div>
</section>

<!-- ============ 01 RESUMEN EJECUTIVO ============ -->
<section class="page" style="background:var(--paper);color:var(--ink);">
  <div class="eyebrow-row"><div class="eyebrow"><span class="dot"></span><span class="label">01 · Resumen ejecutivo</span></div><span class="page-num">01</span></div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:22px;">
    <div style="background:var(--white);border-radius:14px;padding:22px 26px;display:flex;flex-direction:column;gap:6px;"><span style="font-family:var(--neue);font-size:24px;color:rgba(20,20,20,.5);text-transform:uppercase;letter-spacing:.04em;">Leads</span><span style="font-family:var(--mono);font-weight:800;font-size:48px;color:var(--orange);">{{leads}}</span></div>
    <div style="background:var(--white);border-radius:14px;padding:22px 26px;display:flex;flex-direction:column;gap:6px;"><span style="font-family:var(--neue);font-size:24px;color:rgba(20,20,20,.5);text-transform:uppercase;letter-spacing:.04em;">CPL</span><span style="font-family:var(--mono);font-weight:800;font-size:48px;color:var(--orange);">\${{cpl}}</span></div>
    <div style="background:var(--white);border-radius:14px;padding:22px 26px;display:flex;flex-direction:column;gap:6px;"><span style="font-family:var(--neue);font-size:24px;color:rgba(20,20,20,.5);text-transform:uppercase;letter-spacing:.04em;">Ventas</span><span style="font-family:var(--mono);font-weight:800;font-size:48px;color:var(--orange);">{{ventas}}</span></div>
    <div style="background:var(--ink);border-radius:14px;padding:22px 26px;display:flex;flex-direction:column;gap:6px;"><span style="font-family:var(--neue);font-size:24px;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.04em;">Inversión</span><span style="font-family:var(--mono);font-weight:800;font-size:48px;color:var(--peach);">\${{inversion}}</span></div>
  </div>
  <div style="margin-top:16px;background:var(--white);border-radius:12px;padding:16px 24px;display:flex;align-items:center;gap:16px;"><span style="font-family:var(--neue);font-weight:500;font-size:24px;color:var(--ink);text-transform:uppercase;letter-spacing:.04em;">Cumplimiento</span><span style="font-family:var(--neue);font-size:24px;">{{cumplimientoEstado}} — {{cumplimientoPct}} del objetivo alcanzado</span></div>
  <div style="flex:1;display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;margin-top:16px;">
    <div style="background:var(--white);border-radius:16px;padding:26px 28px;display:flex;flex-direction:column;gap:12px;"><span style="font-family:var(--neue);font-weight:500;font-size:24px;text-transform:uppercase;letter-spacing:.08em;color:var(--orange);">Objetivo del período</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;">{{objetivoPeriodo}}</span></div>
    <div style="background:var(--white);border-radius:16px;padding:26px 28px;display:flex;flex-direction:column;gap:12px;border-top:5px solid var(--orange);"><span style="font-family:var(--neue);font-weight:500;font-size:24px;text-transform:uppercase;letter-spacing:.08em;color:var(--orange);">Contexto del mes</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;">{{contextoMes}}</span></div>
    <div style="background:var(--white);border-radius:16px;padding:26px 28px;display:flex;flex-direction:column;gap:12px;"><span style="font-family:var(--neue);font-weight:500;font-size:24px;text-transform:uppercase;letter-spacing:.08em;color:var(--orange);">Conclusión general</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;">{{conclusionGeneral}}</span></div>
  </div>
  <div class="footer"><div class="footer-left"><img src="{{LOGO_BASE64}}" alt="MDK"><span>MDK · Informe Estratégico de Resultados</span></div><span class="footer-right">madketing.io</span></div>
</section>

<!-- ============ 02 ¿EN QUÉ ESTUVIMOS TRABAJANDO? ============ -->
<section class="page" style="background:var(--white);color:var(--ink);">
  <div class="eyebrow-row"><div class="eyebrow"><span class="dot"></span><span class="label">02 · ¿En qué estuvimos trabajando?</span></div><span class="page-num">02</span></div>
  <h2 class="section-title">Los 4 pilares del mes</h2>
  <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:22px;margin-top:24px;">
    <div style="background:var(--paper);border-radius:16px;padding:34px 38px;display:flex;flex-direction:column;gap:14px;"><span style="font-family:var(--mono);font-weight:800;font-size:26px;text-transform:uppercase;color:var(--orange);">Estrategia</span><span style="font-family:var(--neue);font-weight:400;font-size:25px;line-height:1.45;">{{estrategia}}</span></div>
    <div style="background:var(--paper);border-radius:16px;padding:34px 38px;display:flex;flex-direction:column;gap:14px;"><span style="font-family:var(--mono);font-weight:800;font-size:26px;text-transform:uppercase;color:var(--orange);">Operaciones</span><span style="font-family:var(--neue);font-weight:400;font-size:25px;line-height:1.45;">{{operaciones}}</span></div>
    <div style="background:var(--paper);border-radius:16px;padding:34px 38px;display:flex;flex-direction:column;gap:14px;"><span style="font-family:var(--mono);font-weight:800;font-size:26px;text-transform:uppercase;color:var(--orange);">Testing</span><span style="font-family:var(--neue);font-weight:400;font-size:25px;line-height:1.45;">{{testing}}</span></div>
    <div style="background:var(--ink);color:var(--white);border-radius:16px;padding:34px 38px;display:flex;flex-direction:column;gap:14px;position:relative;overflow:hidden;"><div style="position:absolute;top:0;left:0;width:100%;height:5px;background:var(--grad);"></div><span style="font-family:var(--mono);font-weight:800;font-size:26px;text-transform:uppercase;color:var(--peach);">Optimización</span><span style="font-family:var(--neue);font-weight:400;font-size:25px;line-height:1.45;color:var(--peach);">{{optimizacion}}</span></div>
  </div>
  <div class="footer"><div class="footer-left"><img src="{{LOGO_BASE64}}" alt="MDK"><span>MDK · Informe Estratégico de Resultados</span></div><span class="footer-right">madketing.io</span></div>
</section>

<!-- ============ 03 TESTING Y OPTIMIZACIÓN CREATIVA ============ -->
<section class="page" style="background:var(--paper);color:var(--ink);">
  <div class="eyebrow-row"><div class="eyebrow"><span class="dot"></span><span class="label">03 · Testing y optimización creativa</span></div><span class="page-num">03</span></div>
  <div style="flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:22px;">
    <div style="display:flex;flex-direction:column;gap:12px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--orange);">Anuncio A</span>
      <div style="width:100%;flex:1;border-radius:14px;background:#e8e8e8;display:flex;align-items:center;justify-content:center;overflow:hidden;">
        {{anuncioA_img}}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--orange);">Anuncio B</span>
      <div style="width:100%;flex:1;border-radius:14px;background:#e8e8e8;display:flex;align-items:center;justify-content:center;overflow:hidden;">
        {{anuncioB_img}}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--orange);">Anuncio C</span>
      <div style="width:100%;flex:1;border-radius:14px;background:#e8e8e8;display:flex;align-items:center;justify-content:center;overflow:hidden;">
        {{anuncioC_img}}
      </div>
    </div>
  </div>
  <div style="margin-top:20px;background:var(--white);border-radius:14px;padding:24px 30px;display:flex;flex-direction:column;gap:8px;"><span style="font-family:var(--neue);font-weight:500;font-size:24px;text-transform:uppercase;letter-spacing:.08em;color:var(--orange);">Análisis</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;">{{analisisCreativo}}</span></div>
  <div class="footer"><div class="footer-left"><img src="{{LOGO_BASE64}}" alt="MDK"><span>MDK · Informe Estratégico de Resultados</span></div><span class="footer-right">madketing.io</span></div>
</section>

<!-- ============ 04 PERFORMANCE DE CAMPAÑAS ============ -->
<section class="page" style="background:var(--white);color:var(--ink);">
  <div class="eyebrow-row"><div class="eyebrow"><span class="dot"></span><span class="label">04 · Performance de campañas</span></div><span class="page-num">04</span></div>
  <div style="flex:1;display:flex;flex-direction:column;gap:22px;margin-top:20px;justify-content:center;">
    <div style="display:flex;flex-direction:column;gap:10px;">
      <span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--orange);">Meta Ads</span>
      <div style="border-radius:14px;overflow:hidden;border:1px solid rgba(20,20,20,.1);">
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr;background:var(--ink);">
          <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:14px 24px;text-transform:uppercase;letter-spacing:.06em;">Campaña</span>
          <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:14px 14px;text-transform:uppercase;letter-spacing:.06em;text-align:right;">Inversión</span>
          <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:14px 14px;text-transform:uppercase;letter-spacing:.06em;text-align:right;">Leads</span>
          <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:14px 14px;text-transform:uppercase;letter-spacing:.06em;text-align:right;">CPL</span>
          <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:14px 14px;text-transform:uppercase;letter-spacing:.06em;text-align:right;">CPC</span>
          <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:14px 24px 14px 14px;text-transform:uppercase;letter-spacing:.06em;text-align:right;">CTR</span>
        </div>
        <!--REPEAT:metaAdsCampanas-->
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr;background:var(--white);border-bottom:1px solid rgba(20,20,20,.08);"><span style="font-family:var(--neue);font-size:24px;padding:14px 24px;">{{nombre}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 14px;text-align:right;">\${{inversion}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 14px;text-align:right;">{{leads}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 14px;text-align:right;">\${{cpl}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 14px;text-align:right;">\${{cpc}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 24px 14px 14px;text-align:right;">{{ctr}}</span></div>
        <!--END:metaAdsCampanas-->
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr;background:var(--paper);"><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 24px;text-transform:uppercase;">Total</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 14px;text-align:right;">\${{metaTotalInversion}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 14px;text-align:right;">{{metaTotalLeads}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 14px;text-align:right;color:var(--orange);">\${{metaTotalCpl}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 14px;text-align:right;">\${{metaTotalCpc}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 24px 14px 14px;text-align:right;">{{metaTotalCtr}}</span></div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--orange);">Google Ads</span>
      <div style="border-radius:14px;overflow:hidden;border:1px solid rgba(20,20,20,.1);">
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr;background:var(--ink);">
          <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:14px 24px;text-transform:uppercase;letter-spacing:.06em;">Campaña</span>
          <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:14px 14px;text-transform:uppercase;letter-spacing:.06em;text-align:right;">Inversión</span>
          <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:14px 14px;text-transform:uppercase;letter-spacing:.06em;text-align:right;">Leads</span>
          <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:14px 14px;text-transform:uppercase;letter-spacing:.06em;text-align:right;">CPL</span>
          <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:14px 14px;text-transform:uppercase;letter-spacing:.06em;text-align:right;">CPC</span>
          <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:14px 24px 14px 14px;text-transform:uppercase;letter-spacing:.06em;text-align:right;">CTR</span>
        </div>
        <!--REPEAT:googleAdsCampanas-->
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr;background:var(--white);border-bottom:1px solid rgba(20,20,20,.08);"><span style="font-family:var(--neue);font-size:24px;padding:14px 24px;">{{nombre}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 14px;text-align:right;">\${{inversion}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 14px;text-align:right;">{{leads}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 14px;text-align:right;">\${{cpl}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 14px;text-align:right;">\${{cpc}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 24px 14px 14px;text-align:right;">{{ctr}}</span></div>
        <!--END:googleAdsCampanas-->
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr;background:var(--paper);"><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 24px;text-transform:uppercase;">Total</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 14px;text-align:right;">\${{googleTotalInversion}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 14px;text-align:right;">{{googleTotalLeads}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 14px;text-align:right;color:var(--orange);">\${{googleTotalCpl}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 14px;text-align:right;">\${{googleTotalCpc}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 24px 14px 14px;text-align:right;">{{googleTotalCtr}}</span></div>
      </div>
    </div>
  </div>
  <div class="footer"><div class="footer-left"><img src="{{LOGO_BASE64}}" alt="MDK"><span>MDK · Informe Estratégico de Resultados</span></div><span class="footer-right">madketing.io</span></div>
</section>

<!-- ============ 05 ACCIONES REALIZADAS ============ -->
<section class="page" style="background:var(--paper);color:var(--ink);">
  <div class="eyebrow-row"><div class="eyebrow"><span class="dot"></span><span class="label">05 · Acciones realizadas</span></div><span class="page-num">05</span></div>
  <h2 class="section-title">Acciones realizadas</h2>
  <div style="flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:24px;">
    <div style="background:var(--white);border-radius:16px;padding:34px 32px;display:flex;flex-direction:column;gap:20px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--orange);">Cambios en campañas</span><div style="display:flex;flex-direction:column;gap:16px;">
      <!--REPEAT:cambiosCampanas-->
      <div style="display:flex;gap:12px;"><span style="color:var(--orange);font-size:24px;">•</span><span style="font-family:var(--neue);font-size:24px;line-height:1.35;">{{item}}</span></div>
      <!--END:cambiosCampanas-->
    </div></div>
    <div style="background:var(--white);border-radius:16px;padding:34px 32px;display:flex;flex-direction:column;gap:20px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--orange);">Optimizaciones aplicadas</span><div style="display:flex;flex-direction:column;gap:16px;">
      <!--REPEAT:optimizacionesAplicadas-->
      <div style="display:flex;gap:12px;"><span style="color:var(--orange);font-size:24px;">•</span><span style="font-family:var(--neue);font-size:24px;line-height:1.35;">{{item}}</span></div>
      <!--END:optimizacionesAplicadas-->
    </div></div>
    <div style="background:var(--ink);color:var(--white);border-radius:16px;padding:34px 32px;display:flex;flex-direction:column;gap:20px;position:relative;overflow:hidden;"><div style="position:absolute;top:0;left:0;width:100%;height:5px;background:var(--grad);"></div><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--peach);">Tests ejecutados</span><div style="display:flex;flex-direction:column;gap:16px;">
      <!--REPEAT:testsEjecutados-->
      <div style="display:flex;gap:12px;"><span style="color:var(--peach);font-size:24px;">•</span><span style="font-family:var(--neue);font-size:24px;line-height:1.35;color:var(--peach);">{{item}}</span></div>
      <!--END:testsEjecutados-->
    </div></div>
  </div>
  <div class="footer"><div class="footer-left"><img src="{{LOGO_BASE64}}" alt="MDK"><span>MDK · Informe Estratégico de Resultados</span></div><span class="footer-right">madketing.io</span></div>
</section>

<!-- ============ 06 IMPACTO EN EL NEGOCIO — FUNNEL ============ -->
<section class="page" style="background:var(--white);color:var(--ink);">
  <div class="eyebrow-row"><div class="eyebrow"><span class="dot"></span><span class="label">06 · Impacto en el negocio — funnel</span></div><span class="page-num">06</span></div>
  <h2 class="section-title" style="font-size:44px;">Funnel comercial</h2>
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;margin-top:16px;">
    <div style="border-radius:14px;overflow:hidden;border:1px solid rgba(20,20,20,.1);">
      <div style="display:grid;grid-template-columns:1.4fr 1fr .7fr 1fr .7fr 1fr .9fr;background:var(--ink);">
        <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:15px 22px;text-transform:uppercase;letter-spacing:.05em;">Etapa</span>
        <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:15px 12px;text-transform:uppercase;letter-spacing:.05em;text-align:right;">Zona 1</span>
        <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:15px 12px;text-transform:uppercase;letter-spacing:.05em;text-align:right;">%</span>
        <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:15px 12px;text-transform:uppercase;letter-spacing:.05em;text-align:right;">Zona 2</span>
        <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:15px 12px;text-transform:uppercase;letter-spacing:.05em;text-align:right;">%</span>
        <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:15px 12px;text-transform:uppercase;letter-spacing:.05em;text-align:right;">Total</span>
        <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:15px 22px 15px 12px;text-transform:uppercase;letter-spacing:.05em;text-align:right;">% Gral</span>
      </div>
      <!--REPEAT:funnel-->
      <div style="display:grid;grid-template-columns:1.4fr 1fr .7fr 1fr .7fr 1fr .9fr;background:{{rowBg}};border-bottom:1px solid rgba(20,20,20,.07);"><span style="font-family:var(--neue);font-weight:500;font-size:24px;padding:14px 22px;">{{etapa}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 12px;text-align:right;">{{zona1}}</span><span style="font-family:var(--mono);font-size:24px;padding:14px 12px;text-align:right;color:rgba(20,20,20,.6);">{{zona1pct}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 12px;text-align:right;">{{zona2}}</span><span style="font-family:var(--mono);font-size:24px;padding:14px 12px;text-align:right;color:rgba(20,20,20,.6);">{{zona2pct}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:14px 12px;text-align:right;">{{total}}</span><span style="font-family:var(--mono);font-size:24px;padding:14px 22px 14px 12px;text-align:right;color:rgba(20,20,20,.6);">{{totalPct}}</span></div>
      <!--END:funnel-->
    </div>
    <div style="margin-top:18px;background:var(--paper);border-radius:12px;padding:18px 24px;display:flex;gap:12px;align-items:flex-start;"><span style="color:var(--fucsia);font-family:var(--neue);font-weight:500;font-size:24px;white-space:nowrap;">Cuellos de botella:</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.35;">{{cuellosBotella}}</span></div>
  </div>
  <div class="footer"><div class="footer-left"><img src="{{LOGO_BASE64}}" alt="MDK"><span>MDK · Informe Estratégico de Resultados</span></div><span class="footer-right">madketing.io</span></div>
</section>

<!-- ============ 07 GESTIÓN COMERCIAL EN CRM ============ -->
<section class="page" style="background:var(--paper);color:var(--ink);">
  <div class="eyebrow-row"><div class="eyebrow"><span class="dot"></span><span class="label">07 · Gestión comercial en CRM</span></div><span class="page-num">07</span></div>
  <h2 class="section-title" style="font-size:44px;">Cómo se gestionó el pipeline</h2>
  <div style="flex:1;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr;gap:20px;margin-top:22px;">
    <div style="background:var(--white);border-radius:16px;padding:28px 30px;display:flex;flex-direction:column;gap:12px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--orange);">Tiempo de respuesta</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;">{{tiempoRespuesta}}</span></div>
    <div style="background:var(--white);border-radius:16px;padding:28px 30px;display:flex;flex-direction:column;gap:12px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--orange);">Registro y campos</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;">{{registroCampos}}</span></div>
    <div style="background:var(--white);border-radius:16px;padding:28px 30px;display:flex;flex-direction:column;gap:12px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--orange);">Tiempo por etapa</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;">{{tiempoPorEtapa}}</span></div>
    <div style="background:var(--white);border-radius:16px;padding:28px 30px;display:flex;flex-direction:column;gap:12px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--orange);">Calidad de respuesta</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;">{{calidadRespuesta}}</span></div>
    <div style="grid-column:span 2;background:var(--ink);color:var(--white);border-radius:16px;padding:28px 34px;display:flex;flex-direction:column;gap:12px;position:relative;overflow:hidden;"><div style="position:absolute;top:0;left:0;width:100%;height:5px;background:var(--grad);"></div><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--peach);">Recontacto</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;color:var(--peach);">{{recontacto}}</span></div>
  </div>
  <div class="footer"><div class="footer-left"><img src="{{LOGO_BASE64}}" alt="MDK"><span>MDK · Informe Estratégico de Resultados</span></div><span class="footer-right">madketing.io</span></div>
</section>

<!-- ============ 08 IMPACTO ECONÓMICO ESTIMADO ============ -->
<section class="page" style="background:var(--ink);color:var(--white);">
  <div style="position:absolute;top:-24%;right:-14%;width:44%;height:120%;background:var(--grad);filter:blur(140px);opacity:.34;border-radius:50%;"></div>
  <div class="eyebrow-row" style="position:relative;"><div class="eyebrow"><span class="dot"></span><span class="label" style="color:var(--peach);">08 · Impacto económico estimado</span></div><span class="page-num dark">08</span></div>
  <h2 class="section-title" style="position:relative;">La pauta en lenguaje de negocio</h2>
  <div style="position:relative;flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:26px;align-content:center;">
    <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:36px 34px;min-width:0;display:flex;flex-direction:column;gap:14px;"><span style="font-family:var(--mono);font-weight:800;font-size:52px;line-height:.95;color:var(--orange);">\${{costoPorVenta}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;">Costo por venta estimado</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;color:var(--peach);">Inversión total / ventas cerradas en el período</span></div>
    <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:36px 34px;min-width:0;display:flex;flex-direction:column;gap:14px;"><span style="font-family:var(--mono);font-weight:800;font-size:52px;line-height:.95;color:var(--orange);">{{inversionVsFacturacion}}x</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;">Inversión vs facturación</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;color:var(--peach);">Relación entre inversión en pauta y facturación potencial generada</span></div>
    <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:36px 34px;min-width:0;display:flex;flex-direction:column;gap:14px;position:relative;overflow:hidden;"><div style="position:absolute;top:0;left:0;width:100%;height:5px;background:var(--grad);"></div><span style="font-family:var(--mono);font-weight:800;font-size:52px;line-height:.95;color:var(--peach);">\${{ahorroOptimizacion}}</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;">Ahorro por optimización</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;color:var(--peach);">Reducción de costo vs. período anterior o benchmark</span></div>
  </div>
  <div class="footer dark" style="position:relative;"><div class="footer-left"><img src="{{LOGO_BASE64}}" alt="MDK"><span>MDK · Informe Estratégico de Resultados</span></div><span class="footer-right">madketing.io</span></div>
</section>

<!-- ============ 09 BENCHMARK Y CONTEXTO COMPETITIVO ============ -->
<section class="page" style="background:var(--white);color:var(--ink);">
  <div class="eyebrow-row"><div class="eyebrow"><span class="dot"></span><span class="label">09 · Benchmark y contexto competitivo</span></div><span class="page-num">09</span></div>
  <h2 class="section-title">Cómo estamos vs el mercado</h2>
  <div style="flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:26px;align-content:center;">
    <div style="background:var(--paper);border-radius:16px;padding:38px 36px;display:flex;flex-direction:column;gap:16px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--orange);">Benchmark interno MDK</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.45;">{{benchmarkInterno}}</span></div>
    <div style="background:var(--paper);border-radius:16px;padding:38px 36px;display:flex;flex-direction:column;gap:16px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--orange);">Comparación histórica</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.45;">{{comparacionHistorica}}</span></div>
    <div style="background:var(--ink);color:var(--white);border-radius:16px;padding:38px 36px;display:flex;flex-direction:column;gap:16px;position:relative;overflow:hidden;"><div style="position:absolute;top:0;left:0;width:100%;height:5px;background:var(--grad);"></div><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--peach);">Contexto competitivo</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.45;color:var(--peach);">{{contextoCompetitivo}}</span></div>
  </div>
  <div class="footer"><div class="footer-left"><img src="{{LOGO_BASE64}}" alt="MDK"><span>MDK · Informe Estratégico de Resultados</span></div><span class="footer-right">madketing.io</span></div>
</section>

<!-- ============ 10 RIESGOS Y ALERTAS ============ -->
<section class="page" style="background:var(--paper);color:var(--ink);">
  <div class="eyebrow-row"><div class="eyebrow"><span class="dot"></span><span class="label">10 · Riesgos y alertas</span></div><span class="page-num">10</span></div>
  <h2 class="section-title">Qué vigilar</h2>
  <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:22px;margin-top:24px;">
    <div style="background:var(--white);border-radius:16px;padding:30px 34px;display:flex;flex-direction:column;gap:12px;border-left:6px solid var(--fucsia);"><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--fucsia);">Saturación de audiencias</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;">{{saturacionAudiencias}}</span></div>
    <div style="background:var(--white);border-radius:16px;padding:30px 34px;display:flex;flex-direction:column;gap:12px;border-left:6px solid var(--orange);"><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--orange);">Dependencia de canales</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;">{{dependenciaCanales}}</span></div>
    <div style="background:var(--white);border-radius:16px;padding:30px 34px;display:flex;flex-direction:column;gap:12px;border-left:6px solid var(--peach);"><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--orange);">Riesgos operativos / comerciales</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;">{{riesgosOperativos}}</span></div>
    <div style="background:var(--ink);color:var(--white);border-radius:16px;padding:30px 34px;display:flex;flex-direction:column;gap:12px;position:relative;overflow:hidden;"><div style="position:absolute;top:0;left:0;width:100%;height:5px;background:var(--grad);"></div><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;color:var(--peach);">Alertas tempranas</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;color:var(--peach);">{{alertasTempranas}}</span></div>
  </div>
  <div class="footer"><div class="footer-left"><img src="{{LOGO_BASE64}}" alt="MDK"><span>MDK · Informe Estratégico de Resultados</span></div><span class="footer-right">madketing.io</span></div>
</section>

<!-- ============ 11 PLAN DE ACCIÓN ============ -->
<section class="page" style="background:var(--ink);color:var(--white);">
  <div style="position:absolute;top:-22%;right:-12%;width:42%;height:120%;background:var(--grad);filter:blur(140px);opacity:.34;border-radius:50%;"></div>
  <div class="eyebrow-row" style="position:relative;"><div class="eyebrow"><span class="dot"></span><span class="label" style="color:var(--peach);">11 · Plan de acción — próximo período</span></div><span class="page-num dark">11</span></div>
  <div style="position:relative;flex:1;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:auto auto;gap:20px;margin-top:24px;align-content:center;">
    <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:26px 26px;min-width:0;display:flex;flex-direction:column;gap:14px;"><span style="font-family:var(--mono);font-weight:800;font-size:38px;color:var(--orange);">01</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;line-height:1.1;">Objetivos y pauta</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;color:var(--peach);">{{definicionObjetivos}}</span></div>
    <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:26px 26px;min-width:0;display:flex;flex-direction:column;gap:14px;"><span style="font-family:var(--mono);font-weight:800;font-size:38px;color:var(--orange);">02</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;line-height:1.1;">Acciones inmediatas</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;color:var(--peach);">{{accionesInmediatas}}</span></div>
    <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:26px 26px;min-width:0;display:flex;flex-direction:column;gap:14px;"><span style="font-family:var(--mono);font-weight:800;font-size:38px;color:var(--orange);">03</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;line-height:1.1;">Ajustes estratégicos</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;color:var(--peach);">{{ajustesEstrategicos}}</span></div>
    <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:26px 26px;min-width:0;display:flex;flex-direction:column;gap:14px;"><span style="font-family:var(--mono);font-weight:800;font-size:38px;color:var(--orange);">04</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;line-height:1.1;">Nuevas implementaciones</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;color:var(--peach);">{{nuevasImplementaciones}}</span></div>
    <div style="grid-column:span 2;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:26px 30px;min-width:0;display:flex;flex-direction:column;gap:14px;position:relative;overflow:hidden;"><div style="position:absolute;top:0;left:0;width:100%;height:5px;background:var(--grad);"></div><span style="font-family:var(--mono);font-weight:800;font-size:38px;color:var(--fucsia);">05</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;line-height:1.1;">Recomendaciones al cliente</span><span style="font-family:var(--neue);font-weight:400;font-size:24px;line-height:1.4;color:var(--peach);">{{recomendacionesCliente}}</span></div>
  </div>
  <div class="footer dark" style="position:relative;"><div class="footer-left"><img src="{{LOGO_BASE64}}" alt="MDK"><span>MDK · Informe Estratégico de Resultados</span></div><span class="footer-right">madketing.io</span></div>
</section>

</body>
</html>
`