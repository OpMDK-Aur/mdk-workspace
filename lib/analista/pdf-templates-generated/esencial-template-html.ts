// GENERADO AUTOMÁTICAMENTE a partir de la plantilla HTML — no editar a mano.
// Embebido como string para no depender de fs.readFileSync + tracing en runtime.

export const ESENCIAL_TEMPLATE_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Informe Esencial MDK</title>
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
    --t-title:56px; --t-lead:32px; --t-body:26px; --t-eyebrow:24px; --t-small:24px;
    --px:96px; --pt:70px; --pb:56px;
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
  .footer{margin-top:16px;display:flex;align-items:center;justify-content:space-between;padding-top:18px;border-top:1px solid rgba(20,20,20,.12);}
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
  .page-num{font-family:var(--mono);font-weight:800;font-size:38px;color:rgba(20,20,20,.14);}
  .page-num.dark{color:rgba(255,255,255,.1);}
  h2.section-title{font-family:var(--mono);font-weight:800;font-size:var(--t-title);line-height:1;letter-spacing:-.01em;text-transform:uppercase;margin-top:14px;}
</style>
</head>
<body>

<!-- ============ PORTADA ============ -->
<section class="page" style="background:var(--ink);color:var(--white);">
  <div style="position:absolute;top:0;left:0;width:100%;height:8px;background:var(--grad);"></div>
  <div style="position:absolute;top:-28%;left:-10%;width:48%;height:110%;background:var(--grad);filter:blur(130px);opacity:.4;border-radius:50%;"></div>
  <img src="{{LOGO_BASE64}}" alt="MDK" style="position:absolute;bottom:0;right:-3%;width:42%;height:auto;opacity:.08;">
  <div style="position:relative;display:flex;align-items:center;justify-content:space-between;">
    <span style="font-family:var(--neue);font-weight:500;font-size:var(--t-eyebrow);letter-spacing:.2em;text-transform:uppercase;color:var(--peach);background:rgba(255,127,0,.14);border:1px solid rgba(255,188,128,.3);border-radius:999px;padding:9px 20px;">Plan Esencial</span>
    <img src="{{LOGO_BASE64}}" alt="MDK" style="height:34px;width:auto;">
  </div>
  <div style="position:relative;display:flex;flex:1;gap:80px;align-items:center;">
    <div style="flex:none;max-width:720px;">
      <h1 style="font-family:var(--mono);font-weight:800;font-size:88px;line-height:.97;letter-spacing:-.01em;text-transform:uppercase;">Informe de<br>resultados</h1>
      <p style="font-family:var(--neue);font-weight:400;font-size:var(--t-lead);color:rgba(255,255,255,.78);margin-top:26px;">Cierre de mes · reporte operativo de campañas.</p>
    </div>
    <div style="flex:1;border-left:1px solid rgba(255,255,255,.16);padding-left:56px;display:flex;flex-direction:column;gap:16px;">
      <span style="font-family:var(--neue);font-weight:500;font-size:var(--t-small);letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.5);">Contenido</span>
      <div style="display:flex;align-items:baseline;gap:18px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;color:var(--orange);min-width:38px;">01</span><span style="font-family:var(--neue);font-weight:400;font-size:26px;">Resumen del período</span></div>
      <div style="display:flex;align-items:baseline;gap:18px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;color:var(--orange);min-width:38px;">02</span><span style="font-family:var(--neue);font-weight:400;font-size:26px;">Resultados de campañas</span></div>
      <div style="display:flex;align-items:baseline;gap:18px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;color:var(--orange);min-width:38px;">03</span><span style="font-family:var(--neue);font-weight:400;font-size:26px;">Acciones realizadas</span></div>
      <div style="display:flex;align-items:baseline;gap:18px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;color:var(--orange);min-width:38px;">04</span><span style="font-family:var(--neue);font-weight:400;font-size:26px;">Análisis del funnel (síntesis)</span></div>
      <div style="display:flex;align-items:baseline;gap:18px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;color:var(--orange);min-width:38px;">05</span><span style="font-family:var(--neue);font-weight:400;font-size:26px;">Qué funcionó / qué no</span></div>
      <div style="display:flex;align-items:baseline;gap:18px;"><span style="font-family:var(--mono);font-weight:800;font-size:24px;color:var(--fucsia);min-width:38px;">06</span><span style="font-family:var(--neue);font-weight:400;font-size:26px;">Plan del mes siguiente</span></div>
    </div>
  </div>
  <div style="position:relative;display:flex;gap:64px;padding-top:24px;border-top:1px solid rgba(255,255,255,.14);">
    <div style="display:flex;flex-direction:column;gap:6px;"><span style="font-family:var(--neue);font-size:var(--t-small);color:rgba(255,255,255,.5);letter-spacing:.14em;text-transform:uppercase;">Cliente</span><span style="font-family:var(--neue);font-weight:500;font-size:var(--t-body);color:var(--white);">{{clientName}}</span></div>
    <div style="display:flex;flex-direction:column;gap:6px;"><span style="font-family:var(--neue);font-size:var(--t-small);color:rgba(255,255,255,.5);letter-spacing:.14em;text-transform:uppercase;">Período</span><span style="font-family:var(--neue);font-weight:500;font-size:var(--t-body);color:var(--white);">{{periodo}}</span></div>
    <div style="display:flex;flex-direction:column;gap:6px;"><span style="font-family:var(--neue);font-size:var(--t-small);color:rgba(255,255,255,.5);letter-spacing:.14em;text-transform:uppercase;">Responsable</span><span style="font-family:var(--neue);font-weight:500;font-size:var(--t-body);color:var(--white);">{{responsable}}</span></div>
  </div>
