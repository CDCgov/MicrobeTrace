const fs = require("fs");
const execSync = require("child_process").execSync;

const version = require("./package.json").version;
const commitHash = execSync("git rev-parse --short HEAD").toString().trim();
const buildDate = new Date().toISOString();

const content = `export const version = '${version}';
export const buildDate = '${buildDate}';
export const commitHash = '${commitHash}';`;

fs.writeFileSync("./src/environments/version.prod.ts", content);

console.log("Updated version!", { version, commitHash, buildDate });