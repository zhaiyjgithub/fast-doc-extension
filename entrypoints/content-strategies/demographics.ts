import { getWorkareaTokenFromPath, isMdlandEclinicHost } from "./shared";
import type {
  ExtractDemographicsResponse,
  SearchTarget,
} from "./types";

type DemographicsFeatureSignal = {
  key: string;
  pattern: RegExp;
};

type DemographicsSignalEvaluation = {
  score: number;
  matched: string[];
  missing: string[];
  normalizedText: string;
};

type DemographicsSection = {
  text: string;
  selector: string;
};

type ExtractDemographicsArgs = {
  hostname: string;
  targets: SearchTarget[];
  isElementNode: (value: unknown) => value is HTMLElement;
  logDebug: (stage: string, details?: unknown) => void;
};

const DEMOGRAPHICS_FEATURE_SIGNALS: DemographicsFeatureSignal[] = [
  { key: "name", pattern: /\bName\s*:\s*/i },
  { key: "dob", pattern: /\bDOB\s*:\s*\d{1,2}\/\d{1,2}\/\d{4}\b/i },
  { key: "age", pattern: /\bAge\s*:\s*\d+\s*y?\b/i },
  { key: "gender", pattern: /\bGender\s*:\s*(Male|Female|Other)\b/i },
  { key: "patientId", pattern: /\bPatient\s*ID\s*:\s*\d+\b/i },
  { key: "address", pattern: /\bAddress\s*:\s*/i },
  { key: "phone", pattern: /\bPhone\s*:\s*/i },
  { key: "email", pattern: /\bEmail\s*:\s*[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/i },
];

function evaluateDemographicsFeatureSignals(doc: Document): DemographicsSignalEvaluation {
  const normalizedText = (doc.body?.innerText ?? "").replace(/\s+/g, " ").trim();
  const matched: string[] = [];
  const missing: string[] = [];

  for (const signal of DEMOGRAPHICS_FEATURE_SIGNALS) {
    if (signal.pattern.test(normalizedText)) {
      matched.push(signal.key);
    } else {
      missing.push(signal.key);
    }
  }

  return {
    score: matched.length,
    matched,
    missing,
    normalizedText,
  };
}

function sliceDemographicsWindow(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const startLabel = "Patient Demographics";
  const endLabels = [
    "Chief Complaint",
    "Notifications:",
    "Patient Home Practice Management",
    "Are you sure you want to open this PT Note?",
  ];
  const lowerNormalized = normalized.toLowerCase();
  const startIdx = lowerNormalized.indexOf(startLabel.toLowerCase());
  const endIdxCandidates = endLabels
    .map((label) => lowerNormalized.indexOf(label.toLowerCase()))
    .filter((idx) => idx > startIdx);
  const endIdx =
    endIdxCandidates.length > 0 ? endIdxCandidates.sort((left, right) => left - right)[0] : -1;

  if (startIdx >= 0 && endIdx > startIdx) {
    return normalized.slice(startIdx, endIdx).trim();
  }
  if (startIdx >= 0) {
    return normalized.slice(startIdx).trim();
  }
  return normalized;
}

function extractDemographicsSectionFromDoc(doc: Document): DemographicsSection | null {
  const sectionById = doc.querySelector("#PatientDemographics");
  if (sectionById instanceof HTMLElement) {
    const text = sliceDemographicsWindow(sectionById.innerText);
    if (text) return { text, selector: "#PatientDemographics" };
  }

  const sectionByContainer = doc.querySelector("#div_patientinfo");
  if (sectionByContainer instanceof HTMLElement) {
    const text = sliceDemographicsWindow(sectionByContainer.innerText);
    if (text) return { text, selector: "#div_patientinfo" };
  }

  const titleCell = Array.from(doc.querySelectorAll("td, b, span")).find((node) =>
    /patient demographics/i.test(node.textContent ?? ""),
  );
  if (titleCell instanceof HTMLElement) {
    const closestBlock = titleCell.closest("#table_patientinfo, #div_patientinfo, table, tr, td, div");
    if (closestBlock instanceof HTMLElement) {
      const text = sliceDemographicsWindow(closestBlock.innerText);
      if (text) return { text, selector: "closest(patient-demographics-title)" };
    }
  }

  const fallbackWindow = sliceDemographicsWindow(doc.body?.innerText ?? "");
  if (fallbackWindow) {
    return { text: fallbackWindow, selector: "document-body-window" };
  }

  return null;
}

function tryMdlandDemographicsViaDoctorSpecOfficeVisit(
  targets: SearchTarget[],
  isElementNode: (value: unknown) => value is HTMLElement,
  logDebug: (stage: string, details?: unknown) => void,
): ExtractDemographicsResponse | null {
  const doctorSpecs = targets
    .filter((t) => /\/eClinic\/ov_doctor_spec\.aspx/i.test(t.sourceUrl))
    .sort((a, b) => {
      const wa = getWorkareaTokenFromPath(a.path);
      const wb = getWorkareaTokenFromPath(b.path);
      if (wa === "workarea1" && wb !== "workarea1") return -1;
      if (wb === "workarea1" && wa !== "workarea1") return 1;
      return 0;
    });

  logDebug("mdland-officevisit-demographics: candidate ov_doctor_spec frames", {
    count: doctorSpecs.length,
    sample: doctorSpecs.slice(0, 6).map((t) => ({ path: t.path, url: t.sourceUrl })),
  });

  for (const spec of doctorSpecs) {
    const officeVisitFrame =
      spec.doc.getElementById("OfficeVisit") ??
      (spec.doc.querySelector(
        'iframe#OfficeVisit, iframe[name="OfficeVisit"], frame#OfficeVisit, frame[name="OfficeVisit"]',
      ) as HTMLElement | null);
    if (!isElementNode(officeVisitFrame)) {
      logDebug("mdland-officevisit-demographics: skip - no #OfficeVisit", { path: spec.path });
      continue;
    }

    const innerDoc =
      (officeVisitFrame as HTMLIFrameElement).contentDocument ??
      (officeVisitFrame as HTMLIFrameElement).contentWindow?.document ??
      null;
    if (!innerDoc) {
      logDebug("mdland-officevisit-demographics: skip - OfficeVisit document inaccessible", {
        path: spec.path,
      });
      continue;
    }

    const demographicsSection = extractDemographicsSectionFromDoc(innerDoc);
    if (demographicsSection == null || !demographicsSection.text.trim()) {
      logDebug("mdland-officevisit-demographics: skip - empty section in OfficeVisit", {
        path: spec.path,
        innerUrl: innerDoc.location?.href ?? "",
      });
      continue;
    }

    const signal = evaluateDemographicsFeatureSignals(innerDoc);
    const innerUrl = innerDoc.location?.href ?? "";
    const innerPath = `${spec.path}>iframe[OfficeVisit]`;

    logDebug("mdland-officevisit-demographics: hit", {
      doctorSpecPath: spec.path,
      doctorSpecUrl: spec.sourceUrl,
      innerUrl,
      innerPath,
      selector: demographicsSection.selector,
      textLength: demographicsSection.text.length,
      signalScore: signal.score,
    });

    const textPreview = signal.normalizedText.slice(0, 800);
    return {
      ok: true,
      data: {
        profileId: "mdland-officevisit-demographics",
        selectorMatched: demographicsSection.selector,
        demographicsText: demographicsSection.text,
        sourceUrl: innerUrl || spec.sourceUrl,
        sourcePath: innerPath,
        signalSummary: {
          score: signal.score,
          matched: signal.matched,
          missing: signal.missing,
        },
        textPreview,
      },
    };
  }

  logDebug("mdland-officevisit-demographics: no hit - falling back to generic scan");
  return null;
}

export function extractEmrDemographicsFromTargets({
  hostname,
  targets,
  isElementNode,
  logDebug,
}: ExtractDemographicsArgs): ExtractDemographicsResponse {
  try {
    if (isMdlandEclinicHost(hostname)) {
      const officeVisitResult = tryMdlandDemographicsViaDoctorSpecOfficeVisit(
        targets,
        isElementNode,
        logDebug,
      );
      if (officeVisitResult != null) {
        return officeVisitResult;
      }
    }

    const scoredTargets = targets.map((target) => {
      const signal = evaluateDemographicsFeatureSignals(target.doc);
      const demographicsSection = extractDemographicsSectionFromDoc(target.doc);
      return { target, signal, demographicsSection };
    });

    const officeVisitWithSection =
      scoredTargets.find(
        ({ target, demographicsSection }) =>
          /\/eClinic\/officevisit_Spec\.aspx/i.test(target.sourceUrl) && demographicsSection != null,
      ) ?? null;

    const bestSectionBySignal =
      [...scoredTargets]
        .filter(({ demographicsSection }) => demographicsSection != null)
        .sort((left, right) => right.signal.score - left.signal.score)[0] ?? null;

    const highestSignalTarget =
      [...scoredTargets].sort((left, right) => right.signal.score - left.signal.score)[0] ?? null;
    const matchedWithSection = officeVisitWithSection ?? bestSectionBySignal;
    const fallbackTarget = highestSignalTarget ?? scoredTargets[0] ?? null;
    if (!fallbackTarget) {
      return { ok: false, error: "No accessible document/frame found" };
    }

    const selected = matchedWithSection ?? fallbackTarget;
    const fullPageHtml = selected.target.doc.documentElement?.outerHTML ?? "";
    if (!fullPageHtml) {
      return { ok: false, error: "Could not read HTML from selected document/frame" };
    }

    const textPreview = selected.signal.normalizedText.slice(0, 800);
    const demographicsSection = selected.demographicsSection;
    const demographicsText = demographicsSection?.text ?? selected.signal.normalizedText;
    const demographicsSelector = demographicsSection?.selector ?? "fallback:document-body-text";

    logDebug("html captured from document/frame", {
      htmlLength: fullPageHtml.length,
      sourceUrl: selected.target.sourceUrl,
      sourcePath: selected.target.path,
      totalDocsScanned: targets.length,
      officeVisitFrameDetected: officeVisitWithSection != null,
      signalScore: selected.signal.score,
      matchedSignals: selected.signal.matched,
      missingSignals: selected.signal.missing,
      textPreview,
      demographicsSelector,
      demographicsTextLength: demographicsText.length,
      usedFallbackText: demographicsSection == null,
    });

    return {
      ok: true,
      data: {
        profileId: "full-page",
        selectorMatched: demographicsSelector,
        demographicsText,
        sourceUrl: selected.target.sourceUrl,
        sourcePath: selected.target.path,
        signalSummary: {
          score: selected.signal.score,
          matched: selected.signal.matched,
          missing: selected.signal.missing,
        },
        textPreview,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to extract EMR demographics";
    return { ok: false, error: message };
  }
}