</section>

<!-- ============ 01 RESUMEN DEL PERÍODO ============ -->
<section class="page" style="background:var(--paper);color:var(--ink);">
  <div class="eyebrow-row"><div class="eyebrow"><span class="dot"></span><span class="label">01 · Resumen del período</span></div><span class="page-num">01</span></div>
  <h2 class="section-title">Resumen del período</h2>
  <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:26px;">
    <div style="display:flex;flex-direction:column;gap:24px;">
      <div style="background:var(--white);border-radius:16px;padding:30px 34px;display:flex;flex-direction:column;gap:12px;">
        <span style="font-family:var(--neue);font-weight:500;font-size:var(--t-small);letter-spacing:.1em;text-transform:uppercase;color:var(--orange);">Objetivo de la pauta</span>
        <span style="font-family:var(--neue);font-weight:400;font-size:var(--t-body);line-height:1.45;">{{objetivoPauta}}</span>
      </div>
      <div style="flex:1;background:var(--white);border-radius:16px;padding:30px 34px;display:flex;flex-direction:column;gap:12px;">
        <span style="font-family:var(--neue);font-weight:500;font-size:var(--t-small);letter-spacing:.1em;text-transform:uppercase;color:var(--orange);">Conclusión general</span>
        <span style="font-family:var(--neue);font-weight:400;font-size:var(--t-body);line-height:1.45;">{{conclusionGeneral}}</span>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:18px;">
      <span style="font-family:var(--neue);font-weight:500;font-size:var(--t-small);letter-spacing:.1em;text-transform:uppercase;color:rgba(20,20,20,.5);">Cumplimiento de objetivo</span>
      <div style="flex:1;display:grid;grid-template-rows:1fr 1fr 1fr;gap:16px;">
        <div style="background:var(--white);border-radius:16px;padding:22px 30px;display:flex;align-items:center;justify-content:space-between;"><div style="display:flex;flex-direction:column;gap:4px;"><span style="font-family:var(--neue);font-weight:500;font-size:var(--t-small);color:rgba(20,20,20,.55);text-transform:uppercase;letter-spacing:.04em;">Leads generados</span><span style="font-family:var(--neue);font-size:24px;color:rgba(20,20,20,.45);">objetivo: {{leadsObjetivo}}</span></div><span style="font-family:var(--mono);font-weight:800;font-size:56px;color:var(--orange);">{{leadsGenerados}}</span></div>
        <div style="background:var(--white);border-radius:16px;padding:22px 30px;display:flex;align-items:center;justify-content:space-between;"><div style="display:flex;flex-direction:column;gap:4px;"><span style="font-family:var(--neue);font-weight:500;font-size:var(--t-small);color:rgba(20,20,20,.55);text-transform:uppercase;letter-spacing:.04em;">CPL promedio</span><span style="font-family:var(--neue);font-size:24px;color:rgba(20,20,20,.45);">objetivo: \${{cplObjetivo}}</span></div><span style="font-family:var(--mono);font-weight:800;font-size:56px;color:var(--orange);">\${{cplPromedio}}</span></div>
        <div style="background:var(--ink);border-radius:16px;padding:22px 30px;display:flex;align-items:center;justify-content:space-between;"><div style="display:flex;flex-direction:column;gap:4px;"><span style="font-family:var(--neue);font-weight:500;font-size:var(--t-small);color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.04em;">Cumplimiento</span></div><span style="font-family:var(--mono);font-weight:800;font-size:56px;color:var(--peach);">{{cumplimientoPct}}</span></div>
      </div>
    </div>
  </div>
  <div class="footer"><div class="footer-left"><img src="{{LOGO_BASE64}}" alt="MDK"><span>MDK · Informe de Resultados — Plan Esencial</span></div><span class="footer-right">madketing.io</span></div>
