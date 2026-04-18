import { getWorkareaTokenFromPath } from "./shared";
import type { SearchTarget, SyncChiefComplaintPayload, SyncChiefComplaintResponse } from "./types";

type ChiefOfficeVisitHelpers = {
  isElementNode: (value: unknown) => value is HTMLElement;
  describeNode: (node: Element) => string;
  logDebug: (stage: string, details?: unknown) => void;
};

type TryChiefOfficeVisitArgs = {
  targets: SearchTarget[];
  payload: SyncChiefComplaintPayload;
  helpers: ChiefOfficeVisitHelpers;
};

export async function tryMdlandOfficeVisitChiefSync({
  targets,
  payload,
  helpers,
}: TryChiefOfficeVisitArgs): Promise<SyncChiefComplaintResponse | null> {
  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const replaceTinyMceChildren = (el: HTMLElement | null, html: string): boolean => {
    if (!el) return false;
    const parsed = new DOMParser().parseFromString(html || "", "text/html");
    el.replaceChildren(...parsed.body.childNodes);
    return true;
  };

  const plainTextToOfficeVisitHtml = (text: string): string => {
    const normalized = text.replace(/\r\n/g, "\n").trim();
    const inner = normalized
      .split("\n")
      .map((line) => line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
      .join("<br>");
    return `<div>${inner}</div>`;
  };

  const doctorSpecs = targets
    .filter((t) => /\/eClinic\/ov_doctor_spec\.aspx/i.test(t.sourceUrl))
    .sort((a, b) => {
      const wa = getWorkareaTokenFromPath(a.path);
      const wb = getWorkareaTokenFromPath(b.path);
      if (wa === "workarea1" && wb !== "workarea1") return -1;
      if (wb === "workarea1" && wa !== "workarea1") return 1;
      return 0;
    });

  helpers.logDebug("mdland-officevisit-chief: start", {
    doctorSpecFrames: doctorSpecs.slice(0, 6).map((t) => ({ path: t.path, url: t.sourceUrl })),
    chiefLen: (payload.chiefComplaintText ?? "").length,
    hpiLen: (payload.presentIllnessText ?? "").length,
    autoSave: payload.autoSave === true,
  });

  if (doctorSpecs.length === 0) {
    helpers.logDebug("mdland-officevisit-chief: abort - no ov_doctor_spec in merged targets");
    return null;
  }

  for (const spec of doctorSpecs) {
    const doc = spec.doc;
    const trace: string[] = [];

    try {
      let menuFrame: HTMLElement | null = null;
      for (let s = 0; s < 10; s += 1) {
        menuFrame = doc.getElementById("MenuFrame");
        if (helpers.isElementNode(menuFrame)) break;
        trace.push(`wait MenuFrame attempt=${s + 1}`);
        await sleep(200);
      }
      if (!helpers.isElementNode(menuFrame)) {
        helpers.logDebug("mdland-officevisit-chief: frame skip - MenuFrame missing", {
          path: spec.path,
          trace,
        });
        continue;
      }

      const menuDoc =
        (menuFrame as HTMLIFrameElement).contentDocument ??
        (menuFrame as HTMLIFrameElement).contentWindow?.document ??
        null;
      if (!menuDoc) {
        helpers.logDebug("mdland-officevisit-chief: frame skip - MenuFrame document inaccessible", {
          path: spec.path,
        });
        continue;
      }

      const menuSpan = menuDoc.querySelector("#menu_span_chiefcomplaint");
      if (!helpers.isElementNode(menuSpan)) {
        helpers.logDebug("mdland-officevisit-chief: frame skip - #menu_span_chiefcomplaint missing", {
          path: spec.path,
        });
        continue;
      }

      (menuSpan as HTMLElement).click();
      trace.push("clicked #menu_span_chiefcomplaint");
      helpers.logDebug("mdland-officevisit-chief: menu click", { path: spec.path, trace: [...trace] });
      await sleep(500);

      let chiefOuter: HTMLElement | null = null;
      for (let l = 0; l < 12; l += 1) {
        chiefOuter =
          doc.getElementById("chiefComplaint") ??
          (doc.querySelector(
            'iframe#chiefComplaint, iframe[name="chiefComplaint"], frame#chiefComplaint, frame[name="chiefComplaint"]',
          ) as HTMLElement | null);
        if (helpers.isElementNode(chiefOuter)) break;
        trace.push(`wait chiefComplaint iframe attempt=${l + 1}`);
        await sleep(200);
      }
      if (!helpers.isElementNode(chiefOuter)) {
        helpers.logDebug("mdland-officevisit-chief: frame skip - chiefComplaint iframe missing", {
          path: spec.path,
          trace,
        });
        continue;
      }

      const chiefDoc =
        (chiefOuter as HTMLIFrameElement).contentDocument ??
        (chiefOuter as HTMLIFrameElement).contentWindow?.document ??
        null;
      if (!chiefDoc) {
        helpers.logDebug("mdland-officevisit-chief: frame skip - chiefComplaint document inaccessible", {
          path: spec.path,
        });
        continue;
      }
      trace.push("entered chiefComplaint iframe document");
      await sleep(400);

      const chiefText = (payload.chiefComplaintText ?? "").trim();
      if (chiefText.length > 0) {
        let innerFr: HTMLElement | null = null;
        for (let p = 0; p < 18; p += 1) {
          innerFr = chiefDoc.getElementById("chiefComplaint_ifr");
          if (helpers.isElementNode(innerFr)) break;
          trace.push(`wait chiefComplaint_ifr attempt=${p + 1}`);
          await sleep(200);
        }
        if (!helpers.isElementNode(innerFr)) {
          helpers.logDebug("mdland-officevisit-chief: frame skip - chiefComplaint_ifr missing", {
            path: spec.path,
            trace,
          });
          continue;
        }
        const innerDoc =
          (innerFr as HTMLIFrameElement).contentDocument ??
          (innerFr as HTMLIFrameElement).contentWindow?.document ??
          null;
        if (!innerDoc) {
          helpers.logDebug("mdland-officevisit-chief: frame skip - chiefComplaint_ifr document inaccessible", {
            path: spec.path,
          });
          continue;
        }
        await sleep(300);
        const chiefBold = chiefDoc.getElementById("chiefComplaint_bold");
        if (helpers.isElementNode(chiefBold)) {
          chiefBold.click();
          await sleep(80);
          chiefBold.click();
          trace.push("double-click chiefComplaint_bold");
        }
        const tiny = innerDoc.getElementById("tinymce");
        const html = plainTextToOfficeVisitHtml(chiefText);
        const wrote = replaceTinyMceChildren(tiny, html);
        trace.push(`chief tinymce write ok=${wrote} node=${tiny ? helpers.describeNode(tiny) : "null"}`);
        try {
          const tw = innerDoc.defaultView as Window & {
            tinymce?: { triggerSave?: () => void; editors?: unknown[] };
            tinyMCE?: { triggerSave?: () => void };
          };
          tw?.tinymce?.triggerSave?.();
          tw?.tinyMCE?.triggerSave?.();
        } catch {
          // ignore
        }
      }

      const hpiText = (payload.presentIllnessText ?? "").trim();
      if (hpiText.length > 0) {
        let hpiFr: HTMLElement | null = null;
        for (let m = 0; m < 14; m += 1) {
          hpiFr = chiefDoc.getElementById("presentIllness_ifr");
          if (helpers.isElementNode(hpiFr)) break;
          trace.push(`wait presentIllness_ifr attempt=${m + 1}`);
          await sleep(200);
        }
        if (helpers.isElementNode(hpiFr)) {
          const hpiDoc =
            (hpiFr as HTMLIFrameElement).contentDocument ??
            (hpiFr as HTMLIFrameElement).contentWindow?.document ??
            null;
          if (hpiDoc) {
            await sleep(300);
            const hpiBold = chiefDoc.getElementById("presentIllness_bold");
            if (helpers.isElementNode(hpiBold)) {
              hpiBold.click();
              await sleep(80);
              hpiBold.click();
              trace.push("double-click presentIllness_bold");
            }
            const tinyH = hpiDoc.getElementById("tinymce");
            const htmlH = plainTextToOfficeVisitHtml(hpiText);
            const wroteH = replaceTinyMceChildren(tinyH, htmlH);
            trace.push(`hpi tinymce write ok=${wroteH} node=${tinyH ? helpers.describeNode(tinyH) : "null"}`);
            try {
              const tw = hpiDoc.defaultView as Window & { tinymce?: { triggerSave?: () => void } };
              tw?.tinymce?.triggerSave?.();
            } catch {
              // ignore
            }
          }
        }
      }

      helpers.logDebug("mdland-officevisit-chief: writes complete", {
        path: spec.path,
        url: spec.sourceUrl,
        trace,
      });

      if (payload.autoSave === true) {
        await sleep(500);
        const proc = doc.querySelector("#procbarTDOfficeVisit");
        helpers.logDebug("mdland-officevisit-chief: autoSave - procbarTDOfficeVisit first click", {
          hasProc: !!proc,
          path: spec.path,
        });
        (proc as HTMLElement | undefined)?.click?.();
        await sleep(500);

        const savePage = doc.querySelector("#SavePage");
        let saveVis = "";
        if (helpers.isElementNode(savePage) && doc.defaultView) {
          saveVis = doc.defaultView.getComputedStyle(savePage).visibility;
        }
        helpers.logDebug("mdland-officevisit-chief: autoSave - SavePage visibility", {
          visibility: saveVis,
          path: spec.path,
        });
        if (saveVis !== "hidden") {
          (doc.querySelector("#procbarTDOfficeVisit") as HTMLElement | undefined)?.click?.();
          trace.push("second procbarTDOfficeVisit click (SavePage visible)");
        }
        helpers.logDebug("mdland-officevisit-chief: autoSave sequence done", { path: spec.path, trace });
      }

      return {
        ok: true,
        strategy: "mdland-officevisit:ov_doctor_spec",
        sourceUrl: spec.sourceUrl,
        sourcePath: spec.path,
        note:
          payload.autoSave === true
            ? "mdland officevisit path: write + autoSave(procbar/SavePage guard)"
            : "mdland officevisit path: write only (manual Save)",
        diagnostics: { trace },
      };
    } catch (err) {
      helpers.logDebug("mdland-officevisit-chief: frame error", {
        path: spec.path,
        error: err instanceof Error ? err.message : String(err),
        trace,
      });
    }
  }

  helpers.logDebug("mdland-officevisit-chief: all ov_doctor_spec attempts failed - falling back");
  return null;
}
