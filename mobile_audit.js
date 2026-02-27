/**
 * OPAI - Mobile UX Audit Script
 * ==============================
 * Script de validacion automatizada para ejecutar en la consola del navegador.
 *
 * USO:
 *   1. Abrir DevTools (F12 o Cmd+Option+I)
 *   2. Ir a la pestana Console
 *   3. Copiar y pegar este script completo
 *   4. Presionar Enter
 *
 * El script analiza:
 *   - Viewport meta tag
 *   - Font-size de inputs (riesgo de zoom en iOS si < 16px)
 *   - Elementos con overflow horizontal
 *   - Targets tactiles menores a 44x44px
 *   - Scroll lock (body overflow hidden)
 *   - Elementos con position:fixed fuera del viewport
 */
(function mobileAudit() {
  const issues = [];
  const warnings = [];

  console.log('%c--- OPAI Mobile Audit ---', 'color: #6366f1; font-size: 18px; font-weight: bold');
  console.log('Pagina:', window.location.pathname);
  console.log('Viewport:', window.innerWidth + 'x' + window.innerHeight);
  console.log('');

  // 1. Viewport meta tag
  var viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport) {
    issues.push('CRITICAL: No viewport meta tag encontrado');
  } else {
    var content = viewport.content;
    if (!content.includes('width=device-width')) {
      issues.push('WARNING: viewport meta no tiene width=device-width');
    }
    if (content.includes('maximum-scale=1') || content.includes('user-scalable=no')) {
      warnings.push('INFO: viewport restringe zoom del usuario (puede ser intencional para evitar auto-zoom)');
    }
    console.log('Viewport meta:', content);
  }

  // 2. Font-size de inputs (riesgo de zoom en iOS Safari si < 16px)
  var inputCount = 0;
  var inputIssues = 0;
  document.querySelectorAll('input, select, textarea').forEach(function(el) {
    var style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    inputCount++;
    var fontSize = parseFloat(style.fontSize);
    if (fontSize < 16) {
      inputIssues++;
      var identifier = el.name || el.id || el.placeholder || el.getAttribute('aria-label') || 'sin nombre';
      issues.push(
        'ZOOM RISK: ' + el.tagName.toLowerCase() +
        '[' + identifier + ']' +
        ' font-size: ' + fontSize + 'px (necesita >= 16px)'
      );
    }
  });
  console.log('Inputs analizados: ' + inputCount + ' (' + inputIssues + ' con riesgo de zoom)');

  // 3. Overflow horizontal
  var overflowCount = 0;
  var viewportWidth = window.innerWidth;
  document.querySelectorAll('*').forEach(function(el) {
    if (el.scrollWidth > viewportWidth + 5) {
      var style = getComputedStyle(el);
      // Ignorar elementos con overflow: hidden/scroll/auto (manejan su propio scroll)
      if (
        style.overflowX === 'hidden' ||
        style.overflowX === 'scroll' ||
        style.overflowX === 'auto'
      ) return;
      // Ignorar elementos no visibles
      if (style.display === 'none' || style.visibility === 'hidden') return;
      // Ignorar html y body (manejados por CSS global)
      if (el.tagName === 'HTML' || el.tagName === 'BODY') return;

      overflowCount++;
      var className = el.className && typeof el.className === 'string'
        ? el.className.split(' ').slice(0, 3).join('.')
        : '';
      issues.push(
        'OVERFLOW: <' + el.tagName.toLowerCase() +
        (className ? '.' + className : '') + '>' +
        ' scrollWidth: ' + el.scrollWidth + 'px > viewport: ' + viewportWidth + 'px'
      );
    }
  });
  console.log('Elementos con overflow: ' + overflowCount);

  // 4. Targets tactiles < 44x44px
  var touchCount = 0;
  var touchIssues = 0;
  document.querySelectorAll('button, a, [role="button"], [role="tab"], [role="menuitem"], input[type="checkbox"], input[type="radio"]').forEach(function(el) {
    var rect = el.getBoundingClientRect();
    // Ignorar elementos no visibles o de tamano 0
    if (rect.width === 0 || rect.height === 0) return;
    if (getComputedStyle(el).display === 'none') return;
    touchCount++;
    if (rect.width < 44 || rect.height < 44) {
      touchIssues++;
      var text = el.textContent ? el.textContent.trim().substring(0, 30) : '';
      var ariaLabel = el.getAttribute('aria-label') || '';
      var label = text || ariaLabel || el.tagName.toLowerCase();
      issues.push(
        'TOUCH: <' + el.tagName.toLowerCase() + '>' +
        ' "' + label + '"' +
        ' size: ' + Math.round(rect.width) + 'x' + Math.round(rect.height) + 'px' +
        ' (min recomendado: 44x44px)'
      );
    }
  });
  console.log('Targets tactiles analizados: ' + touchCount + ' (' + touchIssues + ' bajo minimo)');

  // 5. Verificar scroll lock activo
  var bodyStyle = getComputedStyle(document.body);
  if (bodyStyle.overflow === 'hidden' || bodyStyle.position === 'fixed') {
    warnings.push('INFO: body tiene overflow:hidden o position:fixed (scroll lock activo - puede ser un modal abierto)');
  }

  // 6. Verificar elementos fijos fuera del viewport
  document.querySelectorAll('[style*="position: fixed"], [style*="position:fixed"]').forEach(function(el) {
    var rect = el.getBoundingClientRect();
    if (rect.right > viewportWidth + 10 || rect.left < -10) {
      warnings.push('FIXED: Elemento fijo parcialmente fuera del viewport: <' + el.tagName.toLowerCase() + '>');
    }
  });

  // Resultados
  console.log('');
  if (issues.length === 0 && warnings.length === 0) {
    console.log('%c✓ Mobile audit PASSED: 0 issues encontrados', 'color: #22c55e; font-size: 16px; font-weight: bold');
  } else {
    if (issues.length > 0) {
      console.log('%c✗ Mobile audit: ' + issues.length + ' issues encontrados', 'color: #ef4444; font-size: 16px; font-weight: bold');
      console.log('');
      issues.forEach(function(issue) {
        if (issue.startsWith('CRITICAL')) {
          console.log('%c  ✗ ' + issue, 'color: #ef4444');
        } else if (issue.startsWith('ZOOM')) {
          console.log('%c  ⊘ ' + issue, 'color: #f97316');
        } else if (issue.startsWith('OVERFLOW')) {
          console.log('%c  ↔ ' + issue, 'color: #eab308');
        } else if (issue.startsWith('TOUCH')) {
          console.log('%c  ◎ ' + issue, 'color: #8b5cf6');
        } else {
          console.log('  - ' + issue);
        }
      });
    }
    if (warnings.length > 0) {
      console.log('');
      console.log('%cAdvertencias (' + warnings.length + '):', 'color: #6b7280; font-size: 14px');
      warnings.forEach(function(w) {
        console.log('%c  ' + w, 'color: #6b7280');
      });
    }
  }

  console.log('');
  console.log('%c--- Fin del audit ---', 'color: #6366f1; font-size: 14px');

  return { issues: issues, warnings: warnings };
})();
