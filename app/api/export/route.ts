import { NextResponse } from "next/server";
import puppeteer, { type Browser, type LaunchOptions } from "puppeteer-core";
import { readProject, uploadExport } from "@/lib/poster/storage";
import { exportViewport, pageDimensionsIn } from "@/lib/poster/dimensions";

export const runtime = "nodejs";
export const maxDuration = 300;

interface ExportBody {
  projectId: string;
}

const LOCAL_CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean) as string[];

async function launchOptions(): Promise<LaunchOptions> {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return {
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    };
  }
  const fs = await import("node:fs");
  const found = LOCAL_CHROME_CANDIDATES.find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
  if (!found) {
    throw new Error(
      "No local Chrome/Chromium found. Set PUPPETEER_EXECUTABLE_PATH to your Chrome binary path.",
    );
  }
  return { headless: true, executablePath: found };
}

export async function POST(req: Request) {
  const body = (await req.json()) as ExportBody;
  if (!body.projectId) {
    return NextResponse.json({ error: "missing_projectId" }, { status: 400 });
  }
  const project = await readProject(body.projectId);
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const previewUrl = new URL(
    `/p/${body.projectId}/preview?print=1`,
    process.env.NEXT_PUBLIC_APP_ORIGIN || req.url,
  ).toString();

  const viewport = exportViewport(project.canvas);
  const page = pageDimensionsIn(project.canvas);

  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch(await launchOptions());
    const tab = await browser.newPage();
    await tab.setViewport({
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor,
    });

    // This deployment fetches its own preview page, so Vercel's deployment
    // protection applies to the headless browser too — it is not logged in.
    // With Protection Bypass for Automation enabled, this header gets us
    // through; without it, the browser lands on the SSO login page and we would
    // otherwise silently render THAT into the PDF.
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypass) {
      await tab.setExtraHTTPHeaders({
        "x-vercel-protection-bypass": bypass,
        "x-vercel-set-bypass-cookie": "true",
      });
    }

    await tab.goto(previewUrl, { waitUntil: "networkidle0", timeout: 120_000 });

    // Confirm we actually rendered a poster rather than an auth wall or an error
    // page. Cheap check, and it turns a corrupt-looking PDF into a clear cause.
    const rendered = await tab.$("[data-poster-id]");
    if (!rendered) {
      throw new Error(
        bypass
          ? `Preview page did not render a poster at ${previewUrl}. The bypass secret may be stale.`
          : "Puppeteer could not reach the preview page — it was blocked by Vercel deployment protection. " +
            "Enable Protection Bypass for Automation in the project settings (this route already sends the header " +
            "when VERCEL_AUTOMATION_BYPASS_SECRET is present), or turn off Vercel Authentication for this project.",
      );
    }
    const pdfBuffer = await tab.pdf({
      width: `${page.widthIn}in`,
      height: `${page.heightIn}in`,
      printBackground: true,
      preferCSSPageSize: false,
      pageRanges: "1",
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    const { url } = await uploadExport(body.projectId, new Uint8Array(pdfBuffer));
    return NextResponse.json({ url });
  } catch (err) {
    console.error("export failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
