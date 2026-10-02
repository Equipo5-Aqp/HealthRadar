#!/usr/bin/env python3
"""
HealthRadar - Consolidación de Reportes de Pruebas QA
Lee archivos JUnit XML generados por pytest y Newman, y produce:
1. Reporte HTML autocontenido y estilizado.
2. Reporte PDF consolidado (vía wkhtmltopdf / weasyprint / headless chrome).
3. Resumen Markdown para comentar automáticamente en el Pull Request.
"""

import os
import sys
import glob
import re
import argparse
import subprocess
import html
from datetime import datetime, timezone
import xml.etree.ElementTree as ET

# Asegurar codificación UTF-8 para stdout/stderr en cualquier terminal (Windows/Linux)
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# ==============================================================================
# REGLAS DE ENMASCARAMIENTO Y SANITIZACIÓN DEVSECOPS
# Evitan fugas de secretos (N8N_NLQ_WEBHOOK_URL), IPs de infraestructura (VM Azure)
# y outputs extensos de LLMs con datos epidemiológicos.
# ==============================================================================
IP_PATTERN = re.compile(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b')
WEBHOOK_PATTERN = re.compile(r'https?://\S*(n8n|webhook)\S*', re.IGNORECASE)


def sanitize_devsecops(text: str, max_length: int = 500) -> str:
    """Sanitiza y enmascara texto para prevenir fugas de secretos y datos en reportes."""
    if not text:
        return ""
    text_str = str(text)

    # 1. Enmascarar URLs de webhook (n8n, webhook genérico)
    text_str = WEBHOOK_PATTERN.sub('[WEBHOOK-REDACTED]', text_str)

    # 2. Enmascarar direcciones IP
    text_str = IP_PATTERN.sub('[IP-REDACTED]', text_str)

    # 3. Truncar a max_length (por defecto 500 caracteres)
    if len(text_str) > max_length:
        text_str = text_str[:max_length] + "... [TRUNCADO]"

    return text_str



def parse_arguments():
    parser = argparse.ArgumentParser(description="Consolidador de Reportes QA HealthRadar")
    parser.add_argument("--xml-dir", default=os.environ.get("XML_DIR", "."), help="Directorio con archivos XML")
    parser.add_argument("--output-html", default=os.environ.get("OUTPUT_HTML", "reporte-qa.html"), help="Ruta del HTML generado")
    parser.add_argument("--output-pdf", default=os.environ.get("OUTPUT_PDF", "reporte-qa.pdf"), help="Ruta del PDF generado")
    parser.add_argument("--output-summary-md", default=os.environ.get("OUTPUT_SUMMARY_MD", "resumen-pr.md"), help="Ruta del resumen Markdown")
    parser.add_argument("--pr-number", default=os.environ.get("PR_NUMBER", ""), help="Número del Pull Request")
    parser.add_argument("--pr-title", default=os.environ.get("PR_TITLE", "Validación de Pull Request"), help="Título del PR")
    parser.add_argument("--commit-sha", default=os.environ.get("COMMIT_SHA", os.environ.get("GITHUB_SHA", "HEAD")), help="SHA del commit")
    parser.add_argument("--run-url", default=os.environ.get("RUN_URL", ""), help="URL de la ejecución de Actions")
    return parser.parse_args()


def friendly_suite_name(filename, raw_name=""):
    base = os.path.basename(filename).lower()
    if "checks" in base or "cicd" in base or "mlops" in base:
        return "GitHub Check Runs (Consolidado CI/CD)"
    if "ai-testing" in base:
        return "AI Testing (Prompts, NLQ, Failover y LLM)"
    if "data-testing" in base:
        return "Data Testing (Datos Epidemiológicos HU-07)"
    if "postman" in base or "newman" in base:
        return "QA Postman (Colección Newman API)"
    if raw_name and raw_name != "pytest":
        return raw_name
    clean = os.path.splitext(os.path.basename(filename))[0].replace("resultados-", "").replace("-", " ").title()
    return f"Suite {clean}"


def parse_junit_xml(file_path):
    suites = []
    try:
        tree = ET.parse(file_path)
        root = tree.getroot()
    except Exception as e:
        print(f"⚠️ Error al parsear {file_path}: {e}", file=sys.stderr)
        return suites

    is_root_synthetic = (root.get("synthetic") == "true")

    # En JUnit XML, root puede ser <testsuites> o directamente <testsuite>
    testsuite_nodes = []
    if root.tag == "testsuite":
        testsuite_nodes.append(root)
    elif root.tag == "testsuites":
        testsuite_nodes.extend(root.findall("testsuite"))
        # Si testsuites no tiene hijos testsuite pero sí testcase directamente
        if not testsuite_nodes and root.findall("testcase"):
            testsuite_nodes.append(root)
    else:
        # Buscar cualquier nodo testsuite en el árbol
        testsuite_nodes = root.findall(".//testsuite")
        if not testsuite_nodes:
            testcase_nodes = root.findall(".//testcase")
            if testcase_nodes:
                testsuite_nodes.append(root)

    for node in testsuite_nodes:
        raw_name = node.get("name", "")
        suite_title = friendly_suite_name(file_path, raw_name)
        is_synthetic = is_root_synthetic or (node.get("synthetic") == "true")

        suite_data = {
            "file": os.path.basename(file_path),
            "name": suite_title,
            "raw_name": raw_name,
            "synthetic": is_synthetic,
            "time": float(node.get("time", 0.0) or 0.0),
            "tests": 0,
            "passed": 0,
            "failed": 0,
            "errors": 0,
            "skipped": 0,
            "cases": []
        }

        testcases = node.findall("testcase")
        for tc in testcases:
            tc_name = tc.get("name", "Test sin nombre")
            tc_class = tc.get("classname", "")
            try:
                tc_time = float(tc.get("time", 0.0) or 0.0)
            except ValueError:
                tc_time = 0.0

            status = "PASSED"
            message = ""
            details = ""

            failure = tc.find("failure")
            error = tc.find("error")
            skipped = tc.find("skipped")

            if failure is not None:
                status = "FAILED"
                message = failure.get("message", "") or failure.get("type", "Fallo")
                details = failure.text or ""
            elif error is not None:
                status = "ERROR"
                message = error.get("message", "") or error.get("type", "Error")
                details = error.text or ""
            elif skipped is not None:
                status = "SKIPPED"
                message = skipped.get("message", "") or "Omitido"
                details = skipped.text or ""

            # Conteo de estado
            suite_data["tests"] += 1
            if status == "PASSED":
                suite_data["passed"] += 1
            elif status == "FAILED":
                suite_data["failed"] += 1
            elif status == "ERROR":
                suite_data["errors"] += 1
            elif status == "SKIPPED":
                suite_data["skipped"] += 1

            # Sanitización DevSecOps: enmascarar URLs/IPs y truncar a máx 500 chars
            clean_name = sanitize_devsecops(tc_name, max_length=200)
            clean_class = sanitize_devsecops(tc_class, max_length=200)
            clean_message = sanitize_devsecops(message.strip(), max_length=300)
            clean_details = sanitize_devsecops(details.strip(), max_length=500)

            suite_data["cases"].append({
                "name": clean_name,
                "classname": clean_class,
                "time": tc_time,
                "status": status,
                "message": clean_message,
                "details": clean_details
            })

        suites.append(suite_data)

    return suites


def collect_all_results(xml_dir):
    xml_files = []
    if os.path.isdir(xml_dir):
        xml_files.extend(glob.glob(os.path.join(xml_dir, "**", "*.xml"), recursive=True))
        xml_files.extend(glob.glob(os.path.join(xml_dir, "*.xml")))
    elif os.path.isfile(xml_dir) and xml_dir.endswith(".xml"):
        xml_files.append(xml_dir)

    # Eliminar duplicados normalizando rutas
    xml_files = sorted(list({os.path.abspath(f) for f in xml_files}))
    
    all_suites = []
    for f in xml_files:
        parsed = parse_junit_xml(f)
        all_suites.extend(parsed)

    return xml_files, all_suites


def generate_html_report(suites, args):
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    short_sha = args.commit_sha[:7] if args.commit_sha else "N/A"
    pr_label = f"PR #{args.pr_number}" if args.pr_number else "Local / Push"

    total_tests = sum(s["tests"] for s in suites)
    total_passed = sum(s["passed"] for s in suites)
    total_failed = sum(s["failed"] for s in suites)
    total_errors = sum(s["errors"] for s in suites)
    total_skipped = sum(s["skipped"] for s in suites)
    total_time = sum(s["time"] for s in suites)

    pass_rate = round((total_passed / total_tests * 100), 1) if total_tests > 0 else 0.0
    if total_tests == 0:
        overall_status = "SIN PRUEBAS"
        status_color = "#6b7280"
    elif total_failed > 0 or total_errors > 0:
        overall_status = "CON FALLOS"
        status_color = "#ef4444"
    elif total_skipped == total_tests:
        overall_status = "OMITIDO"
        status_color = "#64748b"
    else:
        overall_status = "EXITOSO"
        status_color = "#10b981"

    html_content = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>HealthRadar - Reporte Consolidado de Pruebas QA</title>
  <style>
    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }}
    body {{
      background-color: #f8fafc;
      color: #1e293b;
      padding: 24px;
      font-size: 14px;
      line-height: 1.5;
    }}
    .container {{
      max-width: 1000px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
      overflow: hidden;
      border: 1px solid #e2e8f0;
    }}
    header {{
      background: linear-gradient(135deg, #0f766e 0%, #0369a1 100%);
      color: #ffffff;
      padding: 24px 32px;
    }}
    .header-top {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }}
    .brand {{
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.5px;
      display: flex;
      align-items: center;
      gap: 10px;
    }}
    .brand-tag {{
      background: rgba(255, 255, 255, 0.2);
      font-size: 11px;
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: 9999px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }}
    .status-badge-overall {{
      background: {status_color};
      color: #ffffff;
      padding: 6px 14px;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 13px;
      text-transform: uppercase;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
    }}
    .subtitle {{
      font-size: 14px;
      color: #e0f2fe;
    }}
    .meta-bar {{
      background: #f1f5f9;
      padding: 12px 32px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      font-size: 13px;
      color: #475569;
    }}
    .meta-item strong {{
      color: #0f172a;
    }}
    .content {{
      padding: 28px 32px;
    }}
    .cards-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 14px;
      margin-bottom: 28px;
    }}
    .stat-card {{
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 14px;
      text-align: center;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }}
    .stat-value {{
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 4px;
    }}
    .stat-label {{
      font-size: 12px;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
    }}
    .stat-card.passed .stat-value {{ color: #10b981; }}
    .stat-card.failed .stat-value {{ color: #ef4444; }}
    .stat-card.errors .stat-value {{ color: #f97316; }}
    .stat-card.skipped .stat-value {{ color: #64748b; }}
    .stat-card.rate .stat-value {{ color: #0369a1; }}
    .stat-card.total .stat-value {{ color: #0f172a; }}

    .section-title {{
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      font-size: 13px;
    }}
    th {{
      background: #f8fafc;
      color: #475569;
      font-weight: 600;
      text-align: left;
      padding: 10px 12px;
      border-bottom: 2px solid #e2e8f0;
    }}
    td {{
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }}
    tr:last-child td {{
      border-bottom: none;
    }}
    .badge {{
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }}
    .badge-passed {{ background: #d1fae5; color: #065f46; }}
    .badge-failed {{ background: #fee2e2; color: #991b1b; }}
    .badge-error {{ background: #ffedd5; color: #9a3412; }}
    .badge-skipped {{ background: #f1f5f9; color: #475569; }}

    .suite-box {{
      margin-bottom: 24px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }}
    .suite-header {{
      background: #f8fafc;
      padding: 12px 16px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }}
    .suite-name {{
      font-weight: 700;
      color: #0f172a;
      font-size: 14px;
    }}
    .suite-stats {{
      font-size: 12px;
      color: #64748b;
    }}
    .error-box {{
      background: #1e1e1e;
      color: #f87171;
      padding: 10px;
      border-radius: 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      overflow-x: auto;
      margin-top: 6px;
      white-space: pre-wrap;
      word-break: break-all;
    }}
    .error-message {{
      color: #ef4444;
      font-weight: 600;
      font-size: 12px;
      margin-top: 4px;
    }}
    footer {{
      background: #f8fafc;
      padding: 16px 32px;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #64748b;
      text-align: center;
    }}
    @media print {{
      body {{ background: #ffffff; padding: 0; }}
      .container {{ border: none; box-shadow: none; max-width: 100%; }}
      .suite-box {{ page-break-inside: avoid; }}
      tr {{ page-break-inside: avoid; }}
    }}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-top">
        <div class="brand">
          <span>HealthRadar QA</span>
          <span class="brand-tag">Reporte Consolidado</span>
        </div>
        <div class="status-badge-overall">{overall_status}</div>
      </div>
      <div class="subtitle">{html.escape(args.pr_title)} ({pr_label})</div>
    </header>

    <div class="meta-bar">
      <div class="meta-item"><strong>Pull Request:</strong> {pr_label}</div>
      <div class="meta-item"><strong>Commit:</strong> <code>{short_sha}</code></div>
      <div class="meta-item"><strong>Fecha de Ejecución:</strong> {now_str}</div>
      <div class="meta-item"><strong>Duración Total:</strong> {total_time:.2f}s</div>
    </div>

    <div class="content">
      <div class="cards-grid">
        <div class="stat-card total">
          <div class="stat-value">{total_tests}</div>
          <div class="stat-label">Pruebas Totales</div>
        </div>
        <div class="stat-card passed">
          <div class="stat-value">{total_passed}</div>
          <div class="stat-label">Exitosas</div>
        </div>
        <div class="stat-card failed">
          <div class="stat-value">{total_failed}</div>
          <div class="stat-label">Fallidas</div>
        </div>
        <div class="stat-card errors">
          <div class="stat-value">{total_errors}</div>
          <div class="stat-label">Errores</div>
        </div>
        <div class="stat-card skipped">
          <div class="stat-value">{total_skipped}</div>
          <div class="stat-label">Omitidas</div>
        </div>
        <div class="stat-card rate">
          <div class="stat-value">{pass_rate}%</div>
          <div class="stat-label">Tasa de Éxito</div>
        </div>
      </div>

      <div class="section-title">📋 Resumen por Suite de Pruebas</div>
      <table>
        <thead>
          <tr>
            <th>Suite / Archivo</th>
            <th style="text-align: center;">Total</th>
            <th style="text-align: center;">Pasadas</th>
            <th style="text-align: center;">Fallidas</th>
            <th style="text-align: center;">Errores</th>
            <th style="text-align: center;">Omitidas</th>
            <th style="text-align: right;">Tiempo</th>
            <th style="text-align: center;">Estado</th>
          </tr>
        </thead>
        <tbody>
"""

    if not suites:
        html_content += """
          <tr>
            <td colspan="8" style="text-align: center; color: #64748b; padding: 20px;">
              ℹ️ No se encontraron resultados de pruebas XML en esta ejecución (posiblemente omitidas por filtros de rutas).
            </td>
          </tr>
"""
    else:
        for s in suites:
            st = "PASSED" if (s["failed"] == 0 and s["errors"] == 0) else "FAILED"
            badge_cls = "badge-passed" if st == "PASSED" else "badge-failed"
            html_content += f"""
          <tr>
            <td>
              <strong>{html.escape(s['name'])}</strong><br>
              <small style="color: #64748b;">{html.escape(s['file'])}</small>
            </td>
            <td style="text-align: center;">{s['tests']}</td>
            <td style="text-align: center; color: #10b981; font-weight: 600;">{s['passed']}</td>
            <td style="text-align: center; color: {'#ef4444' if s['failed'] > 0 else '#64748b'}; font-weight: 600;">{s['failed']}</td>
            <td style="text-align: center; color: {'#f97316' if s['errors'] > 0 else '#64748b'}; font-weight: 600;">{s['errors']}</td>
            <td style="text-align: center; color: #64748b;">{s['skipped']}</td>
            <td style="text-align: right;">{s['time']:.2f}s</td>
            <td style="text-align: center;"><span class="badge {badge_cls}">{st}</span></td>
          </tr>
"""

    html_content += """
        </tbody>
      </table>

      <div class="section-title">🔍 Detalle de Pruebas Individuales</div>
"""

    if not suites:
        html_content += """
      <p style="color: #64748b; margin-bottom: 20px;">No hay casos individuales para mostrar.</p>
"""
    else:
        for s in suites:
            html_content += f"""
      <div class="suite-box">
        <div class="suite-header">
          <div class="suite-name">{html.escape(s['name'])}</div>
          <div class="suite-stats">{s['passed']}/{s['tests']} pasaron ({s['time']:.2f}s)</div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 100px;">Estado</th>
              <th>Prueba / Clase</th>
              <th style="width: 80px; text-align: right;">Tiempo</th>
            </tr>
          </thead>
          <tbody>
"""
            for tc in s["cases"]:
                b_cls = {
                    "PASSED": "badge-passed",
                    "FAILED": "badge-failed",
                    "ERROR": "badge-error",
                    "SKIPPED": "badge-skipped"
                }.get(tc["status"], "badge-skipped")

                err_html = ""
                if tc["message"]:
                    err_html += f'<div class="error-message">⚠️ {html.escape(tc["message"])}</div>'
                if tc["details"]:
                    err_html += f'<pre class="error-box">{html.escape(tc["details"])}</pre>'

                class_info = f'<small style="color: #64748b;"><br>{html.escape(tc["classname"])}</small>' if tc["classname"] else ""

                html_content += f"""
            <tr>
              <td><span class="badge {b_cls}">{tc['status']}</span></td>
              <td>
                <strong>{html.escape(tc['name'])}</strong>{class_info}
                {err_html}
              </td>
              <td style="text-align: right;">{tc['time']:.3f}s</td>
            </tr>
"""
            html_content += """
          </tbody>
        </table>
      </div>
"""

    html_content += f"""
    </div>
    <footer>
      Generado automáticamente por el Pipeline de CI/CD de HealthRadar &bull; Celula 5 (USMP Arequipa) &bull; {now_str}
    </footer>
  </div>
</body>
</html>
"""
    return html_content


def generate_markdown_summary(suites, args):
    pr_label = f"#{args.pr_number}" if args.pr_number else "N/A"
    short_sha = args.commit_sha[:7] if args.commit_sha else "HEAD"
    
    total_tests = sum(s["tests"] for s in suites)
    total_passed = sum(s["passed"] for s in suites)
    total_failed = sum(s["failed"] for s in suites)
    total_errors = sum(s["errors"] for s in suites)
    total_skipped = sum(s["skipped"] for s in suites)

    if total_tests == 0:
        emoji_status = "⚠️ SIN PRUEBAS"
        overall_symbol = "⚠️"
    elif total_failed > 0 or total_errors > 0:
        emoji_status = "❌ CON FALLOS"
        overall_symbol = "❌"
    elif total_skipped == total_tests:
        emoji_status = "⏭️ OMITIDO"
        overall_symbol = "⏭️"
    else:
        emoji_status = "✅ PASÓ"
        overall_symbol = "✅"

    md = []
    md.append("<!-- healthradar-qa-report -->")
    md.append(f"### 📊 Reporte Consolidado de Pruebas CI/CD — HealthRadar ({emoji_status})")
    md.append(f"**PR:** {pr_label} | **Commit:** `{short_sha}` | **Título:** {args.pr_title}\n")

    if not suites:
        md.append("> ℹ️ **No se ejecutaron suites de prueba en este PR.** Los cambios realizados están fuera de las rutas de QA monitoreadas o las suites fueron omitidas condicionalmente.\n")
    else:
        md.append("| Suite / Check Run | Total | Pasadas | Fallidas | Omitidas | Estado |")
        md.append("| :--- | :---: | :---: | :---: | :---: | :---: |")

        for s in suites:
            if s["failed"] > 0 or s["errors"] > 0:
                st = "❌ Falló"
            elif s["skipped"] == s["tests"] and s["tests"] > 0:
                st = "⏭️ Omitido"
            else:
                st = "✅ Pasó"
            md.append(f"| **{s['name']}** | {s['tests']} | {s['passed']} | {s['failed'] + s['errors']} | {s['skipped']} | {st} |")

        md.append(f"| **TOTAL CONSOLIDADO** | **{total_tests}** | **{total_passed}** | **{total_failed + total_errors}** | **{total_skipped}** | **{overall_symbol}** |\n")

        if total_failed > 0 or total_errors > 0:
            md.append("<details><summary><strong>❌ Ver detalle de fallos</strong></summary>\n")
            for s in suites:
                failed_cases = [c for c in s["cases"] if c["status"] in ("FAILED", "ERROR")]
                if failed_cases:
                    md.append(f"\n**{s['name']}:**")
                    for fc in failed_cases:
                        msg = f" — `{fc['message']}`" if fc['message'] else ""
                        md.append(f"- 🔴 `{fc['name']}`{msg}")
            md.append("\n</details>\n")

    pdf_artifact_name = f"reporte-mlops-pr-{args.pr_number}.pdf" if args.pr_number else "reporte-mlops.pdf"
    if args.run_url:
        md.append(f"📄 **Reporte Completo en PDF:** El archivo `{pdf_artifact_name}` está disponible para descarga en los artefactos de la ejecución: [Ver artefactos en GitHub Actions]({args.run_url}).")
    else:
        md.append(f"📄 **Reporte Completo en PDF:** El archivo `{pdf_artifact_name}` ha sido subido como artefacto en la pestaña **Actions** de este PR.")

    has_synthetic = any(s.get("synthetic") for s in suites)
    if has_synthetic:
        md.append("\n*Reporte consolidado a nivel check-run (synthetic=\"true\") generado automáticamente por el job `consolidar-reporte`.*")
    else:
        md.append("\n*Reporte informativo generado automáticamente por el job `consolidar-reporte`.*")
    return "\n".join(md)


def convert_html_to_pdf(html_file, pdf_file):
    print(f"🔄 Convirtiendo {html_file} a PDF ({pdf_file})...")

    # Intento 1: wkhtmltopdf (instalado con apt-get o presente en el PATH)
    try:
        cmd = [
            "wkhtmltopdf",
            "--enable-local-file-access",
            "--page-size", "A4",
            "--orientation", "Portrait",
            "--margin-top", "12mm",
            "--margin-bottom", "12mm",
            "--margin-left", "12mm",
            "--margin-right", "12mm",
            "--quiet",
            html_file,
            pdf_file
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0 and os.path.exists(pdf_file) and os.path.getsize(pdf_file) > 0:
            print(f"✅ PDF generado exitosamente con wkhtmltopdf: {pdf_file} ({os.path.getsize(pdf_file)} bytes)")
            return True
        else:
            print(f"⚠️ wkhtmltopdf falló o retornó código {result.returncode}: {result.stderr}")
    except FileNotFoundError:
        print("ℹ️ wkhtmltopdf no está en el PATH, probando alternativas...")
    except Exception as e:
        print(f"⚠️ Excepción con wkhtmltopdf: {e}")

    # Intento 2: weasyprint (si está instalado en Python)
    try:
        from weasyprint import HTML
        HTML(filename=html_file).write_pdf(pdf_file)
        if os.path.exists(pdf_file) and os.path.getsize(pdf_file) > 0:
            print(f"✅ PDF generado exitosamente con weasyprint: {pdf_file} ({os.path.getsize(pdf_file)} bytes)")
            return True
    except ImportError:
        print("ℹ️ weasyprint no está instalado en el entorno Python.")
    except Exception as e:
        print(f"⚠️ Excepción con weasyprint: {e}")

    # Intento 3: Headless Chrome / Chromium (disponible en runners ubuntu-latest)
    chrome_bins = ["google-chrome", "google-chrome-stable", "chromium-browser", "chromium"]
    for bin_name in chrome_bins:
        try:
            cmd = [
                bin_name,
                "--headless",
                "--disable-gpu",
                "--no-sandbox",
                f"--print-to-pdf={pdf_file}",
                html_file
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0 and os.path.exists(pdf_file) and os.path.getsize(pdf_file) > 0:
                print(f"✅ PDF generado exitosamente con {bin_name}: {pdf_file}")
                return True
        except FileNotFoundError:
            continue
        except Exception as e:
            print(f"⚠️ Excepción con {bin_name}: {e}")

    print("⚠️ No se pudo generar el PDF con ninguno de los métodos disponibles.")
    return False


def main():
    args = parse_arguments()
    args.pr_title = sanitize_devsecops(args.pr_title, max_length=150)
    print("=" * 60)
    print("HealthRadar - Consolidación de Resultados de Pruebas QA")
    print("=" * 60)
    print(f"Directorio de XML: {args.xml_dir}")
    print(f"PR: #{args.pr_number} | Commit: {args.commit_sha}")

    xml_files, suites = collect_all_results(args.xml_dir)
    print(f"Archivos XML encontrados: {len(xml_files)}")
    for xf in xml_files:
        print(f"  - {xf}")
    print(f"Suites procesadas: {len(suites)}")

    # 1. Generar HTML
    html_content = generate_html_report(suites, args)
    with open(args.output_html, "w", encoding="utf-8") as f:
        f.write(html_content)
    print(f"✅ Reporte HTML generado: {args.output_html}")

    # 2. Generar PDF
    pdf_ok = convert_html_to_pdf(args.output_html, args.output_pdf)
    if not pdf_ok:
        # En caso de no poder convertir a PDF, copiar HTML como fallback con advertencia
        print(f"ℹ️ Creando archivo de respaldo si PDF no se generó...")

    # 3. Generar Resumen Markdown
    summary_md = generate_markdown_summary(suites, args)
    with open(args.output_summary_md, "w", encoding="utf-8") as f:
        f.write(summary_md)
    print(f"✅ Resumen Markdown generado: {args.output_summary_md}")

    print("=" * 60)
    print("Consolidación finalizada con éxito.")
    print("=" * 60)


if __name__ == "__main__":
    main()
