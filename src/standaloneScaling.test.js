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

  test("matches the Solid Tours loader geometry and motion", () => {
    expect(embedStyles).toMatch(
      /\.sdm-content-loader__mark\s*{[^}]*width:\s*5rem[^}]*height:\s*5rem[^}]*border-radius:\s*1\.5rem/s
    );
    expect(embedStyles).toMatch(
      /\.sdm-content-loader__title\s*{[^}]*margin:\s*1\.25rem 0 0\.55rem[^}]*font-size:\s*clamp\(1\.8rem, 4vw, 2\.8rem\)/s
    );
    expect(embedStyles).toMatch(
      /\.sdm-content-loader\s*{[^}]*font-family:\s*Manrope, Inter, ui-sans-serif, system-ui/s
    );
    expect(embedStyles).toMatch(
      /\.sdm-content-loader__title\s*{[^}]*font-weight:\s*700/s
    );
    expect(embedStyles).not.toMatch(
      /\.sdm-content-loader__title\s*{[^}]*line-height\s*:/s
    );
    expect(embedStyles).toMatch(
      /\.sdm-content-loader__rail\s*{[^}]*width:\s*min\(18rem, 70vw\)[^}]*margin-top:\s*1\.5rem/s
    );
    expect(embedStyles).toMatch(
      /@keyframes\s+sdm-content-loader-progress\s*{[^}]*translateX\(-105%\)[\s\S]*translateX\(243%\)/s
    );
    expect(embedStyles).toMatch(
      /\.sdm-content-loader--files\s*{[^}]*height:\s*100%[^}]*flex:\s*1[^}]*min-height:\s*0/s
    );
  });
});
