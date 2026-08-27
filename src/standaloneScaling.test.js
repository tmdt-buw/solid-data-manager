const fs = require("fs");
const path = require("path");

describe("standalone scaling", () => {
  const appStyles = fs.readFileSync(path.resolve(__dirname, "App.css"), "utf8");
  const embedStyles = fs.readFileSync(
    path.resolve(__dirname, "components/DataManager.css"),
    "utf8"
  );
  const embedEntry = fs.readFileSync(
    path.resolve(__dirname, "embed/DataManagerEmbed.jsx"),
    "utf8"
  );
  const standaloneEntry = fs.readFileSync(
    path.resolve(__dirname, "index.js"),
    "utf8"
  );

  test("uses zoom only outside Safari and leaves Safari unscaled", () => {
    expect(appStyles).toMatch(
      /body\s*\{[^}]*zoom:\s*var\(--solid-data-manager-standalone-scale\)/s
    );
    expect(appStyles).toMatch(
      /html\.browser-safari\s+body\s*\{[^}]*zoom:\s*1/s
    );
    expect(appStyles).toMatch(
      /html\.browser-safari\s*\{[^}]*--dataspace-scaled-vh:\s*100vh/s
    );
    expect(appStyles).toMatch(
      /html\.browser-safari\s*\{[^}]*--dataspace-scaled-vh:\s*100dvh/s
    );
    expect(appStyles).not.toMatch(
      /body\s*>\s*#root\s*\{[^}]*transform\s*:/s
    );
    expect(appStyles).not.toMatch(
      /transform:\s*scale\(var\(--solid-data-manager-standalone-scale\)\)/
    );
  });

  test("runs Safari detection only from the standalone entry", () => {
    expect(standaloneEntry).toMatch(
      /import\s*\{\s*markSafariBrowser\s*\}\s*from\s*["']\.\/safariDetection["']/
    );
    expect(standaloneEntry).toMatch(/markSafariBrowser\(\)/);
    expect(embedEntry).not.toMatch(/safariDetection|markSafariBrowser/);
  });

  test("keeps standalone scaling out of the embed entry and styles", () => {
    expect(embedEntry).not.toMatch(/App\.css/);
    expect(embedStyles).not.toMatch(/(^|[;{]\s*)zoom\s*:/m);
    expect(embedStyles).not.toMatch(/body\s*>\s*#root[^}]*transform\s*:/s);
  });
});