</section>

<!-- ============ 02 RESULTADOS DE CAMPAÑAS ============ -->
<section class="page" style="background:var(--white);color:var(--ink);">
  <div class="eyebrow-row"><div class="eyebrow"><span class="dot"></span><span class="label">02 · Resultados de campañas</span></div><span class="page-num">02</span></div>
  <h2 class="section-title">Resultados de campañas</h2>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-top:26px;">
    <div style="background:var(--paper);border-radius:14px;padding:24px 26px;display:flex;flex-direction:column;gap:6px;"><span style="font-family:var(--neue);font-size:24px;color:rgba(20,20,20,.5);text-transform:uppercase;letter-spacing:.04em;">Inversión total</span><span style="font-family:var(--mono);font-weight:800;font-size:46px;color:var(--orange);">\${{inversionTotal}}</span><span style="font-family:var(--neue);font-size:24px;color:rgba(20,20,20,.45);">presupuesto del mes</span></div>
    <div style="background:var(--paper);border-radius:14px;padding:24px 26px;display:flex;flex-direction:column;gap:6px;"><span style="font-family:var(--neue);font-size:24px;color:rgba(20,20,20,.5);text-transform:uppercase;letter-spacing:.04em;">Leads generados</span><span style="font-family:var(--mono);font-weight:800;font-size:46px;color:var(--orange);">{{leadsTotalPeriodo}}</span><span style="font-family:var(--neue);font-size:24px;color:rgba(20,20,20,.45);">total del período</span></div>
    <div style="background:var(--paper);border-radius:14px;padding:24px 26px;display:flex;flex-direction:column;gap:6px;"><span style="font-family:var(--neue);font-size:24px;color:rgba(20,20,20,.5);text-transform:uppercase;letter-spacing:.04em;">CPL promedio</span><span style="font-family:var(--mono);font-weight:800;font-size:46px;color:var(--orange);">\${{cplPromedioCampanas}}</span><span style="font-family:var(--neue);font-size:24px;color:rgba(20,20,20,.45);">costo por lead</span></div>
    <div style="background:var(--ink);border-radius:14px;padding:24px 26px;display:flex;flex-direction:column;gap:6px;"><span style="font-family:var(--neue);font-size:24px;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.04em;">Vs período ant.</span><span style="font-family:var(--mono);font-weight:800;font-size:46px;color:var(--peach);">{{vsPeriodoAnterior}}</span><span style="font-family:var(--neue);font-size:24px;color:rgba(255,255,255,.5);">evolución</span></div>
  </div>
  <div style="flex:1;margin-top:24px;border-radius:16px;overflow:hidden;border:1px solid rgba(20,20,20,.1);display:flex;flex-direction:column;">
    <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;background:var(--ink);">
      <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:18px 26px;letter-spacing:.06em;text-transform:uppercase;">Campaña</span>
      <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:18px 16px;letter-spacing:.06em;text-transform:uppercase;text-align:right;">Inversión</span>
      <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:18px 16px;letter-spacing:.06em;text-transform:uppercase;text-align:right;">Leads</span>
      <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:18px 16px;letter-spacing:.06em;text-transform:uppercase;text-align:right;">CPL</span>
      <span style="font-family:var(--neue);font-weight:500;font-size:24px;color:rgba(255,255,255,.7);padding:18px 26px 18px 16px;letter-spacing:.06em;text-transform:uppercase;text-align:right;">Vs ant.</span>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;">
      <!--REPEAT:campanas-->
      <div style="flex:1;display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;align-items:center;border-bottom:1px solid rgba(20,20,20,.08);">
        <span style="font-family:var(--neue);font-size:25px;padding:0 26px;">{{nombre}}</span>
        <span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:0 16px;text-align:right;">\${{inversion}}</span>
        <span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:0 16px;text-align:right;">{{leads}}</span>
        <span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:0 16px;text-align:right;">\${{cpl}}</span>
        <span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:0 26px 0 16px;text-align:right;">{{vsAnt}}</span>
      </div>
      <!--END:campanas-->
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;align-items:center;background:var(--paper);">
        <span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:20px 26px;text-transform:uppercase;">Total</span>
        <span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:20px 16px;text-align:right;">\${{totalInversion}}</span>
        <span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:20px 16px;text-align:right;">{{totalLeads}}</span>
        <span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:20px 16px;text-align:right;color:var(--orange);">\${{totalCpl}}</span>
        <span style="font-family:var(--mono);font-weight:800;font-size:24px;padding:20px 26px 20px 16px;text-align:right;">{{totalVsAnt}}</span>
      </div>
    </div>
  </div>
  <div class="footer"><div class="footer-left"><img src="{{LOGO_BASE64}}" alt="MDK"><span>MDK · Informe de Resultados — Plan Esencial</span></div><span class="footer-right">madketing.io</span></div>
