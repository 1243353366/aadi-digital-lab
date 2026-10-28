import { cp, readFile, writeFile } from "node:fs/promises";

const source = new URL("../compass/public/", import.meta.url);
const target = new URL("../fullstack/public/compass/", import.meta.url);
await cp(source, target, { recursive: true });
let page = await readFile(new URL("index.html", target), "utf8");
page = page.replace('<html lang="en">', '<html lang="en" data-compass-api-prefix="/api/compass">');
page = page.replaceAll("the Render-hosted service", "the authenticated Digital Lab service");
page = page.replaceAll("the Render-hosted Node service", "the authenticated Digital Lab service");
page = page.replaceAll("Project delivery decision support on Render.", "Project delivery decision support in Digital Lab.");
page = page.replace('<div class="decision-notice">', '<p class="scope-exclusion"><strong>Lab admin sign-in is required before processing.</strong> <a href="/login.html">Sign in</a>, then return to this page. Company information stays separate from the public research tools.</p>\n            <div class="decision-notice">');
page = page.replace('<a href="#how-it-works">How it works</a>', '<a href="/">Digital Lab</a><a href="#how-it-works">How it works</a>');
await writeFile(new URL("index.html", target), page);
await cp(new URL("../compass/LICENSE", import.meta.url), new URL("LICENSE", target));
console.log("Compass assets synced into Digital Lab.");
