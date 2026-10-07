(function (root) {
  "use strict";
  const COLUMNS = ["date", "domain", "clicks", "impressions", "position", "ctr", "site_id", "vertical_id", "network_id", "country", "device", "site_language", "site_country"];
  const FILTERS = { domainFilter: "domain", countryFilter: "country", deviceFilter: "device", siteIdFilter: "site_id", verticalIdFilter: "vertical_id", networkIdFilter: "network_id", siteLanguageFilter: "site_language", siteCountryFilter: "site_country" };

  function buildSql(report, config) {
    for (const key of ["projectId", "dataset", "tableName"]) {
      if (!config[key]) throw new Error("Complete the project, dataset, and table fields first.");
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(config.projectId) ||
        !/^[a-zA-Z0-9_]+$/.test(config.dataset) ||
        !/^[a-zA-Z0-9_-]+$/.test(config.tableName)) {
      throw new Error("Use a project ID, dataset name, and table name without SQL punctuation.");
    }
    if (!["0", "1"].includes(config.positionBase)) throw new Error("Choose a position base.");
    const conditions = [];
    for (const [key, operator] of [["startDate", ">="], ["endDate", "<="]]) {
      const value = config[key];
      if (!value) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
        throw new Error("Enter valid dates in YYYY-MM-DD format.");
      }
      conditions.push(`CAST(date AS DATE) ${operator} DATE '${value}'`);
    }
    if (config.startDate && config.endDate && config.startDate > config.endDate) throw new Error("From date must not be after through date.");
    for (const [key, column] of Object.entries(FILTERS)) {
      if (config[key]?.trim()) {
        // GoogleSQL double-quoted literals support JSON string escapes. Values
        // cannot terminate the literal, even when they contain quotes or slashes.
        conditions.push(`LOWER(CAST(${column} AS STRING)) = LOWER(${JSON.stringify(config[key].trim())})`);
      }
    }
    let body = report.sql.replace(/^(?:\s*--[^\n]*\n)*/, "").trim().replace(/;\s*$/, "");
    if (report.id === "q01") {
      const selected = config.columns || COLUMNS;
      if (!selected.length) throw new Error("Select at least one source column.");
      if (selected.some((name) => !COLUMNS.includes(name))) throw new Error("Unknown source column selected.");
      body = body.replace("{{COLUMNS}}", [...new Set(selected)].map((name) => `\`${name}\``).join(", "));
    }
    const source = `source_data AS (
  SELECT CAST(date AS DATE) AS date, domain, site_id, vertical_id, network_id,
    country, device, CAST(clicks AS INT64) AS clicks,
    CAST(impressions AS INT64) AS impressions, CAST(ctr AS FLOAT64) AS ctr,
    CAST(position AS FLOAT64) AS position, site_language, site_country
  FROM \`${config.projectId}.${config.dataset}.${config.tableName}\`
  ${conditions.length ? "WHERE " + conditions.join("\n    AND ") : ""}
)`;
    if (report.id === "q01") return `WITH ${source}\n${body};`;
    const performance = `performance AS (
  SELECT *, date AS data_date,
    (position - ${config.positionBase}) * impressions AS sum_position,
    IF(position IS NOT NULL, impressions, 0) AS position_impressions
  FROM source_data
  WHERE domain IS NOT NULL AND TRIM(domain) != ''
)`;
    return `WITH ${source},\n${performance}${/^WITH\s/i.test(body) ? ",\n" + body.replace(/^WITH\s/i, "") : "\n" + body};`;
  }
  const api = { COLUMNS, buildSql };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DomainQueries = api;
})(typeof window !== "undefined" ? window : globalThis);
