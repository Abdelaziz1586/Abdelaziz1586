"use strict";

/**
 * Self-hosted replacement for the komarev.com profile-view-counter badge.
 *
 * GitHub's traffic API (/repos/:owner/:repo/traffic/views) only retains the
 * last 14 days of daily view counts, and only the repo owner can read it.
 * This script pulls that window on a schedule (see the workflow) and folds
 * any days it hasn't seen yet into data/views.json, so the running total
 * survives past the 14-day window instead of resetting.
 *
 * Output:
 *   data/views.json   -- { total, uniques, lastSeenDate, byDate: {...} }
 *   assets/views.svg  -- small badge rendered from that running total
 */

const fs = require("fs");
const path = require("path");
const { Octokit } = require("@octokit/rest");
const { THEME } = require("./lib/svg");

const USERNAME = process.env.GH_USERNAME || process.env.GITHUB_REPOSITORY_OWNER;
const TOKEN = process.env.GH_PAT || process.env.GITHUB_TOKEN;
// The profile README lives in a repo with the same name as the username.
const REPO = process.env.GH_PROFILE_REPO || USERNAME;

const DATA_PATH = path.join(__dirname, "..", "data", "views.json");
const OUT_PATH = path.join(__dirname, "..", "assets", "views.svg");

if (!USERNAME || !TOKEN) {
  console.error("Missing GH_USERNAME/GITHUB_REPOSITORY_OWNER or GH_PAT/GITHUB_TOKEN.");
  process.exit(1);
}

const octokit = new Octokit({ auth: TOKEN });

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  } catch {
    return { total: 0, uniques: 0, lastSeenDate: null, byDate: {} };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2) + "\n");
}

function renderBadge(total) {
  const label = "profile views";
  const value = total.toLocaleString();
  const width = 190;
  const height = 26;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}: ${value}">
  <style>
    .l { font: 400 11.5px 'JetBrains Mono','Consolas',monospace; fill: ${THEME.textDim}; }
    .v { font: 600 11.5px 'JetBrains Mono','Consolas',monospace; fill: ${THEME.accent}; }
  </style>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="6" fill="${THEME.bg}" stroke="${THEME.border}"/>
  <text x="10" y="17" class="l">${label}</text>
  <text x="${width - 10}" y="17" text-anchor="end" class="v">${value}</text>
</svg>`;
}

async function main() {
  const state = loadState();

  const { data } = await octokit.request(
    "GET /repos/{owner}/{repo}/traffic/views",
    { owner: USERNAME, repo: REPO }
  );

  for (const day of data.views) {
    const date = day.timestamp.slice(0, 10);
    if (!(date in state.byDate)) {
      state.byDate[date] = { count: day.count, uniques: day.uniques };
    }
  }

  state.total = Object.values(state.byDate).reduce((s, d) => s + d.count, 0);
  state.uniques = Object.values(state.byDate).reduce((s, d) => s + d.uniques, 0);
  state.lastSeenDate = new Date().toISOString().slice(0, 10);

  saveState(state);
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, renderBadge(state.total));

  console.log(`Total tracked views: ${state.total}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