</section>

<!-- ============ 03 ACCIONES REALIZADAS ============ -->
<section class="page" style="background:var(--paper);color:var(--ink);">
  <div class="eyebrow-row"><div class="eyebrow"><span class="dot"></span><span class="label">03 · Acciones realizadas</span></div><span class="page-num">03</span></div>
  <h2 class="section-title">Acciones realizadas</h2>
  <div style="flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:26px;">
    <div style="background:var(--white);border-radius:16px;padding:34px 32px;min-width:0;display:flex;flex-direction:column;gap:20px;">
      <span style="font-family:var(--mono);font-weight:800;font-size:25px;text-transform:uppercase;color:var(--orange);">Cambios en campañas</span>
      <div style="display:flex;flex-direction:column;gap:16px;">
        <!--REPEAT:cambiosCampanas-->
        <div style="display:flex;gap:12px;"><span style="color:var(--orange);font-size:25px;line-height:1.35;">•</span><span style="font-family:var(--neue);font-size:25px;line-height:1.35;">{{item}}</span></div>
        <!--END:cambiosCampanas-->
      </div>
    </div>
    <div style="background:var(--white);border-radius:16px;padding:34px 32px;min-width:0;display:flex;flex-direction:column;gap:20px;">
      <span style="font-family:var(--mono);font-weight:800;font-size:25px;text-transform:uppercase;color:var(--orange);">Optimizaciones aplicadas</span>
      <div style="display:flex;flex-direction:column;gap:16px;">
        <!--REPEAT:optimizacionesAplicadas-->
        <div style="display:flex;gap:12px;"><span style="color:var(--orange);font-size:25px;line-height:1.35;">•</span><span style="font-family:var(--neue);font-size:25px;line-height:1.35;">{{item}}</span></div>
        <!--END:optimizacionesAplicadas-->
      </div>
    </div>
    <div style="background:var(--ink);color:var(--white);border-radius:16px;padding:34px 32px;min-width:0;display:flex;flex-direction:column;gap:20px;position:relative;overflow:hidden;">
      <div style="position:absolute;top:0;left:0;width:100%;height:5px;background:var(--grad);"></div>
      <span style="font-family:var(--mono);font-weight:800;font-size:25px;text-transform:uppercase;color:var(--peach);">Tests ejecutados</span>
      <div style="display:flex;flex-direction:column;gap:16px;">
        <!--REPEAT:testsEjecutados-->
        <div style="display:flex;gap:12px;"><span style="color:var(--peach);font-size:25px;line-height:1.35;">•</span><span style="font-family:var(--neue);font-size:25px;line-height:1.35;color:var(--peach);">{{item}}</span></div>
        <!--END:testsEjecutados-->
      </div>
    </div>
  </div>
  <div class="footer"><div class="footer-left"><img src="{{LOGO_BASE64}}" alt="MDK"><span>MDK · Informe de Resultados — Plan Esencial</span></div><span class="footer-right">madketing.io</span></div>
