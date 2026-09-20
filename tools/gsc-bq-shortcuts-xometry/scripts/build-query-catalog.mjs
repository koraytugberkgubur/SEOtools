import fs from "node:fs/promises";

const sourcePath = "/Users/koraytugberkgubur/Documents/templater/work/gsc-workbook-inspection/workbook.json";
const outputPath = new URL("../queries.js", import.meta.url);

const workbook = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const rows = workbook[0].values.slice(1).filter((row) => typeof row[0] === "string" && row[0].trim());

const metadata = [
  ["Pages Google stopped serving", "Lifecycle", "Find URLs that earned impressions at the beginning of the export but none at the end."],
  ["URL lifecycle table", "Lifecycle", "Label every served URL as new, active, or dropped."],
  ["Newly served URLs", "Lifecycle", "Find pages appearing in Search for the first time recently."],
  ["Dropped URLs that mattered", "Lifecycle", "Prioritize quiet pages that previously earned meaningful clicks."],
  ["Resurrected URLs", "Lifecycle", "Detect URLs that disappeared for a sustained period and later returned."],
  ["Monthly search footprint", "Lifecycle", "Track URLs served, gained, and lost by month."],
  ["Flapping URLs", "Quality", "Find pages served on only a small share of the days they existed."],
  ["Index status join", "Quality", "Join Search Console performance with a URL Inspection results table."],
  ["Topical coverage decay", "Content", "Find URLs losing query variety before traffic disappears."],
  ["High impressions, low clicks", "CTR", "Build a starting list of visible pages with weak click-through rates."],
  ["Striking-distance pages", "CTR", "Find URLs ranking from positions 5–20 with meaningful demand."],
  ["CTR gap vs. your own curve", "CTR", "Benchmark every page against your site's observed CTR by position."],
  ["Query-level click losses", "Content", "Find exact searches where a visible page received no clicks."],
  ["Cannibalization", "Content", "Reveal queries split across multiple URLs on your site."],
  ["Pages that lost ground", "Content", "Compare current ranking position with each URL's best month."],
  ["Anchor-text candidates", "Internal links", "Assign up to three strong, non-competing query phrases to each URL."],
  ["Internal-link priority", "Internal links", "Rank URLs by missed clicks and likely responsiveness to link support."],
];

const queries = rows.map((row, index) => {
  const [title, category, summary] = metadata[index];
  const sql = row[0]
    .replaceAll("`project-14bbb5ad-29fe-4cce-8fa.searchconsole.searchdata_url_impression`", "`{{TABLE}}`")
    .replaceAll("`project-14bbb5ad-29fe-4cce-8fa.searchconsole.url_inspection`", "`{{INSPECTION_TABLE}}`");
  return {
    id: `q${String(index + 1).padStart(2, "0")}`,
    title,
    category,
    summary,
    sql,
    notes: row[1] || "",
    requiresInspectionTable: sql.includes("{{INSPECTION_TABLE}}"),
  };
});

await fs.writeFile(outputPath, `window.QUERY_CATALOG = ${JSON.stringify(queries, null, 2)};\n`, "utf8");
console.log(`Wrote ${queries.length} queries to ${outputPath.pathname}`);
