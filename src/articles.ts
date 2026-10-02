import { load } from "cheerio";
import type { Evidence } from "./model.js";

/** Extract explicit public facts only. Unverified article reports stay research leads. */
export function extractArticle(html: string, lead: Evidence): Evidence {
  const $ = load(html);
  if (
    $("#challenge-container").length ||
    $('script[src*="awswaf.com"]').length ||
    /just a moment|verify you are human/i.test($("title").text())
  )
    return {
      ...lead,
      summary:
        "Article discovery succeeded, but the publisher returned an access challenge. No event or roster details were extracted. Open the source normally and use reviewed evidence import if available.",
    };
  $("script,style,nav,header,footer").remove();
  const article = $("article,.entry-content,.td-post-content").first();
  if (!article.length)
    return {
      ...lead,
      summary:
        "Article discovered, but no supported article body was available. Event details and list contents remain unverified.",
    };
  const text = article.text().replace(/\s+/g, " ").trim();
  const headings = article
    .find("h2,h3,h4")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get();
  const templars = headings.filter((h) => /black templars/i.test(h));
  const explicitFormat = text.match(
    /(?:points limit|points total|game size)\s*:?\s*(1[,.]?000|2[,.]?000)\b/i,
  );
  const size = explicitFormat
    ? Number(explicitFormat[1].replace(/[,.]/g, ""))
    : null;
  const patch = text.match(
    /(?:MFM|Munitorum Field Manual)\s*(?:version|v)?\s*(\d+\.\d+)/i,
  );
  const facts = templars.map((h) => {
    const place = h.match(/\b(\d+)(?:st|nd|rd|th)\s*(?:place)?\b/i)?.[1];
    const record = h.match(/\b\d+-\d+(?:-\d+)?\b/)?.[0];
    return `Black Templars heading found${place ? `; placing reported: ${place}` : ""}${record ? `; record reported: ${record}` : ""}.`;
  });
  return {
    ...lead,
    pointsLimit: size === 1000 || size === 2000 ? size : null,
    rulesVersion: patch ? "MFM " + patch[1] : null,
    faction: /black templars/i.test(text) ? "Black Templars" : null,
    summary: [
      `Readable public report. ${templars.length} Black Templars result heading(s) detected.`,
      ...facts,
      "Event date and contextual claims require review before promotion to an event result.",
    ]
      .join(" ")
      .slice(0, 1400),
  };
}
