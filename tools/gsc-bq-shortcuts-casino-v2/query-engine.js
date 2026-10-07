(function (root) {
  "use strict";
  const COLUMNS = ["date", "domain", "clicks", "impressions", "position", "ctr", "site_id", "vertical_id", "network_id", "country", "device", "site_language", "site_country"];
  const URL_COLUMNS = ["date", "domain", "page", "query", "clicks", "impressions", "position", "ctr", "site_id", "vertical_id", "network_id", "country", "device", "resource_id", "resource_type", "site_language", "site_country"];
  const columnsFor = (mode) => mode === "url" ? URL_COLUMNS : COLUMNS;
  const FILTERS = { domainFilter: "domain", countryFilter: "country", deviceFilter: "device", siteIdFilter: "site_id", verticalIdFilter: "vertical_id", networkIdFilter: "network_id", siteLanguageFilter: "site_language", siteCountryFilter: "site_country" };

  function buildSql(report, config) {
    const mode = config.mode || "site";
    if (!["site", "url"].includes(mode) || (report.mode && report.mode !== mode)) throw new Error("Select a report for the active Site or URL tab.");
    const columns = columnsFor(mode);
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
    const filters = { ...FILTERS, ...(mode === "url" ? { pageFilter: "page", queryFilter: "query", resourceTypeFilter: "resource_type" } : {}) };
    for (const [key, column] of Object.entries(filters)) {
      if (config[key]?.trim()) {
        // GoogleSQL double-quoted literals support JSON string escapes. Values
        // cannot terminate the literal, even when they contain quotes or slashes.
        conditions.push(["page", "query"].includes(column)
          ? `CAST(${column} AS STRING) = ${JSON.stringify(config[key].trim())}`
          : `LOWER(CAST(${column} AS STRING)) = LOWER(${JSON.stringify(config[key].trim())})`);
      }
    }
    let body = report.sql.replace(/^(?:\s*--[^\n]*\n)*/, "").trim().replace(/;\s*$/, "");
    if (report.id === "q01") {
      const selected = config.columns || columns;
      if (!selected.length) throw new Error("Select at least one source column.");
      if (selected.some((name) => !columns.includes(name))) throw new Error("Unknown source column selected.");
      body = body.replace("{{COLUMNS}}", [...new Set(selected)].map((name) => `\`${name}\``).join(", "));
    }
    const types = { date: "DATE", clicks: "INT64", impressions: "INT64", ctr: "FLOAT64", position: "FLOAT64" };
    const source = `source_data AS (
  SELECT ${columns.map((name) => `CAST(${name} AS ${types[name] || "STRING"}) AS ${name}`).join(",\n    ")}
  FROM \`${config.projectId}.${config.dataset}.${config.tableName}\`
  ${conditions.length ? "WHERE " + conditions.join("\n    AND ") : ""}
)`;
    if (report.id === "q01") return `WITH ${source}\n${body};`;
    const performance = `performance AS (
  SELECT *, date AS data_date,
    (position - ${config.positionBase}) * impressions AS sum_position,
    IF(position IS NOT NULL, impressions, 0) AS position_impressions
  FROM source_data
  WHERE domain IS NOT NULL AND TRIM(domain) != ''${mode === "url" ? " AND page IS NOT NULL AND TRIM(page) != ''" : ""}
)`;
    return `WITH ${source},\n${performance}${/^WITH\s/i.test(body) ? ",\n" + body.replace(/^WITH\s/i, "") : "\n" + body};`;
  }
  function validateSchema(fields, mode = "site") {
    const byName = new Map((fields || []).map((field) => [field.name.toLowerCase(), field]));
    const missing = columnsFor(mode).filter((name) => !byName.has(name));
    if (missing.length) throw new Error(`${mode === "url" ? "URL" : "Site"} source is missing columns: ${missing.join(", ")}. Check this tab's project, dataset, and table.`);
    const nested = columnsFor(mode).filter((name) => byName.get(name).mode === "REPEATED" || ["RECORD", "STRUCT"].includes(byName.get(name).type));
    if (nested.length) throw new Error(`Source columns must be scalar: ${nested.join(", ")}.`);
    return true;
  }
  const api = { COLUMNS, URL_COLUMNS, columnsFor, buildSql, validateSchema };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DomainQueries = api;
})(typeof window !== "undefined" ? window : globalThis);