</section>

<!-- ============ 04 ANÁLISIS DEL FUNNEL — SÍNTESIS ============ -->
<section class="page" style="background:var(--white);color:var(--ink);">
  <div class="eyebrow-row"><div class="eyebrow"><span class="dot"></span><span class="label">04 · Análisis del funnel — síntesis</span></div><span class="page-num">04</span></div>
  <div style="margin-top:16px;background:var(--paper);border-radius:10px;padding:14px 20px;display:inline-flex;align-self:flex-start;"><span style="font-family:var(--neue);font-size:24px;color:rgba(20,20,20,.6);">Síntesis del flujo de leads. El análisis profundo del pipeline corresponde al Plan Estratégico.</span></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:24px;">
    <div style="background:var(--paper);border-radius:16px;padding:34px 38px;display:flex;flex-direction:column;gap:8px;"><span style="font-family:var(--mono);font-weight:800;font-size:64px;line-height:.95;color:var(--orange);">{{leadsPautaCRM}}</span><span style="font-family:var(--neue);font-weight:500;font-size:var(--t-body);">Leads por pauta en CRM</span><span style="font-family:var(--neue);font-size:24px;color:rgba(20,20,20,.5);">ingresados en el período</span></div>
    <div style="background:var(--ink);color:var(--white);border-radius:16px;padding:34px 38px;display:flex;flex-direction:column;gap:8px;position:relative;overflow:hidden;"><div style="position:absolute;top:0;left:0;width:100%;height:5px;background:var(--grad);"></div><span style="font-family:var(--mono);font-weight:800;font-size:64px;line-height:.95;color:var(--peach);">{{diferenciaPlataforma}}</span><span style="font-family:var(--neue);font-weight:500;font-size:var(--t-body);">Diferencia vs plataforma</span><span style="font-family:var(--neue);font-size:24px;color:rgba(255,255,255,.55);">coherencia pauta / CRM</span></div>
  </div>
  <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:22px;">
    <div style="background:var(--paper);border-radius:16px;padding:30px 34px;display:flex;flex-direction:column;gap:12px;"><span style="font-family:var(--neue);font-weight:500;font-size:var(--t-small);text-transform:uppercase;letter-spacing:.08em;color:var(--fucsia);">Cuello de botella (si aplica)</span><span style="font-family:var(--neue);font-weight:400;font-size:25px;line-height:1.4;">{{cuelloBotella}}</span></div>
    <div style="background:var(--paper);border-radius:16px;padding:30px 34px;display:flex;flex-direction:column;gap:12px;"><span style="font-family:var(--neue);font-weight:500;font-size:var(--t-small);text-transform:uppercase;letter-spacing:.08em;color:var(--orange);">Oportunidades detectadas</span><span style="font-family:var(--neue);font-weight:400;font-size:25px;line-height:1.4;">{{oportunidades}}</span></div>
  </div>
  <div class="footer"><div class="footer-left"><img src="{{LOGO_BASE64}}" alt="MDK"><span>MDK · Informe de Resultados — Plan Esencial</span></div><span class="footer-right">madketing.io</span></div>
</section>

<!-- ============ 05 QUÉ FUNCIONÓ / QUÉ NO ============ -->
<section class="page" style="background:var(--paper);color:var(--ink);">
  <div class="eyebrow-row"><div class="eyebrow"><span class="dot"></span><span class="label">05 · Qué funcionó / qué no</span></div><span class="page-num">05</span></div>
  <h2 class="section-title">Aprendizajes del mes</h2>
  <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:26px;">
    <div style="background:var(--white);border-radius:18px;padding:40px 42px;display:flex;flex-direction:column;gap:24px;border-top:6px solid var(--orange);">
      <span style="font-family:var(--mono);font-weight:800;font-size:26px;text-transform:uppercase;color:var(--orange);">Lo que funcionó</span>
      <div style="display:flex;flex-direction:column;gap:20px;">
        <!--REPEAT:funciono-->
        <div style="display:flex;gap:14px;"><span style="color:var(--orange);font-size:25px;">•</span><span style="font-family:var(--neue);font-size:25px;line-height:1.4;">{{item}}</span></div>
        <!--END:funciono-->
      </div>
    </div>
    <div style="background:var(--ink);color:var(--white);border-radius:18px;padding:40px 42px;display:flex;flex-direction:column;gap:24px;position:relative;overflow:hidden;border-top:6px solid var(--fucsia);">
      <span style="font-family:var(--mono);font-weight:800;font-size:26px;text-transform:uppercase;color:var(--fucsia);">Lo que no funcionó</span>
      <div style="display:flex;flex-direction:column;gap:20px;">
        <!--REPEAT:noFunciono-->
        <div style="display:flex;gap:14px;"><span style="color:var(--fucsia);font-size:25px;">•</span><span style="font-family:var(--neue);font-size:25px;line-height:1.4;color:var(--peach);">{{item}}</span></div>
        <!--END:noFunciono-->
      </div>
    </div>
  </div>
  <div class="footer"><div class="footer-left"><img src="{{LOGO_BASE64}}" alt="MDK"><span>MDK · Informe de Resultados — Plan Esencial</span></div><span class="footer-right">madketing.io</span></div>
</section>

<!-- ============ 06 PLAN DEL MES SIGUIENTE ============ -->
<section class="page" style="background:var(--ink);color:var(--white);">
  <div style="position:absolute;top:-22%;right:-12%;width:44%;height:120%;background:var(--grad);filter:blur(140px);opacity:.34;border-radius:50%;"></div>
  <div class="eyebrow-row" style="position:relative;"><div class="eyebrow"><span class="dot"></span><span class="label" style="color:var(--peach);">06 · Plan del mes siguiente</span></div><span class="page-num dark">06</span></div>
  <h2 class="section-title" style="position:relative;">Plan del mes siguiente</h2>
  <div style="position:relative;flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:28px;align-content:center;">
    <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:38px 34px;min-width:0;display:flex;flex-direction:column;gap:18px;"><span style="font-family:var(--mono);font-weight:800;font-size:44px;color:var(--orange);">01</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;">Qué se va a ajustar</span><span style="font-family:var(--neue);font-weight:400;font-size:25px;line-height:1.4;color:var(--peach);">{{ajusteMesSiguiente}}</span></div>
    <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:38px 34px;min-width:0;display:flex;flex-direction:column;gap:18px;"><span style="font-family:var(--mono);font-weight:800;font-size:44px;color:var(--orange);">02</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;">Qué se va a testear</span><span style="font-family:var(--neue);font-weight:400;font-size:25px;line-height:1.4;color:var(--peach);">{{testearMesSiguiente}}</span></div>
    <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:38px 34px;min-width:0;display:flex;flex-direction:column;gap:18px;position:relative;overflow:hidden;"><div style="position:absolute;top:0;left:0;width:100%;height:5px;background:var(--grad);"></div><span style="font-family:var(--mono);font-weight:800;font-size:44px;color:var(--fucsia);">03</span><span style="font-family:var(--mono);font-weight:800;font-size:24px;text-transform:uppercase;">Requerimientos al cliente</span><span style="font-family:var(--neue);font-weight:400;font-size:25px;line-height:1.4;color:var(--peach);">{{requerimientosCliente}}</span></div>
  </div>
  <div class="footer dark" style="position:relative;"><div class="footer-left"><img src="{{LOGO_BASE64}}" alt="MDK"><span>MDK · Informe de Resultados — Plan Esencial</span></div><span class="footer-right">madketing.io</span></div>
</section>

</body>
</html>
`